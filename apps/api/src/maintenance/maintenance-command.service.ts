import { ConflictException, HttpException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { TenantActorContext, TenantTransactionService } from '../database/tenant-transaction.service';

export type CommandMeta = { idempotencyKey: string; ifMatch?: string; requestId: string };
type ExecuteOptions = { operationScope: string; meta: CommandMeta; requestBody: unknown; currentUpdatedAt?: Date };

const canonicalize=(value:any):any=>{
  if(value===null||typeof value!=='object') return value;
  if(value instanceof Date) return value.toISOString();
  if(Array.isArray(value)) return value.map(canonicalize);
  return Object.keys(value).sort().reduce((out,key)=>{out[key]=canonicalize(value[key]);return out;},{} as Record<string,unknown>);
};
const jsonValue=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const requestHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
export const etagForUpdatedAt=(updatedAt:Date)=>`"${createHash('sha256').update(updatedAt.toISOString()).digest('hex')}"`;

@Injectable()
export class MaintenanceCommandService {
  constructor(private readonly tenant:TenantTransactionService){}

  async execute<T>(ctx:TenantActorContext,options:ExecuteOptions,work:(tx:Prisma.TransactionClient)=>Promise<{body:T;updatedAt:Date}>):Promise<{body:T;etag:string;replayed:boolean}>{
    if(!options.meta.idempotencyKey) throw new HttpException('IDEMPOTENCY_KEY_REQUIRED',400);
    if(options.currentUpdatedAt){
      if(!options.meta.ifMatch) throw new HttpException('PRECONDITION_REQUIRED',428);
      if(options.meta.ifMatch!==etagForUpdatedAt(options.currentUpdatedAt)) throw new ConflictException('CONCURRENT_MODIFICATION');
    }
    const sha=requestHash(options.requestBody);
    return this.tenant.run(ctx,async tx=>{
      const existing=await tx.idempotencyRecord.findFirst({where:{tenantId:ctx.org,actorUserId:ctx.sub,operationScope:options.operationScope,idempotencyKey:options.meta.idempotencyKey}});
      if(existing){
        if(existing.requestSha256!==sha) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        if(existing.status==='COMPLETED'&&existing.responseJson){const stored=existing.responseJson as any;return {body:stored.body as T,etag:String(stored.etag),replayed:true};}
        throw new ConflictException('IDEMPOTENCY_IN_PROGRESS');
      }
      const record=await tx.idempotencyRecord.create({data:{tenantId:ctx.org,actorUserId:ctx.sub,operationScope:options.operationScope,idempotencyKey:options.meta.idempotencyKey,requestSha256:sha,status:'IN_PROGRESS',expiresAt:new Date(Date.now()+86400000),createdBy:ctx.sub,updatedBy:ctx.sub}});
      const result=await work(tx);const etag=etagForUpdatedAt(result.updatedAt);
      await tx.idempotencyRecord.update({where:{id:record.id},data:{status:'COMPLETED',responseStatus:200,responseJson:jsonValue({body:result.body,etag,updatedAt:result.updatedAt.toISOString()}),updatedBy:ctx.sub}});
      return {body:result.body,etag,replayed:false};
    });
  }
}
