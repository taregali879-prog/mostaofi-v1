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
const ORG_B='01910000-0000-7000-8000-000000000101';
const USER_B='01910000-0000-7000-8000-000000000001';
const VIEWER_A='01910000-0000-7000-8000-000000000002';
const CONTRACTOR_B='01910000-0000-7000-8000-000000000201';
const CLIENT_A='01910000-0000-7000-8000-000000000301';
const CLIENT_B='01910000-0000-7000-8000-000000000302';
const SITE_A='01910000-0000-7000-8000-000000000401';
const SITE_B='01910000-0000-7000-8000-000000000402';
const auth=(sub:string,org:string,roles:string[])=>`Bearer ${signJwt({sub,org,roles,email:`${sub}@test.invalid`,typ:'access',jti:randomUUID()},process.env.JWT_ACCESS_SECRET??'dev-only-change-me',3600)}`;

describe('Governed maintenance SLA and contracts',()=>{
 let app:INestApplication,db:PrismaService,tenant:TenantTransactionService;
 let slaA:string,slaB:string,contractId:string,contractEtag:string;
 const runId=`${Date.now()}-${process.pid}`;
 const adminA=auth(USER_A,ORG_A,['ORG_ADMIN','PROJECT_MANAGER']);
 const adminB=auth(USER_B,ORG_B,['ORG_ADMIN','PROJECT_MANAGER']);
 const viewerA=auth(VIEWER_A,ORG_A,['VIEWER']);
 beforeAll(async()=>{
  const m=await Test.createTestingModule({imports:[AppModule]}).compile();app=m.createNestApplication();app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.init();
  db=app.get(PrismaService);tenant=app.get(TenantTransactionService);
  await db.organization.upsert({where:{id:ORG_B},update:{name:'Tenant B'},create:{id:ORG_B,name:'Tenant B'}});
  await db.user.upsert({where:{id:USER_B},update:{email:'tenant-b-admin@test.invalid',displayName:'Tenant B Admin'},create:{id:USER_B,email:'tenant-b-admin@test.invalid',displayName:'Tenant B Admin',passwordHash:'test'}});
  await db.user.upsert({where:{id:VIEWER_A},update:{email:'tenant-a-viewer@test.invalid',displayName:'Tenant A Viewer'},create:{id:VIEWER_A,email:'tenant-a-viewer@test.invalid',displayName:'Tenant A Viewer',passwordHash:'test'}});
  await db.membership.upsert({where:{userId_organizationId:{userId:USER_B,organizationId:ORG_B}},update:{roles:['ORG_ADMIN','PROJECT_MANAGER']},create:{id:randomUUID(),userId:USER_B,organizationId:ORG_B,roles:['ORG_ADMIN','PROJECT_MANAGER']}});
  await db.membership.upsert({where:{userId_organizationId:{userId:VIEWER_A,organizationId:ORG_A}},update:{roles:['VIEWER']},create:{id:randomUUID(),userId:VIEWER_A,organizationId:ORG_A,roles:['VIEWER']}});
  await db.contractorProfile.upsert({where:{organizationId:ORG_B},update:{legalName:'Contractor B',commercialRegistrationNo:'2020202020'},create:{id:CONTRACTOR_B,organizationId:ORG_B,legalName:'Contractor B',commercialRegistrationNo:'2020202020',status:'APPROVED'}});
  await tenant.run({org:ORG_A,sub:USER_A},async tx=>{await tx.client.upsert({where:{id:CLIENT_A},update:{displayName:'Client A'},create:{id:CLIENT_A,tenantId:ORG_A,displayName:'Client A',createdBy:USER_A,updatedBy:USER_A}});await tx.site.upsert({where:{id:SITE_A},update:{displayName:'Site A'},create:{id:SITE_A,tenantId:ORG_A,clientId:CLIENT_A,displayName:'Site A',city:'Jazan',createdBy:USER_A,updatedBy:USER_A}})});
  await tenant.run({org:ORG_B,sub:USER_B},async tx=>{await tx.client.upsert({where:{id:CLIENT_B},update:{displayName:'Client B'},create:{id:CLIENT_B,tenantId:ORG_B,displayName:'Client B',createdBy:USER_B,updatedBy:USER_B}});await tx.site.upsert({where:{id:SITE_B},update:{displayName:'Site B'},create:{id:SITE_B,tenantId:ORG_B,clientId:CLIENT_B,displayName:'Site B',city:'Riyadh',createdBy:USER_B,updatedBy:USER_B}})});
 });
 afterAll(async()=>{await app.close()},15000);

 const slaBody=(name:string)=>({name,responseTargetMinutes:30,arrivalTargetMinutes:60,resolutionTargetMinutes:240,workingHoursPolicy:{days:['SUN','MON']},timezone:'Asia/Riyadh',effectiveFrom:'2026-10-04'});
 const contractBody=(clientId=CLIENT_A,slaPolicyId=slaA)=>({clientId,contractorId:CONTRACTOR_A,contractType:'PREVENTIVE',startDate:'2026-10-04',endDate:'2027-10-03',plannedVisits:12,visitFrequencyType:'MONTH',visitFrequencyValue:1,contractValue:10000,vatAmount:1500,currency:'SAR',slaPolicyId});

 it('creates, lists and isolates SLA policies',async()=>{
  const key=`sla-a-${runId}`,body=slaBody(`SLA A ${runId}`);
  const created=await request(app.getHttpServer()).post('/api/v1/maintenance/sla-policies').set('Authorization',adminA).set('Idempotency-Key',key).send(body).expect(201);
  slaA=created.body.id;expect(slaA).toBeTruthy();expect(created.body.version).toBe(1);expect(created.headers.etag).toBeTruthy();
  const replay=await request(app.getHttpServer()).post('/api/v1/maintenance/sla-policies').set('Authorization',adminA).set('Idempotency-Key',key).send(body).expect(201);
  expect(replay.body.id).toBe(slaA);
  const list=await request(app.getHttpServer()).get('/api/v1/maintenance/sla-policies').set('Authorization',adminA).expect(200);
  expect(list.body.some((x:any)=>x.id===slaA)).toBe(true);
  await request(app.getHttpServer()).get(`/api/v1/maintenance/sla-policies/${slaA}`).set('Authorization',adminB).expect(404);
  await request(app.getHttpServer()).post('/api/v1/maintenance/sla-policies').set('Authorization',viewerA).set('Idempotency-Key',`viewer-${runId}`).send(slaBody('Forbidden')).expect(403);
  const b=await request(app.getHttpServer()).post('/api/v1/maintenance/sla-policies').set('Authorization',adminB).set('Idempotency-Key',`sla-b-${runId}`).send(slaBody(`SLA B ${runId}`)).expect(201);slaB=b.body.id;
 });

 it('creates a tenant-safe DRAFT contract and rejects cross-tenant references',async()=>{
  const created=await request(app.getHttpServer()).post('/api/v1/maintenance/contracts').set('Authorization',adminA).set('Idempotency-Key',`contract-${runId}`).send(contractBody()).expect(201);
  contractId=created.body.id;contractEtag=created.headers.etag;expect(created.body.status).toBe('DRAFT');expect(created.body.contractNumber).toMatch(/^MC-/);expect(contractEtag).toBeTruthy();
  await request(app.getHttpServer()).get(`/api/v1/maintenance/contracts/${contractId}`).set('Authorization',adminB).expect(404);
  await request(app.getHttpServer()).post('/api/v1/maintenance/contracts').set('Authorization',viewerA).set('Idempotency-Key',`viewer-contract-${runId}`).send(contractBody()).expect(403);
  await request(app.getHttpServer()).post('/api/v1/maintenance/contracts').set('Authorization',adminA).set('Idempotency-Key',`cross-client-${runId}`).send(contractBody(CLIENT_B,slaA)).expect(404);
  await request(app.getHttpServer()).post('/api/v1/maintenance/contracts').set('Authorization',adminA).set('Idempotency-Key',`cross-sla-${runId}`).send(contractBody(CLIENT_A,slaB)).expect(404);
  const list=await request(app.getHttpServer()).get('/api/v1/maintenance/contracts').set('Authorization',adminA).expect(200);expect(list.body.some((x:any)=>x.id===contractId)).toBe(true);
 });
 it('adds tenant-safe site and scope with idempotent replay',async()=>{
  if(!contractId||!contractEtag) throw new Error('CONTRACT_SETUP_REQUIRED');
  const siteKey=`site-${runId}`,initialEtag=contractEtag;
  const site=await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/sites`).set('Authorization',adminA).set('Idempotency-Key',siteKey).set('If-Match',initialEtag).send({siteId:SITE_A}).expect(201);
  contractEtag=site.headers.etag;expect(site.body.siteId).toBe(SITE_A);expect(contractEtag).toBeTruthy();
  const replay=await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/sites`).set('Authorization',adminA).set('Idempotency-Key',siteKey).set('If-Match',initialEtag).send({siteId:SITE_A}).expect(201);
  expect(replay.body.id).toBe(site.body.id);
  await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/sites`).set('Authorization',adminA).set('Idempotency-Key',`cross-site-${runId}`).set('If-Match',contractEtag).send({siteId:SITE_B}).expect(404);
  const scope=await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/scopes`).set('Authorization',adminA).set('Idempotency-Key',`scope-${runId}`).set('If-Match',contractEtag).send({scopeCategory:'FIRE',serviceType:'PREVENTIVE',description:'Fire systems maintenance',included:true,visitLimit:12}).expect(201);
  contractEtag=scope.headers.etag;expect(scope.body.serviceType).toBe('PREVENTIVE');
  const sites=await request(app.getHttpServer()).get(`/api/v1/maintenance/contracts/${contractId}/sites`).set('Authorization',adminA).expect(200);expect(sites.body).toHaveLength(1);
 });

 it('enforces If-Match and activates only after submit',async()=>{
  if(!contractId||!contractEtag) throw new Error('CONTRACT_SETUP_REQUIRED');
  await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/activate`).set('Authorization',adminA).set('Idempotency-Key',`early-activate-${runId}`).set('If-Match',contractEtag).send({}).expect(422);
  await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/submit`).set('Authorization',adminA).set('Idempotency-Key',`missing-etag-${runId}`).send({}).expect(428);
  await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/submit`).set('Authorization',adminA).set('Idempotency-Key',`stale-etag-${runId}`).set('If-Match','"stale"').send({}).expect(409);
  const submitted=await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/submit`).set('Authorization',adminA).set('Idempotency-Key',`submit-${runId}`).set('If-Match',contractEtag).send({}).expect(200);
  contractEtag=submitted.headers.etag;expect(submitted.body.status).toBe('PENDING_APPROVAL');
  const activated=await request(app.getHttpServer()).post(`/api/v1/maintenance/contracts/${contractId}/activate`).set('Authorization',adminA).set('Idempotency-Key',`activate-${runId}`).set('If-Match',contractEtag).send({}).expect(200);
  expect(activated.body.status).toBe('ACTIVE');expect(activated.body.activatedAt).toBeTruthy();
  const audit=await db.auditEvent.findMany({where:{organizationId:ORG_A,entityType:'maintenance_contract',entityId:contractId}});expect(audit.map(x=>x.event)).toEqual(expect.arrayContaining(['maintenance.contract.created','maintenance.contract.submitted','maintenance.contract.activated']));
  const events=await tenant.run({org:ORG_A,sub:USER_A},tx=>tx.domainEvent.findMany({where:{aggregateType:'maintenance_contract',aggregateId:contractId}}));expect(events.map(x=>x.eventType)).toContain('maintenance.contract.activated');
 });
});
