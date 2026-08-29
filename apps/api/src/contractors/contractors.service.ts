import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
@Injectable() export class ContractorsService{
 constructor(private db:PrismaService,private audit:AuditService){}
 async get(ctx:any){const p=await this.db.contractorProfile.findUnique({where:{organizationId:ctx.org}}); if(!p) throw new NotFoundException('CONTRACTOR_PROFILE_NOT_FOUND'); return p}
 async update(ctx:any,input:any){const p=await this.db.contractorProfile.update({where:{organizationId:ctx.org},data:{legalName:input.legalName,commercialRegistrationNo:input.commercialRegistrationNo,city:input.city,phone:input.phone}}); await this.audit.append({event:'CONTRACTOR_UPDATED',actorId:ctx.sub,organizationId:ctx.org,entityType:'contractor_profile',entityId:p.id,requestId:input.requestId??'api'}); return p}
 async submit(ctx:any){const p=await this.get(ctx); if(!p.legalName||!p.commercialRegistrationNo) throw new BadRequestException('CONTRACTOR_PROFILE_INCOMPLETE'); const n=await this.db.contractorProfile.update({where:{id:p.id},data:{status:'SUBMITTED'}}); await this.audit.append({event:'CONTRACTOR_SUBMITTED',actorId:ctx.sub,organizationId:ctx.org,entityType:'contractor_profile',entityId:p.id,requestId:'api'}); return n}
}
