import {randomBytes,createHash} from 'crypto';
import {PasswordRecoveryService,sealRecoveryMail,openRecoveryMail} from '../src/auth/password-recovery.service';
import {recoveryMailConfig} from '../src/auth/recovery-mailer';
import {JwtAuthGuard} from '../src/security/jwt-auth.guard';
import {signJwt} from '../src/security/jwt';
import {verifyPassword} from '../src/security/password';
import {AuthService} from '../src/auth/auth.service';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'fs';
import {resolve} from 'path';
const token=randomBytes(32).toString('base64url'),userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',org='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
describe('secure password recovery',()=>{
 let db:any,mailer:any,audit:any,service:PasswordRecoveryService;
 const previous={...process.env};
 beforeEach(()=>{
  process.env.JWT_REFRESH_SECRET='r'.repeat(64);process.env.JWT_ACCESS_SECRET='a'.repeat(64);
  db={$queryRaw:jest.fn().mockResolvedValue([{hits:1}]),$transaction:jest.fn(async cb=>cb(db)),recoveryMail:{create:jest.fn(),update:jest.fn(),updateMany:jest.fn(),findUniqueOrThrow:jest.fn()},recoveryThrottle:{deleteMany:jest.fn()},passwordRecoveryRequest:{findUnique:jest.fn().mockResolvedValue({id:userId,userId,tokenHash:digest(token),expiresAt:new Date(Date.now()+60000),usedAt:null}),updateMany:jest.fn().mockResolvedValue({count:1}),create:jest.fn()},user:{update:jest.fn().mockResolvedValue({id:userId,email:'owner@mostaofi.sa',credentialVersion:1}),findUnique:jest.fn(),findUniqueOrThrow:jest.fn()},authSession:{updateMany:jest.fn()},membership:{findMany:jest.fn().mockResolvedValue([{organizationId:org}])}};
  mailer={ready:jest.fn().mockReturnValue(true),send:jest.fn()};audit={appendWith:jest.fn()};service=new PasswordRecoveryService(db,mailer,audit);
 });
 afterAll(()=>{process.env=previous});
 it('configuration refuses missing sender, origin, TLS settings or runtime key',()=>{
  expect(recoveryMailConfig({})).toBeNull();const config={MOSTAOFI_SMTP_HOST:'smtp.mostaofi.sa',MOSTAOFI_SMTP_PORT:'587',MOSTAOFI_SMTP_USER:'u',MOSTAOFI_SMTP_PASSWORD:'test-only',MOSTAOFI_MAIL_FROM:'support@mostaofi.sa',MOSTAOFI_RECOVERY_ORIGIN:'https://mostaofi.sa',JWT_REFRESH_SECRET:'r'.repeat(64)};
  const valid=recoveryMailConfig(config)!;expect(valid.options).toMatchObject({requireTLS:true,tls:{rejectUnauthorized:true},debug:false,disableFileAccess:true,disableUrlAccess:true});
  for(const patch of [{MOSTAOFI_SMTP_PORT:'25'},{MOSTAOFI_RECOVERY_ORIGIN:'http://mostaofi.sa'},{MOSTAOFI_RECOVERY_ORIGIN:'https://mostaofi.sa/evil'},{MOSTAOFI_MAIL_FROM:'a@b.sa\r\nbcc:x@b.sa'},{JWT_REFRESH_SECRET:'short'}])expect(recoveryMailConfig({...config,...patch})).toBeNull();
 });
 it('known and unknown emails take the same queue path with encrypted payload and no account lookup',async()=>{
  for(const email of ['OWNER@MOSTAOFI.SA','unknown@mostaofi.sa'])expect(await service.forgot({email},'127.0.0.1')).toEqual({accepted:true});
  expect(db.user.findUnique).not.toHaveBeenCalled();for(const call of db.recoveryMail.create.mock.calls){const job=call[0].data;expect(job.payload).not.toContain('mostaofi.sa');expect(openRecoveryMail(job.payload).email).toMatch(/@mostaofi.sa$/);expect(job.expiresAt.getTime()-Date.now()).toBeGreaterThan(14*60000)}
  const encrypted=sealRecoveryMail({token});expect(encrypted).not.toContain(token);expect(openRecoveryMail(encrypted)).toEqual({token});expect(()=>openRecoveryMail(encrypted.replace(/.$/,'!'))).toThrow();
 });
 it('does not queue on configuration failure or throttle rejection and does not trust a forged IP',async()=>{
  mailer.ready.mockReturnValue(false);await expect(service.forgot({email:'a@b.sa'},'ip')).rejects.toThrow('RECOVERY_UNAVAILABLE');expect(db.recoveryMail.create).not.toHaveBeenCalled();mailer.ready.mockReturnValue(true);db.$queryRaw.mockResolvedValue([]);await expect(service.forgot({email:'a@b.sa'},'ip')).rejects.toThrow('RECOVERY_TRY_LATER');expect(db.recoveryMail.create).not.toHaveBeenCalled();
  process.env.MOSTAOFI_REGISTRATION_KEY='secret';expect(service.clientIP({ip:'caller',headers:{'x-recovery-ip':'1.2.3.4','x-registration-key':'bad'}})).toBe('caller');expect(service.clientIP({ip:'caller',headers:{'x-recovery-ip':'1.2.3.4','x-registration-key':'secret'}})).toBe('1.2.3.4');
 });
 it('rejects expired, consumed, malformed tokens and mismatched passwords before changing credentials',async()=>{
  for(const value of ['bad',token+'x'])await expect(service.reset({token:value,password:'Long-test-password',confirmPassword:'Long-test-password'},'ip','r')).rejects.toThrow('INVALID_RECOVERY_TOKEN');
  await expect(service.reset({token,password:'Long-test-password',confirmPassword:'different'},'ip','r')).rejects.toThrow('INVALID_RECOVERY_PASSWORD');db.passwordRecoveryRequest.findUnique.mockResolvedValue({usedAt:null,expiresAt:new Date(0)});await expect(service.validate({token},'ip')).rejects.toThrow('INVALID_RECOVERY_TOKEN');await expect(service.reset({token,password:'Long-test-password',confirmPassword:'Long-test-password'},'ip','r')).rejects.toThrow('INVALID_RECOVERY_TOKEN');expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('consumes the token atomically, hashes the password, revokes sessions and links, audits and queues a notice',async()=>{
  const password='Long-new-test-password';expect(await service.reset({token,password,confirmPassword:password},'ip','request')).toEqual({reset:true});expect(db.$transaction).toHaveBeenCalledTimes(1);const data=db.user.update.mock.calls[0][0].data;expect(verifyPassword(password,data.passwordHash)).toBe(true);expect(data.passwordHash).not.toContain(password);expect(data.credentialVersion).toEqual({increment:1});expect(data.credentialChangedAt).toBeInstanceOf(Date);expect(db.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId,revokedAt:null}}));expect(db.passwordRecoveryRequest.updateMany).toHaveBeenCalledTimes(2);expect(audit.appendWith.mock.calls[0][1].event).toBe('AUTH_PASSWORD_RESET');expect(db.recoveryMail.create.mock.calls[0][0].data.kind).toBe('NOTICE');
 });
 it('a racing token consumer cannot commit another credential change',async()=>{
  db.passwordRecoveryRequest.updateMany.mockResolvedValue({count:0});await expect(service.reset({token,password:'Long-new-test-password',confirmPassword:'Long-new-test-password'},'ip','r')).rejects.toThrow('INVALID_RECOVERY_TOKEN');expect(db.user.update).not.toHaveBeenCalled();expect(db.authSession.updateMany).not.toHaveBeenCalled();
 });
 it('access and refresh tokens from before a reset are rejected while legacy version-zero tokens remain usable',async()=>{
  const base={sub:userId,org,roles:['ORG_ADMIN'],email:'owner@mostaofi.sa',jti:userId};const old=signJwt({...base,typ:'access'},process.env.JWT_ACCESS_SECRET!,900);const req:any={headers:{authorization:'Bearer '+old}},ctx:any={getHandler:()=>null,getClass:()=>null,switchToHttp:()=>({getRequest:()=>req})};const guard=new JwtAuthGuard({getAllAndOverride:()=>false} as any,db);
  db.user.findUnique.mockResolvedValue({credentialVersion:0});expect(await guard.canActivate(ctx)).toBe(true);db.user.findUnique.mockResolvedValue({credentialVersion:1});await expect(guard.canActivate(ctx)).rejects.toThrow('INVALID_ACCESS_TOKEN');req.headers.authorization='Bearer '+signJwt({...base,ver:1,typ:'access'},process.env.JWT_ACCESS_SECRET!,900);expect(await guard.canActivate(ctx)).toBe(true);
  const refresh=signJwt({...base,typ:'refresh'},process.env.JWT_REFRESH_SECRET!,600);db.authSession.findUnique=jest.fn().mockResolvedValue({id:userId,refreshTokenHash:digest(refresh)});db.authSession.update=jest.fn();await expect(new AuthService(db,audit).refresh(refresh)).rejects.toThrow('REFRESH_REVOKED');expect(db.authSession.update).not.toHaveBeenCalled();
 });
 it('unknown recipient jobs are discarded without issuing credentials or sending mail',async()=>{
  db.$queryRaw.mockResolvedValue([{id:userId}]);db.recoveryMail.findUniqueOrThrow.mockResolvedValue({id:userId,kind:'RESET',payload:sealRecoveryMail({email:'unknown@mostaofi.sa'}),attempts:1,expiresAt:new Date(Date.now()+60000)});db.user.findUnique.mockResolvedValue(null);await service.deliverPending();expect(db.passwordRecoveryRequest.create).not.toHaveBeenCalled();expect(mailer.send).not.toHaveBeenCalled();expect(db.recoveryMail.update).toHaveBeenCalledWith({where:{id:userId},data:{status:'SENT',payload:'',leaseUntil:null}});
 });
 it('a queued request from before the last credential change is discarded',async()=>{
  db.$queryRaw.mockResolvedValue([{id:userId}]);db.recoveryMail.findUniqueOrThrow.mockResolvedValue({id:userId,kind:'RESET',payload:sealRecoveryMail({email:'owner@mostaofi.sa'}),attempts:1,createdAt:new Date(0),expiresAt:new Date(Date.now()+60000)});db.user.findUnique.mockResolvedValue({id:userId,email:'owner@mostaofi.sa'});db.user.findUniqueOrThrow.mockResolvedValue({credentialChangedAt:new Date()});await service.deliverPending();expect(db.passwordRecoveryRequest.create).not.toHaveBeenCalled();expect(mailer.send).not.toHaveBeenCalled();
 });
 it('issues a random token to the stored account email, retains only its hash and scrubs delivered payload',async()=>{
  db.$queryRaw.mockResolvedValue([{id:userId}]);db.recoveryMail.findUniqueOrThrow.mockResolvedValue({id:userId,kind:'RESET',payload:sealRecoveryMail({email:'owner@mostaofi.sa'}),attempts:1,createdAt:new Date(),expiresAt:new Date(Date.now()+60000)});db.user.findUnique.mockResolvedValue({id:userId,email:'owner@mostaofi.sa'});db.user.findUniqueOrThrow.mockResolvedValue({credentialChangedAt:null});await service.deliverPending();
  const [email,kind,issuedToken]=mailer.send.mock.calls[0];expect(email).toBe('owner@mostaofi.sa');expect(kind).toBe('RESET');expect(issuedToken).toMatch(/^[A-Za-z0-9_-]{43}$/);const record=db.passwordRecoveryRequest.create.mock.calls[0][0].data;expect(record.tokenHash).toBe(digest(issuedToken));expect(record).not.toHaveProperty('token');const stored=db.recoveryMail.update.mock.calls[0][0].data.payload;expect(stored).not.toContain(issuedToken);expect(openRecoveryMail(stored).token).toBe(issuedToken);expect(db.recoveryMail.update).toHaveBeenLastCalledWith({where:{id:userId},data:{status:'SENT',payload:'',leaseUntil:null}});
 });
 it('retries delivery with the same token and erases the queue secret on the final SMTP failure',async()=>{
  db.$queryRaw.mockResolvedValue([{id:userId}]);mailer.send.mockRejectedValue(Error('SMTP failure test'));const payload=sealRecoveryMail({email:'owner@mostaofi.sa',token});
  db.recoveryMail.findUniqueOrThrow.mockResolvedValue({id:userId,kind:'RESET',payload,attempts:1});await service.deliverPending();expect(db.passwordRecoveryRequest.create).not.toHaveBeenCalled();expect(mailer.send).toHaveBeenCalledWith('owner@mostaofi.sa','RESET',token);expect(db.recoveryMail.update.mock.calls[0][0].data).toMatchObject({status:'PENDING',leaseUntil:null});expect(db.recoveryMail.update.mock.calls[0][0].data).not.toHaveProperty('payload');
  db.recoveryMail.findUniqueOrThrow.mockResolvedValue({id:userId,kind:'RESET',payload,attempts:3});await service.deliverPending();expect(db.recoveryMail.update).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:'FAILED',payload:'',leaseUntil:null})}));
 });
 it('database migration, atomic throttling and outbox claiming work in embedded PostgreSQL',async()=>{
  const pg=new PGlite();try{await pg.exec('CREATE TABLE users (id UUID PRIMARY KEY)');await pg.exec(readFileSync(resolve(__dirname,'../../../database/migrations/20261009210000_password_recovery/migration.sql'),'utf8'));
   const query=async(strings:TemplateStringsArray,...values:any[])=>{let sql=strings[0];values.forEach((_,i)=>sql+='$'+(i+1)+strings[i+1]);return (await pg.query(sql,values)).rows};db.$queryRaw=query;
   for(let n=0;n<3;n++)await service.forgot({email:'a@b.sa'},'first');await expect(service.forgot({email:'a@b.sa'},'second')).rejects.toThrow('RECOVERY_TRY_LATER');expect((await pg.query('SELECT hits FROM recovery_throttle WHERE key=$1',[digest('mostaofi:recovery-rate:request-email:a@b.sa')])).rows).toEqual([{hits:3}]);
   await pg.query("INSERT INTO recovery_mail (id,kind,payload,expires_at) VALUES ($1,'NOTICE','encrypted',NOW()+INTERVAL '1 hour')",[userId]);
   db.recoveryMail.findUniqueOrThrow.mockResolvedValue({id:userId,kind:'NOTICE',payload:sealRecoveryMail({email:'owner@mostaofi.sa'}),attempts:1});await service.deliverPending();expect(mailer.send).toHaveBeenCalledTimes(1);
   const claimed:any=(await pg.query('SELECT status,attempts,lease_until FROM recovery_mail WHERE id=$1',[userId])).rows[0];expect(claimed.status).toBe('SENDING');expect(claimed.attempts).toBe(1);expect(new Date(claimed.lease_until).getTime()).toBeGreaterThan(Date.now());
   await service.deliverPending();expect(mailer.send).toHaveBeenCalledTimes(1);
  }finally{await pg.close()}
 },20000);
});
