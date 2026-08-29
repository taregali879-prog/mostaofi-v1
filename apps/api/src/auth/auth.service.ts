import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { signJwt, verifyJwt } from '../security/jwt';
import { verifyPassword } from '../security/password';
import { AuditService } from '../audit/audit.service';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
@Injectable()
export class AuthService {
  constructor(private db:PrismaService, private audit:AuditService){}
  async login(email:string,password:string,requestId='login'){
    const user=await this.db.user.findUnique({where:{email},include:{memberships:true}});
    if(!user || !verifyPassword(password,user.passwordHash) || !user.memberships[0]) throw new UnauthorizedException('INVALID_CREDENTIALS');
    const m=user.memberships[0], jti=randomUUID();
    const base={sub:user.id,org:m.organizationId,roles:m.roles,email:user.email,jti};
    const accessToken=signJwt({...base,typ:'access'},process.env.JWT_ACCESS_SECRET??'dev-only-change-me',900);
    const refreshToken=signJwt({...base,typ:'refresh'},process.env.JWT_REFRESH_SECRET??'dev-refresh-change-me',604800);
    await this.db.authSession.create({data:{id:jti,userId:user.id,organizationId:m.organizationId,refreshTokenHash:hash(refreshToken),expiresAt:new Date(Date.now()+604800000)}});
    await this.audit.append({event:'AUTH_LOGIN_SUCCESS',actorId:user.id,organizationId:m.organizationId,entityType:'user',entityId:user.id,requestId});
    return {accessToken,refreshToken,user:{id:user.id,organizationId:m.organizationId,email:user.email,displayName:user.displayName,roles:m.roles}};
  }
  async refresh(token:string){
    let c; try{c=verifyJwt(token,process.env.JWT_REFRESH_SECRET??'dev-refresh-change-me','refresh')}catch{throw new UnauthorizedException('INVALID_REFRESH_TOKEN')}
    const s=await this.db.authSession.findUnique({where:{id:c.jti}}); if(!s||s.revokedAt||s.refreshTokenHash!==hash(token)) throw new UnauthorizedException('REFRESH_REVOKED');
    await this.db.authSession.update({where:{id:s.id},data:{revokedAt:new Date()}});
    const jti=randomUUID(), base={sub:c.sub,org:c.org,roles:c.roles,email:c.email,jti};
    const accessToken=signJwt({...base,typ:'access'},process.env.JWT_ACCESS_SECRET??'dev-only-change-me',900);
    const refreshToken=signJwt({...base,typ:'refresh'},process.env.JWT_REFRESH_SECRET??'dev-refresh-change-me',604800);
    await this.db.authSession.create({data:{id:jti,userId:c.sub,organizationId:c.org,refreshTokenHash:hash(refreshToken),expiresAt:new Date(Date.now()+604800000)}});
    return {accessToken,refreshToken};
  }
  async me(c:any){const u=await this.db.user.findUnique({where:{id:c.sub}}); if(!u) throw new UnauthorizedException(); return {id:u.id,organizationId:c.org,email:u.email,displayName:u.displayName,roles:c.roles}}
}
