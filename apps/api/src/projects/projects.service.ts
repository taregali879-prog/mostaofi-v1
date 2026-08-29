import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
@Injectable() export class ProjectsService{
 constructor(private db:PrismaService,private audit:AuditService){}
 async create(ctx:any,input:any){const p=await this.db.project.create({data:{id:randomUUID(),organizationId:ctx.org,name:input.name,clientName:input.clientName,city:input.city,scope:input.scope,estimatedValue:input.estimatedValue,expectedStartDate:input.expectedStartDate?new Date(input.expectedStartDate):undefined}}); await this.audit.append({event:'PROJECT_CREATED',actorId:ctx.sub,organizationId:ctx.org,entityType:'project',entityId:p.id,requestId:'api',metadata:{name:p.name}}); return p}
 list(ctx:any){return this.db.project.findMany({where:{organizationId:ctx.org},orderBy:{createdAt:'desc'}})}
 async get(ctx:any,id:string){const p=await this.db.project.findFirst({where:{id,organizationId:ctx.org}}); if(!p) throw new NotFoundException('PROJECT_NOT_FOUND'); return p}
 async update(ctx:any,id:string,input:any){await this.get(ctx,id); const p=await this.db.project.update({where:{id},data:{name:input.name,clientName:input.clientName,city:input.city,scope:input.scope,estimatedValue:input.estimatedValue,expectedStartDate:input.expectedStartDate?new Date(input.expectedStartDate):undefined}}); await this.audit.append({event:'PROJECT_UPDATED',actorId:ctx.sub,organizationId:ctx.org,entityType:'project',entityId:id,requestId:'api',metadata:{changed:Object.keys(input)}}); return p}
 async activity(ctx:any,id:string){await this.get(ctx,id); return this.audit.forEntity(ctx.org,'project',id)}
}
