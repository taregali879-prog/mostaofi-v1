import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { signJwt, verifyJwt } from '../security/jwt';
import { hashPassword, verifyPassword } from '../security/password';
import { AuditService } from '../audit/audit.service';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
@Injectable()
export class AuthService {
  constructor(private db:PrismaService, private audit:AuditService){}
  async register(input:any,registrationKey:string){
    const configured=process.env.MOSTAOFI_REGISTRATION_KEY;
    const actual=hash(String(registrationKey??'')),expected=hash(String(configured??''));
    if(!configured||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))throw new UnauthorizedException('REGISTRATION_NOT_AUTHORIZED');
    const email=String(input.email??'').trim().toLowerCase(),displayName=String(input.displayName??'').trim(),organizationName=String(input.organizationName??'').trim(),password=String(input.password??'');
    const allowed=(process.env.MOSTAOFI_REGISTRATION_EMAILS??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(!allowed.includes(email))throw new UnauthorizedException('REGISTRATION_NOT_AUTHORIZED');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||displayName.length<2||displayName.length>100||organizationName.length<2||organizationName.length>150||password.length<12||password.length>128)throw new BadRequestException('INVALID_REGISTRATION');
    if(await this.db.user.findUnique({where:{email}}))throw new ConflictException('ACCOUNT_ALREADY_EXISTS');
    const userId=randomUUID(),organizationId=randomUUID(),passwordHash=hashPassword(password);
    try { await this.db.$transaction(async tx=>{
      await tx.organization.create({data:{id:organizationId,name:organizationName}});
      await tx.user.create({data:{id:userId,email,displayName,passwordHash}});
      await tx.membership.create({data:{id:randomUUID(),userId,organizationId,roles:['ORG_ADMIN','CONTRACTOR_ADMIN']}});
    });
    } catch(error:any) { if(error?.code==='P2002')throw new ConflictException('ACCOUNT_ALREADY_EXISTS'); throw error; }
    return {created:true,email};
  }
  async login(email:string,password:string,requestId='login'){
    if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>128)throw new UnauthorizedException('INVALID_CREDENTIALS');
    email=email.trim().toLowerCase();
    if(process.env.NODE_ENV==='production'&&(/@(partner\.local|example\.test)$/.test(email)))throw new UnauthorizedException('INVALID_CREDENTIALS');
    const user=await this.db.user.findUnique({where:{email},include:{memberships:true}});
    if(!user || !verifyPassword(password,user.passwordHash) || !user.memberships[0]) throw new UnauthorizedException('INVALID_CREDENTIALS');
    const m=user.memberships[0], jti=randomUUID();
    const base={sub:user.id,org:m.organizationId,roles:m.roles,email:user.email,jti,ver:user.credentialVersion};
    const accessToken=signJwt({...base,typ:'access'},process.env.JWT_ACCESS_SECRET??'dev-only-change-me',900);
    const refreshToken=signJwt({...base,typ:'refresh'},process.env.JWT_REFRESH_SECRET??'dev-refresh-change-me',604800);
    await this.db.authSession.create({data:{id:jti,userId:user.id,organizationId:m.organizationId,refreshTokenHash:hash(refreshToken),expiresAt:new Date(Date.now()+604800000)}});
    await this.audit.append({event:'AUTH_LOGIN_SUCCESS',actorId:user.id,organizationId:m.organizationId,entityType:'user',entityId:user.id,requestId});
    return {accessToken,refreshToken,user:{id:user.id,organizationId:m.organizationId,email:user.email,displayName:user.displayName,roles:m.roles}};
  }
  async refresh(token:string){
    let c; try{c=verifyJwt(token,process.env.JWT_REFRESH_SECRET??'dev-refresh-change-me','refresh')}catch{throw new UnauthorizedException('INVALID_REFRESH_TOKEN')}
    const s=await this.db.authSession.findUnique({where:{id:c.jti}}); if(!s||s.revokedAt||s.refreshTokenHash!==hash(token)) throw new UnauthorizedException('REFRESH_REVOKED');
    const user=await this.db.user.findUnique({where:{id:c.sub},select:{credentialVersion:true}});if(!user||(c.ver??0)!==user.credentialVersion)throw new UnauthorizedException('REFRESH_REVOKED');
    await this.db.authSession.update({where:{id:s.id},data:{revokedAt:new Date()}});
    const jti=randomUUID(), base={sub:c.sub,org:c.org,roles:c.roles,email:c.email,jti,ver:user.credentialVersion};
    const accessToken=signJwt({...base,typ:'access'},process.env.JWT_ACCESS_SECRET??'dev-only-change-me',900);
    const refreshToken=signJwt({...base,typ:'refresh'},process.env.JWT_REFRESH_SECRET??'dev-refresh-change-me',604800);
    await this.db.authSession.create({data:{id:jti,userId:c.sub,organizationId:c.org,refreshTokenHash:hash(refreshToken),expiresAt:new Date(Date.now()+604800000)}});
    return {accessToken,refreshToken};
  }
  async me(c:any){const u=await this.db.user.findUnique({where:{id:c.sub}}); if(!u) throw new UnauthorizedException(); return {id:u.id,organizationId:c.org,email:u.email,displayName:u.displayName,roles:c.roles}}
}
