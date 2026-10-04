import { Test } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { TenantTransactionService } from '../src/database/tenant-transaction.service';
import { AuditModule } from '../src/audit/audit.module';
import { AuditService } from '../src/audit/audit.service';
import { DomainEventService } from '../src/audit/domain-event.service';
import { MaintenanceCommandService } from '../src/maintenance/maintenance-command.service';
import { MAINTENANCE_CONTRACT_WRITE_ROLES, MAINTENANCE_INSPECTION_WRITE_ROLES } from '../src/maintenance/maintenance.roles';

const ctx={org:'01900000-0000-7000-8000-000000000101',sub:'01900000-0000-7000-8000-000000000001'};
const statusOf=(e:unknown)=>e instanceof HttpException?e.getStatus():0;
async function expectStatus(p:Promise<unknown>,status:number,message?:string){try{await p;throw new Error('EXPECTED_REJECTION')}catch(e:any){expect(statusOf(e)).toBe(status);if(message)expect(e?.message).toBe(message)}}

describe('Maintenance command infrastructure',()=>{
 let db:PrismaService, tenant:TenantTransactionService, commands:MaintenanceCommandService, audit:AuditService, domain:DomainEventService;
 beforeAll(async()=>{
  const m=await Test.createTestingModule({imports:[DatabaseModule,AuditModule],providers:[MaintenanceCommandService]}).compile();
  db=m.get(PrismaService);tenant=m.get(TenantTransactionService);commands=m.get(MaintenanceCommandService);audit=m.get(AuditService);domain=m.get(DomainEventService);
 });
 afterAll(()=>db.$disconnect());

 it('fails closed without tenant context',async()=>{
  const id=randomUUID();
  await tenant.run(ctx,tx=>tx.client.create({data:{id,tenantId:ctx.org,displayName:'RLS probe',createdBy:ctx.sub,updatedBy:ctx.sub}}));
  const hidden=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE mostaofi_runtime_slice');return tx.client.findUnique({where:{id}})});
  expect(hidden).toBeNull();
  const visible=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE mostaofi_runtime_slice');await tx.$queryRaw`SELECT set_config('app.tenant_id', ${ctx.org}, true)`;await tx.$queryRaw`SELECT set_config('app.actor_user_id', ${ctx.sub}, true)`;return tx.client.findUnique({where:{id}})});
  expect(visible?.id).toBe(id);
  await tenant.run(ctx,tx=>tx.client.delete({where:{id}}));
 });
 it('replays the same idempotency key and rejects changed payload',async()=>{
  const id=randomUUID(), key=`cmd-${randomUUID()}`;let calls=0;
  const run=(name:string)=>commands.execute(ctx,{operationScope:'test.client.create',meta:{idempotencyKey:key,requestId:'idem-test'},requestBody:{name}},async tx=>{
   calls+=1;const row=await tx.client.create({data:{id,tenantId:ctx.org,displayName:name,createdBy:ctx.sub,updatedBy:ctx.sub}});
   return {body:{id:row.id,name:row.displayName},updatedAt:row.updatedAt};
  });
  const first=await run('Idempotent Client');const second=await run('Idempotent Client');
  expect(first.replayed).toBe(false);expect(second.replayed).toBe(true);expect(second.body).toEqual(first.body);expect(calls).toBe(1);
  await expect(run('Changed Client')).rejects.toMatchObject({status:409,message:'IDEMPOTENCY_KEY_REUSED'});
  expect(calls).toBe(1);
  await tenant.run(ctx,tx=>tx.client.delete({where:{id}}));
 });

 it('requires a current ETag and rejects stale concurrency tokens',async()=>{
  const current=new Date('2026-10-04T00:00:00.000Z');
  const work=async()=>({body:{ok:true},updatedAt:new Date('2026-10-04T00:00:01.000Z')});
  await expectStatus(commands.execute(ctx,{operationScope:'test.concurrency.missing',meta:{idempotencyKey:`k-${randomUUID()}`,requestId:'missing'},requestBody:{},currentUpdatedAt:current},work),428,'PRECONDITION_REQUIRED');
  await expect(commands.execute(ctx,{operationScope:'test.concurrency.stale',meta:{idempotencyKey:`k-${randomUUID()}`,ifMatch:'"stale"',requestId:'stale'},requestBody:{},currentUpdatedAt:current},work)).rejects.toMatchObject({status:409,message:'CONCURRENT_MODIFICATION'});
 });

 it('rolls back audit and domain events when the command fails',async()=>{
  const aggregateId=randomUUID(),event=`TEST_ROLLBACK_${aggregateId}`;
  await expect(commands.execute(ctx,{operationScope:'test.rollback',meta:{idempotencyKey:`k-${randomUUID()}`,requestId:'rollback'},requestBody:{aggregateId}},async tx=>{
   await audit.appendWith(tx,{event,actorId:ctx.sub,organizationId:ctx.org,entityType:'test',entityId:aggregateId,requestId:'rollback'});
   await domain.appendWith(tx,{tenantId:ctx.org,eventType:event,aggregateType:'test',aggregateId,payload:{ok:true}});
   throw new Error('ROLLBACK_PROBE');
  })).rejects.toThrow('ROLLBACK_PROBE');
  expect(await db.auditEvent.count({where:{event}})).toBe(0);
  expect(await tenant.run(ctx,tx=>tx.domainEvent.count({where:{eventType:event}}))).toBe(0);
 });
 it('keeps v1.0 role aliases explicit for governed maintenance writes',()=>{
  expect(MAINTENANCE_CONTRACT_WRITE_ROLES).toEqual(expect.arrayContaining(['TENANT_ADMIN','ORG_ADMIN','OPERATIONS_MANAGER','PROJECT_MANAGER']));
  expect(MAINTENANCE_INSPECTION_WRITE_ROLES).toContain('ENGINEER');
 });
});
