import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TenantTransactionService } from '../src/database/tenant-transaction.service';
import { signJwt } from '../src/security/jwt';

const ORG_A='01900000-0000-7000-8000-000000000101';
const USER_A='01900000-0000-7000-8000-000000000001';
const CONTRACTOR_A='01900000-0000-7000-8000-000000000201';
const ORG_B='01920000-0000-7000-8000-000000000101';
const USER_B='01920000-0000-7000-8000-000000000001';
const VIEWER_A='01920000-0000-7000-8000-000000000002';
const CONTRACTOR_B='01920000-0000-7000-8000-000000000201';
const auth=(sub:string,org:string,roles:string[])=>`Bearer ${signJwt({sub,org,roles,email:`${sub}@test.invalid`,typ:'access',jti:randomUUID()},process.env.JWT_ACCESS_SECRET??'dev-only-change-me',3600)}`;

describe('Maintenance visits, technicians and work orders',()=>{
 let app:INestApplication,db:PrismaService,tenant:TenantTransactionService;
 let contractId:string,contractEtag:string,siteA:string,siteB:string,techA:string,techB:string;
 let visitId:string,visitEtag:string,workOrderId:string,workOrderEtag:string,assignmentId:string;
 const runId=`${Date.now()}-${process.pid}`;
 const adminA=auth(USER_A,ORG_A,['ORG_ADMIN','PROJECT_MANAGER']);
 const adminB=auth(USER_B,ORG_B,['ORG_ADMIN','PROJECT_MANAGER']);
 const viewerA=auth(VIEWER_A,ORG_A,['VIEWER']);
 beforeAll(async()=>{
  const m=await Test.createTestingModule({imports:[AppModule]}).compile();
  app=m.createNestApplication();app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.init();
  db=app.get(PrismaService);tenant=app.get(TenantTransactionService);
  await db.organization.upsert({where:{id:ORG_B},update:{name:'Operations Tenant B'},create:{id:ORG_B,name:'Operations Tenant B'}});
  await db.user.upsert({where:{id:USER_B},update:{email:'ops-b@test.invalid',displayName:'Ops B'},create:{id:USER_B,email:'ops-b@test.invalid',displayName:'Ops B',passwordHash:'test'}});
  await db.user.upsert({where:{id:VIEWER_A},update:{email:'ops-viewer@test.invalid',displayName:'Viewer A'},create:{id:VIEWER_A,email:'ops-viewer@test.invalid',displayName:'Viewer A',passwordHash:'test'}});
  await db.membership.upsert({where:{userId_organizationId:{userId:USER_B,organizationId:ORG_B}},update:{roles:['ORG_ADMIN','PROJECT_MANAGER']},create:{id:randomUUID(),userId:USER_B,organizationId:ORG_B,roles:['ORG_ADMIN','PROJECT_MANAGER']}});
  await db.membership.upsert({where:{userId_organizationId:{userId:VIEWER_A,organizationId:ORG_A}},update:{roles:['VIEWER']},create:{id:randomUUID(),userId:VIEWER_A,organizationId:ORG_A,roles:['VIEWER']}});
  await db.contractorProfile.upsert({where:{organizationId:ORG_B},update:{legalName:'Ops Contractor B',commercialRegistrationNo:'3030303030'},create:{id:CONTRACTOR_B,organizationId:ORG_B,legalName:'Ops Contractor B',commercialRegistrationNo:'3030303030',status:'APPROVED'}});
  const clientA=randomUUID(),clientB=randomUUID(),slaA=randomUUID();siteA=randomUUID();siteB=randomUUID();contractId=randomUUID();
  await tenant.run({org:ORG_A,sub:USER_A},async tx=>{
   await tx.client.create({data:{id:clientA,tenantId:ORG_A,displayName:'Ops Client A',createdBy:USER_A,updatedBy:USER_A}});
   await tx.site.create({data:{id:siteA,tenantId:ORG_A,clientId:clientA,displayName:'Ops Site A',city:'Jazan',createdBy:USER_A,updatedBy:USER_A}});
   await tx.sLAPolicy.create({data:{id:slaA,tenantId:ORG_A,name:`Ops SLA ${runId}`,version:1,responseTargetMinutes:30,arrivalTargetMinutes:60,resolutionTargetMinutes:240,workingHoursPolicy:{},timezone:'Asia/Riyadh',status:'ACTIVE',effectiveFrom:new Date('2026-10-04'),createdBy:USER_A,updatedBy:USER_A}});
   await tx.maintenanceContract.create({data:{id:contractId,tenantId:ORG_A,contractNumber:`MC-OPS-${runId}`,clientId:clientA,contractorId:CONTRACTOR_A,contractType:'PREVENTIVE',startDate:new Date('2026-10-04'),endDate:new Date('2027-10-03'),plannedVisits:12,completedVisits:0,visitFrequencyType:'MONTH',visitFrequencyValue:1,contractValue:10000,vatAmount:1500,totalValue:11500,currency:'SAR',slaPolicyId:slaA,status:'ACTIVE',activatedAt:new Date(),createdBy:USER_A,updatedBy:USER_A}});
   await tx.maintenanceContractSite.create({data:{tenantId:ORG_A,contractId,siteId:siteA,isActive:true,createdBy:USER_A,updatedBy:USER_A}});
  });
  await tenant.run({org:ORG_B,sub:USER_B},async tx=>{
   await tx.client.create({data:{id:clientB,tenantId:ORG_B,displayName:'Ops Client B',createdBy:USER_B,updatedBy:USER_B}});
   await tx.site.create({data:{id:siteB,tenantId:ORG_B,clientId:clientB,displayName:'Ops Site B',city:'Riyadh',createdBy:USER_B,updatedBy:USER_B}});
   techB=randomUUID();
   await tx.technician.create({data:{id:techB,tenantId:ORG_B,contractorId:CONTRACTOR_B,employeeCode:`B-${runId}`,displayName:'Tech B',mobile:'0500000999',status:'ACTIVE',createdBy:USER_B,updatedBy:USER_B}});
  });
 });
 afterAll(async()=>{await app.close()},15000);
 const command=(path:string,token:string,key:string,etag:string,body:any={})=>request(app.getHttpServer()).post(path).set('Authorization',token).set('Idempotency-Key',key).set('If-Match',etag).send(body);

 it('creates and isolates technicians by contractor tenant',async()=>{
  const body={contractorId:CONTRACTOR_A,employeeCode:`A-${runId}`,displayName:'Tech A',mobile:'0500000888'};
  const created=await request(app.getHttpServer()).post('/api/v1/maintenance/technicians').set('Authorization',adminA).set('Idempotency-Key',`tech-${runId}`).send(body).expect(201);
  techA=created.body.id;expect(created.body.status).toBe('ACTIVE');
  await request(app.getHttpServer()).post('/api/v1/maintenance/technicians').set('Authorization',viewerA).set('Idempotency-Key',`viewer-tech-${runId}`).send(body).expect(403);
  await request(app.getHttpServer()).post('/api/v1/maintenance/technicians').set('Authorization',adminA).set('Idempotency-Key',`cross-tech-${runId}`).send({...body,employeeCode:`X-${runId}`,contractorId:CONTRACTOR_B}).expect(404);
  await request(app.getHttpServer()).get(`/api/v1/maintenance/technicians/${techA}`).set('Authorization',adminB).expect(404);
  const list=await request(app.getHttpServer()).get('/api/v1/maintenance/technicians').set('Authorization',adminA).expect(200);
  expect(list.body.some((x:any)=>x.id===techA)).toBe(true);
 });
 it('creates tenant-safe visits, rejects invalid scheduling, and replays idempotently',async()=>{
  const contract=await request(app.getHttpServer()).get(`/api/v1/maintenance/contracts/${contractId}`).set('Authorization',adminA).expect(200);contractEtag=contract.headers.etag;
  const bad={siteId:siteA,visitKind:'PLANNED_MAINTENANCE',scheduledStart:'2026-10-10T12:00:00Z',scheduledEnd:'2026-10-10T11:00:00Z'};
  await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/visits`).set('Authorization',adminA).set('Idempotency-Key',`bad-visit-${runId}`).set('If-Match',contractEtag).send(bad).expect(422);
  await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/visits`).set('Authorization',adminA).set('Idempotency-Key',`cross-visit-${runId}`).set('If-Match',contractEtag).send({...bad,siteId:siteB,scheduledEnd:'2026-10-10T13:00:00Z'}).expect(404);
  const body={siteId:siteA,visitKind:'PLANNED_MAINTENANCE',scheduledStart:'2026-10-10T11:00:00Z',scheduledEnd:'2026-10-10T13:00:00Z'};
  const key=`visit-${runId}`;
  const created=await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/visits`).set('Authorization',adminA).set('Idempotency-Key',key).set('If-Match',contractEtag).send(body).expect(201);
  visitId=created.body.id;expect(created.body.status).toBe('PLANNED');expect(created.body.visitSequence).toBe(1);
  const replay=await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/visits`).set('Authorization',adminA).set('Idempotency-Key',key).set('If-Match',contractEtag).send(body).expect(201);expect(replay.body.id).toBe(visitId);
  const parentAfterFirst=await request(app.getHttpServer()).get(`/api/v1/maintenance/contracts/${contractId}`).set('Authorization',adminA).expect(200);contractEtag=parentAfterFirst.headers.etag;
  const visitCurrent=await request(app.getHttpServer()).get(`/api/v1/maintenance/visits/${visitId}`).set('Authorization',adminA).expect(200);visitEtag=visitCurrent.headers.etag;
  const second=await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/visits`).set('Authorization',adminA).set('Idempotency-Key',`visit-2-${runId}`).set('If-Match',contractEtag).send({...body,scheduledStart:'2026-11-10T11:00:00Z',scheduledEnd:'2026-11-10T13:00:00Z',previousVisitId:visitId}).expect(201);expect(second.body.visitSequence).toBe(2);
  await request(app.getHttpServer()).get(`/api/v1/maintenance/visits/${visitId}`).set('Authorization',adminB).expect(404);
  const list=await request(app.getHttpServer()).get(`/api/v1/maintenance/contracts/${contractId}/visits`).set('Authorization',adminA).expect(200);expect(list.body.map((x:any)=>x.visitSequence)).toEqual(expect.arrayContaining([1,2]));
 });

 it('enforces visit lifecycle order, RBAC, and If-Match',async()=>{
  await command(`/api/v1/maintenance/visits/${visitId}/schedule`,viewerA,`viewer-schedule-${runId}`,visitEtag).expect(403);
  await request(app.getHttpServer()).post(`/api/v1/maintenance/visits/${visitId}/schedule`).set('Authorization',adminA).set('Idempotency-Key',`missing-etag-${runId}`).send({}).expect(428);
  await command(`/api/v1/maintenance/visits/${visitId}/schedule`,adminA,`stale-${runId}`,'"stale"').expect(409);
  const scheduled=await command(`/api/v1/maintenance/visits/${visitId}/schedule`,adminA,`schedule-${runId}`,visitEtag).expect(200);visitEtag=scheduled.headers.etag;expect(scheduled.body.status).toBe('SCHEDULED');
  const confirmed=await command(`/api/v1/maintenance/visits/${visitId}/confirm`,adminA,`confirm-${runId}`,visitEtag).expect(200);visitEtag=confirmed.headers.etag;expect(confirmed.body.status).toBe('CONFIRMED');
  const arrived=await command(`/api/v1/maintenance/visits/${visitId}/arrive`,adminA,`arrive-${runId}`,visitEtag).expect(200);visitEtag=arrived.headers.etag;expect(arrived.body.status).toBe('ARRIVED');
  const started=await command(`/api/v1/maintenance/visits/${visitId}/start`,adminA,`start-${runId}`,visitEtag).expect(200);visitEtag=started.headers.etag;expect(started.body.status).toBe('IN_PROGRESS');
 });
 it('creates work orders from visit ownership and isolates tenant reads',async()=>{
  const body={serviceType:'PREVENTIVE',priority:'HIGH',scheduledStart:'2026-10-10T11:30:00Z',slaDeadline:'2026-10-10T15:00:00Z'};
  const created=await request(app.getHttpServer()).post(`/api/v1/maintenance/visits/${visitId}/work-orders`).set('Authorization',adminA).set('Idempotency-Key',`wo-${runId}`).set('If-Match',visitEtag).send(body).expect(201);
  workOrderId=created.body.id;expect(created.body).toMatchObject({contractId,visitId,siteId:siteA,contractorId:CONTRACTOR_A,status:'DRAFT'});
  const current=await request(app.getHttpServer()).get(`/api/v1/maintenance/work-orders/${workOrderId}`).set('Authorization',adminA).expect(200);workOrderEtag=current.headers.etag;
  await request(app.getHttpServer()).get(`/api/v1/maintenance/work-orders/${workOrderId}`).set('Authorization',adminB).expect(404);
  const visitList=await request(app.getHttpServer()).get(`/api/v1/maintenance/visits/${visitId}/work-orders`).set('Authorization',adminA).expect(200);expect(visitList.body.some((x:any)=>x.id===workOrderId)).toBe(true);
  const all=await request(app.getHttpServer()).get('/api/v1/maintenance/work-orders').set('Authorization',adminA).expect(200);expect(all.body.some((x:any)=>x.id===workOrderId)).toBe(true);
 });

 it('assigns only same-tenant technicians and advances the work order through IN_PROGRESS',async()=>{
  await request(app.getHttpServer()).post(`/api/v1/maintenance/work-orders/${workOrderId}/assignments`).set('Authorization',viewerA).set('Idempotency-Key',`viewer-assign-${runId}`).set('If-Match',workOrderEtag).send({technicianId:techA,role:'LEAD_TECHNICIAN'}).expect(403);
  await request(app.getHttpServer()).post(`/api/v1/maintenance/work-orders/${workOrderId}/assignments`).set('Authorization',adminA).set('Idempotency-Key',`cross-assign-${runId}`).set('If-Match',workOrderEtag).send({technicianId:techB,role:'LEAD_TECHNICIAN'}).expect(404);
  const assigned=await request(app.getHttpServer()).post(`/api/v1/maintenance/work-orders/${workOrderId}/assignments`).set('Authorization',adminA).set('Idempotency-Key',`assign-${runId}`).set('If-Match',workOrderEtag).send({technicianId:techA,role:'LEAD_TECHNICIAN'}).expect(201);
  assignmentId=assigned.body.id;workOrderEtag=assigned.headers.etag;expect(assigned.body.status).toBe('ASSIGNED');
  const accepted=await command(`/api/v1/maintenance/work-orders/${workOrderId}/assignments/${assignmentId}/accept`,adminA,`accept-${runId}`,workOrderEtag).expect(200);workOrderEtag=accepted.headers.etag;expect(accepted.body.status).toBe('ACCEPTED');
  const arrived=await command(`/api/v1/maintenance/work-orders/${workOrderId}/arrive`,adminA,`wo-arrive-${runId}`,workOrderEtag).expect(200);workOrderEtag=arrived.headers.etag;expect(arrived.body.status).toBe('ARRIVED');
  const started=await command(`/api/v1/maintenance/work-orders/${workOrderId}/start`,adminA,`wo-start-${runId}`,workOrderEtag).expect(200);workOrderEtag=started.headers.etag;expect(started.body.status).toBe('IN_PROGRESS');
  const audit=await db.auditEvent.findMany({where:{organizationId:ORG_A,entityId:workOrderId}});expect(audit.map(x=>x.event)).toEqual(expect.arrayContaining(['maintenance.workorder.created','maintenance.workorder.assigned','maintenance.workorder.arrived','maintenance.workorder.started']));
 });

 it('completes the visit only after its lifecycle reaches IN_PROGRESS',async()=>{
  const current=await request(app.getHttpServer()).get(`/api/v1/maintenance/visits/${visitId}`).set('Authorization',adminA).expect(200);visitEtag=current.headers.etag;
  const completed=await command(`/api/v1/maintenance/visits/${visitId}/complete`,adminA,`complete-${runId}`,visitEtag).expect(200);expect(completed.body.status).toBe('COMPLETED');
 });
});
