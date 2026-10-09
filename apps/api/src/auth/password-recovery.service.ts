import { BadRequestException, HttpException, Injectable, Logger, OnModuleInit, OnModuleDestroy, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../security/password';
import { RecoveryMailer } from './recovery-mailer';
const TTL=15*60*1000;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const validToken=(token:unknown):token is string=>typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token);
const key=()=>createHash('sha256').update('mostaofi:recovery-mail:v1:'+process.env.JWT_REFRESH_SECRET).digest();
export function sealRecoveryMail(value:unknown){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(x=>x.toString('base64url')).join('.')}
export function openRecoveryMail(value:string){const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64url'));const cipher=createDecipheriv('aes-256-gcm',key(),iv);cipher.setAuthTag(tag);return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8'))}

@Injectable()
export class PasswordRecoveryService implements OnModuleInit,OnModuleDestroy {
 private timer?:ReturnType<typeof setInterval>;private working=false;private readonly logger=new Logger('PasswordRecovery');
 constructor(private db:PrismaService,private mail:RecoveryMailer,private audit:AuditService){}
 status(){return {available:this.mail.ready(),expiresInMinutes:15}}
 onModuleInit(){if(process.env.MOSTAOFI_RECOVERY_WORKER_DISABLED==='true'&&process.env.NODE_ENV!=='production')return;this.timer=setInterval(()=>{void this.deliverPending().catch(()=>this.logger.error('RECOVERY_QUEUE_UNAVAILABLE'))},5000);this.timer.unref()}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer)}
 // Only a BFF that possesses the existing shared runtime key may forward an IP.
 clientIP(req:any){const configured=process.env.MOSTAOFI_REGISTRATION_KEY,provided=String(req.headers?.['x-registration-key']||'');const forwarded=String(req.headers?.['x-recovery-ip']||'');if(configured&&timingSafeEqual(Buffer.from(digest(configured)),Buffer.from(digest(provided)))&&/^[0-9a-fA-F:.]{3,64}$/.test(forwarded))return forwarded;return String(req.ip||'unknown').slice(0,100)}
 private async throttle(value:string,limit:number){
  const id=digest('mostaofi:recovery-rate:'+value);
  const rows=await this.db.$queryRaw<Array<{hits:number}>>`INSERT INTO recovery_throttle (key,hits,expires_at) VALUES (${id},1,NOW()+INTERVAL '15 minutes') ON CONFLICT (key) DO UPDATE SET hits=CASE WHEN recovery_throttle.expires_at<=NOW() THEN 1 ELSE recovery_throttle.hits+1 END,expires_at=CASE WHEN recovery_throttle.expires_at<=NOW() THEN EXCLUDED.expires_at ELSE recovery_throttle.expires_at END WHERE recovery_throttle.expires_at<=NOW() OR recovery_throttle.hits<${limit} RETURNING hits`;
  if(!rows.length)throw new HttpException('RECOVERY_TRY_LATER',429);
 }
 async forgot(input:any,ip:string){
  if(!this.mail.ready())throw new ServiceUnavailableException('RECOVERY_UNAVAILABLE');
  const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
  if(email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new BadRequestException('INVALID_RECOVERY_EMAIL');
  await this.throttle('request-ip:'+ip,30);await this.throttle('request-email:'+email,3);
  // Both known and unknown emails follow exactly the same durable queue path.
  await this.db.recoveryMail.create({data:{id:randomUUID(),kind:'RESET',payload:sealRecoveryMail({email}),expiresAt:new Date(Date.now()+TTL)}});
  return {accepted:true};
 }
 async validate(input:any,ip:string){await this.throttle('validate:'+ip,30);if(!validToken(input?.token))throw new UnauthorizedException('INVALID_RECOVERY_TOKEN');const row=await this.db.passwordRecoveryRequest.findUnique({where:{tokenHash:digest(input.token)}});if(!row||row.usedAt||row.expiresAt.getTime()<=Date.now())throw new UnauthorizedException('INVALID_RECOVERY_TOKEN');return {valid:true}}
 async reset(input:any,ip:string,requestId:string){
  await this.throttle('reset:'+ip,10);
  if(!validToken(input?.token))throw new UnauthorizedException('INVALID_RECOVERY_TOKEN');
  if(typeof input.password!=='string'||input.password.length<12||input.password.length>128||input.password!==input.confirmPassword)throw new BadRequestException('INVALID_RECOVERY_PASSWORD');
  const record=await this.db.passwordRecoveryRequest.findUnique({where:{tokenHash:digest(input.token)}});
  if(!record||record.usedAt||record.expiresAt.getTime()<=Date.now())throw new UnauthorizedException('INVALID_RECOVERY_TOKEN');
  const passwordHash=hashPassword(input.password);
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM users WHERE id=${record.userId}::uuid FOR UPDATE`;
   const now=new Date(),won=await tx.passwordRecoveryRequest.updateMany({where:{id:record.id,usedAt:null,expiresAt:{gt:now}},data:{usedAt:now}});
   if(won.count!==1)throw new UnauthorizedException('INVALID_RECOVERY_TOKEN');
   const user=await tx.user.update({where:{id:record.userId},data:{passwordHash,credentialVersion:{increment:1},credentialChangedAt:now}});
   await tx.authSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:now}});
   await tx.passwordRecoveryRequest.updateMany({where:{userId:user.id,usedAt:null},data:{usedAt:now}});
   const memberships=await tx.membership.findMany({where:{userId:user.id}});
   for(const m of memberships)await this.audit.appendWith(tx,{event:'AUTH_PASSWORD_RESET',actorId:user.id,organizationId:m.organizationId,entityType:'user',entityId:user.id,requestId});
   await tx.recoveryMail.create({data:{id:randomUUID(),kind:'NOTICE',payload:sealRecoveryMail({email:user.email}),expiresAt:new Date(Date.now()+86400000)}});
  });
  return {reset:true};
 }
 async deliverPending(){
  if(this.working||!this.mail.ready())return;this.working=true;
  try{
   await this.db.recoveryMail.updateMany({where:{expiresAt:{lte:new Date()},status:{in:['PENDING','SENDING']}},data:{status:'EXPIRED',payload:'',leaseUntil:null}});
   await this.db.recoveryThrottle.deleteMany({where:{expiresAt:{lte:new Date()}}});
   const rows=await this.db.$queryRaw<Array<{id:string}>>`UPDATE recovery_mail SET status='SENDING',attempts=attempts+1,lease_until=NOW()+INTERVAL '60 seconds' WHERE id=(SELECT id FROM recovery_mail WHERE (status='PENDING' OR (status='SENDING' AND lease_until<NOW())) AND available_at<=NOW() AND expires_at>NOW() AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`;
   if(!rows.length)return;
   const job=await this.db.recoveryMail.findUniqueOrThrow({where:{id:rows[0].id}});
   try{
    let payload=openRecoveryMail(job.payload);
    if(job.kind==='RESET'){
     if(!payload.token){
      const user=await this.db.user.findUnique({where:{email:payload.email}});
      if(!user||(/@(partner\.local|example\.test)$/.test(user.email)&&process.env.NODE_ENV==='production')){await this.finish(job.id);return}
      payload={email:user.email,token:randomBytes(32).toString('base64url')};
      // Serialize reset issuance with password changes for the same account.
      const issued=await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;const current=await tx.user.findUniqueOrThrow({where:{id:user.id}});if(current.credentialChangedAt&&current.credentialChangedAt>=job.createdAt)return false;await tx.passwordRecoveryRequest.create({data:{id:job.id,userId:user.id,tokenHash:digest(payload.token),expiresAt:job.expiresAt}});await tx.recoveryMail.update({where:{id:job.id},data:{payload:sealRecoveryMail(payload)}});return true});if(!issued){await this.finish(job.id);return}
     }
     const token=await this.db.passwordRecoveryRequest.findUnique({where:{id:job.id}});if(!token||token.usedAt||token.expiresAt.getTime()<=Date.now()){await this.finish(job.id);return}
    }
    await this.mail.send(payload.email,job.kind as 'RESET'|'NOTICE',payload.token);await this.finish(job.id);
   }catch{await this.db.recoveryMail.update({where:{id:job.id},data:{status:job.attempts>=3?'FAILED':'PENDING',...(job.attempts>=3?{payload:''}:{}),leaseUntil:null,availableAt:new Date(Date.now()+30000)}});this.logger.warn('RECOVERY_MAIL_RETRY_OR_FAILURE')}
  }finally{this.working=false}
 }
 private finish(id:string){return this.db.recoveryMail.update({where:{id},data:{status:'SENT',payload:'',leaseUntil:null}})}
}
