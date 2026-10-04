import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TenantTransactionService } from '../src/database/tenant-transaction.service';
import { signJwt } from '../src/security/jwt';

const ORG_A='01900000-0000-7000-8000-000000000101', USER_A='01900000-0000-7000-8000-000000000001', CONTRACTOR_A='01900000-0000-7000-8000-000000000201';
const ORG_B='01930000-0000-7000-8000-000000000101', USER_B='01930000-0000-7000-8000-000000000001', VIEWER_A='01930000-0000-7000-8000-000000000002';
const auth=(sub:string,org:string,roles:string[])=>`Bearer ${signJwt({sub,org,roles,email:`${sub}@test.invalid`,typ:'access',jti:randomUUID()},process.env.JWT_ACCESS_SECRET??'dev-only-change-me',3600)}`;

describe('Maintenance inspections and findings',()=>{
 let app:INestApplication,db:PrismaService,tenant:TenantTransactionService;
 let techA:string,workOrderId:string,workOrderEtag:string,templateId:string,templateEtag:string,versionId:string,versionEtag:string,sectionId:string,sectionEtag:string,itemId:string,inspectionId:string,inspectionEtag:string,findingId:string;
 const runId=`${Date.now()}-${process.pid}`,adminA=auth(USER_A,ORG_A,['ORG_ADMIN','PROJECT_MANAGER','ENGINEER']),adminB=auth(USER_B,ORG_B,['ORG_ADMIN','PROJECT_MANAGER']),viewerA=auth(VIEWER_A,ORG_A,['VIEWER']);
 beforeAll(async()=>{
  const m=await Test.createTestingModule({imports:[AppModule]}).compile();app=m.createNestApplication();app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.init();db=app.get(PrismaService);tenant=app.get(TenantTransactionService);
  await db.organization.upsert({where:{id:ORG_B},update:{name:'Inspection Tenant B'},create:{id:ORG_B,name:'Inspection Tenant B'}});
  await db.user.upsert({where:{id:USER_B},update:{email:'inspection-b@test.invalid',displayName:'Inspection B'},create:{id:USER_B,email:'inspection-b@test.invalid',displayName:'Inspection B',passwordHash:'test'}});
  await db.user.upsert({where:{id:VIEWER_A},update:{email:'inspection-viewer@test.invalid',displayName:'Inspection Viewer'},create:{id:VIEWER_A,email:'inspection-viewer@test.invalid',displayName:'Inspection Viewer',passwordHash:'test'}});
  await db.membership.upsert({where:{userId_organizationId:{userId:USER_B,organizationId:ORG_B}},update:{roles:['ORG_ADMIN','PROJECT_MANAGER']},create:{id:randomUUID(),userId:USER_B,organizationId:ORG_B,roles:['ORG_ADMIN','PROJECT_MANAGER']}});
  await db.membership.upsert({where:{userId_organizationId:{userId:VIEWER_A,organizationId:ORG_A}},update:{roles:['VIEWER']},create:{id:randomUUID(),userId:VIEWER_A,organizationId:ORG_A,roles:['VIEWER']}});
  const clientId=randomUUID(),siteId=randomUUID(),slaId=randomUUID(),contractId=randomUUID(),visitId=randomUUID();techA=randomUUID();workOrderId=randomUUID();
  await tenant.run({org:ORG_A,sub:USER_A},async tx=>{
   await tx.client.create({data:{id:clientId,tenantId:ORG_A,displayName:'Inspection Client',createdBy:USER_A,updatedBy:USER_A}});await tx.site.create({data:{id:siteId,tenantId:ORG_A,clientId,displayName:'Inspection Site',createdBy:USER_A,updatedBy:USER_A}});
   await tx.sLAPolicy.create({data:{id:slaId,tenantId:ORG_A,name:`Inspection SLA ${runId}`,version:1,responseTargetMinutes:30,arrivalTargetMinutes:60,resolutionTargetMinutes:240,workingHoursPolicy:{},timezone:'Asia/Riyadh',status:'ACTIVE',effectiveFrom:new Date('2026-10-04'),createdBy:USER_A,updatedBy:USER_A}});
   await tx.maintenanceContract.create({data:{id:contractId,tenantId:ORG_A,contractNumber:`MC-INSP-${runId}`,clientId,contractorId:CONTRACTOR_A,contractType:'PREVENTIVE',startDate:new Date('2026-10-04'),endDate:new Date('2027-10-03'),plannedVisits:12,visitFrequencyType:'MONTH',visitFrequencyValue:1,contractValue:10000,vatAmount:1500,totalValue:11500,currency:'SAR',slaPolicyId:slaId,status:'ACTIVE',createdBy:USER_A,updatedBy:USER_A}});
   await tx.maintenanceContractSite.create({data:{tenantId:ORG_A,contractId,siteId,isActive:true,createdBy:USER_A,updatedBy:USER_A}});await tx.maintenanceVisit.create({data:{id:visitId,tenantId:ORG_A,contractId,siteId,visitSequence:1,visitKind:'PLANNED_MAINTENANCE',scheduledStart:new Date(),scheduledEnd:new Date(Date.now()+3600000),status:'IN_PROGRESS',createdBy:USER_A,updatedBy:USER_A}});
   await tx.technician.create({data:{id:techA,tenantId:ORG_A,contractorId:CONTRACTOR_A,employeeCode:`INSP-${runId}`,displayName:'Inspector A',mobile:'0500000777',status:'ACTIVE',createdBy:USER_A,updatedBy:USER_A}});await tx.workOrder.create({data:{id:workOrderId,tenantId:ORG_A,workOrderNumber:`WO-INSP-${runId}`,contractId,visitId,siteId,contractorId:CONTRACTOR_A,serviceType:'PREVENTIVE',priority:'HIGH',scheduledStart:new Date(),status:'IN_PROGRESS',createdBy:USER_A,updatedBy:USER_A}});
  });
 });
 afterAll(async()=>{await app.close()},20000);
 const post=(path:string,body:any,key:string,etag?:string)=>{let r=request(app.getHttpServer()).post(path).set('Authorization',adminA).set('Idempotency-Key',key);if(etag)r=r.set('If-Match',etag);return r.send(body)};

 it('builds and publishes a governed inspection template',async()=>{
  const t=await post('/api/v1/maintenance/inspection-templates',{name:`Fire Inspection ${runId}`,serviceType:'PREVENTIVE'},`tmpl-${runId}`).expect(201);templateId=t.body.id;
  const tg=await request(app.getHttpServer()).get(`/api/v1/maintenance/inspection-templates/${templateId}`).set('Authorization',adminA).expect(200);templateEtag=tg.headers.etag;
  const v=await post(`/api/v1/maintenance/inspection-templates/${templateId}/versions`,{effectiveFrom:'2026-10-04'},`ver-${runId}`,templateEtag).expect(201);versionId=v.body.id;
  const vg=await request(app.getHttpServer()).get(`/api/v1/maintenance/inspection-template-versions/${versionId}`).set('Authorization',adminA).expect(200);versionEtag=vg.headers.etag;
  const s=await post(`/api/v1/maintenance/inspection-template-versions/${versionId}/sections`,{title:'Fire Alarm',displayOrder:1},`section-${runId}`,versionEtag).expect(201);sectionId=s.body.id;sectionEtag=s.headers.etag;
  const item=await post(`/api/v1/maintenance/inspection-sections/${sectionId}/items`,{code:'FA-001',question:'Detector operational?',answerType:'PASS_FAIL',required:true,requiresEvidenceOnFail:false,displayOrder:1},`item-${runId}`,sectionEtag).expect(201);itemId=item.body.id;
  const currentVersion=await request(app.getHttpServer()).get(`/api/v1/maintenance/inspection-template-versions/${versionId}`).set('Authorization',adminA).expect(200);versionEtag=currentVersion.headers.etag;
  const review=await post(`/api/v1/maintenance/inspection-template-versions/${versionId}/submit-review`,{},`review-${runId}`,versionEtag).expect(200);versionEtag=review.headers.etag;expect(review.body.status).toBe('REVIEW');
  const published=await post(`/api/v1/maintenance/inspection-template-versions/${versionId}/publish`,{},`publish-${runId}`,versionEtag).expect(200);expect(published.body.status).toBe('PUBLISHED');
 });

 it('rejects unpublished templates and enforces tenant/RBAC on inspection creation',async()=>{
  const templateCurrent=await request(app.getHttpServer()).get(`/api/v1/maintenance/inspection-templates/${templateId}`).set('Authorization',adminA).expect(200);templateEtag=templateCurrent.headers.etag;
  const draft=await post(`/api/v1/maintenance/inspection-templates/${templateId}/versions`,{},`draft-ver-${runId}`,templateEtag).expect(201);
  const wo=await request(app.getHttpServer()).get(`/api/v1/maintenance/work-orders/${workOrderId}`).set('Authorization',adminA).expect(200);workOrderEtag=wo.headers.etag;
  await post(`/api/v1/maintenance/work-orders/${workOrderId}/inspections`,{templateVersionId:draft.body.id,performedBy:techA},`draft-inspection-${runId}`,workOrderEtag).expect(422);
  await request(app.getHttpServer()).post(`/api/v1/maintenance/work-orders/${workOrderId}/inspections`).set('Authorization',viewerA).set('Idempotency-Key',`viewer-inspection-${runId}`).set('If-Match',workOrderEtag).send({templateVersionId:versionId,performedBy:techA}).expect(403);
  const created=await post(`/api/v1/maintenance/work-orders/${workOrderId}/inspections`,{templateVersionId:versionId,performedBy:techA},`inspection-${runId}`,workOrderEtag).expect(201);inspectionId=created.body.id;expect(created.body.status).toBe('DRAFT');
  await request(app.getHttpServer()).get(`/api/v1/maintenance/inspections/${inspectionId}`).set('Authorization',adminB).expect(404);
 });
 it('starts inspection, rejects wrong answers and missing required answers, then completes',async()=>{
  const current=await request(app.getHttpServer()).get(`/api/v1/maintenance/inspections/${inspectionId}`).set('Authorization',adminA).expect(200);inspectionEtag=current.headers.etag;
  const started=await post(`/api/v1/maintenance/inspections/${inspectionId}/start`,{},`start-inspection-${runId}`,inspectionEtag).expect(200);expect(started.body.status).toBe('IN_PROGRESS');inspectionEtag=started.headers.etag;
  await request(app.getHttpServer()).put(`/api/v1/maintenance/inspections/${inspectionId}/answers/${itemId}`).set('Authorization',adminA).set('Idempotency-Key',`wrong-answer-${runId}`).set('If-Match',inspectionEtag).send({answerText:'yes',result:'PASS',recordedAt:new Date().toISOString()}).expect(422);
  await post(`/api/v1/maintenance/inspections/${inspectionId}/complete`,{},`early-complete-${runId}`,inspectionEtag).expect(422);
  const answer=await request(app.getHttpServer()).put(`/api/v1/maintenance/inspections/${inspectionId}/answers/${itemId}`).set('Authorization',adminA).set('Idempotency-Key',`answer-${runId}`).set('If-Match',inspectionEtag).send({answerBoolean:true,result:'PASS',recordedAt:new Date().toISOString()}).expect(200);inspectionEtag=answer.headers.etag;
  const complete=await post(`/api/v1/maintenance/inspections/${inspectionId}/complete`,{},`complete-inspection-${runId}`,inspectionEtag).expect(200);expect(complete.body.status).toBe('COMPLETED');
  const wo=await request(app.getHttpServer()).get(`/api/v1/maintenance/work-orders/${workOrderId}`).set('Authorization',adminA).expect(200);expect(wo.body.status).toBe('INSPECTION_COMPLETED');
 });

 it('creates, isolates, updates and audits findings without shutdown semantics',async()=>{
  const current=await request(app.getHttpServer()).get(`/api/v1/maintenance/inspections/${inspectionId}`).set('Authorization',adminA).expect(200);inspectionEtag=current.headers.etag;
  const body={inspectionItemId:itemId,findingType:'FAULT',category:'FIRE_ALARM',title:'Detector fault',description:'Detector did not respond',severity:'HIGH',riskLevel:'HIGH'};
  await request(app.getHttpServer()).post(`/api/v1/maintenance/inspections/${inspectionId}/findings`).set('Authorization',viewerA).set('Idempotency-Key',`viewer-finding-${runId}`).set('If-Match',inspectionEtag).send(body).expect(403);
  const created=await post(`/api/v1/maintenance/inspections/${inspectionId}/findings`,body,`finding-${runId}`,inspectionEtag).expect(201);findingId=created.body.id;expect(created.body.status).toBe('OPEN');expect(created.body).not.toHaveProperty('shutdown');
  await request(app.getHttpServer()).get(`/api/v1/maintenance/findings/${findingId}`).set('Authorization',adminB).expect(404);
  const got=await request(app.getHttpServer()).get(`/api/v1/maintenance/findings/${findingId}`).set('Authorization',adminA).expect(200);const findingEtag=got.headers.etag;
  const patched=await request(app.getHttpServer()).patch(`/api/v1/maintenance/findings/${findingId}`).set('Authorization',adminA).set('Idempotency-Key',`patch-finding-${runId}`).set('If-Match',findingEtag).send({title:'Detector fault confirmed'}).expect(200);expect(patched.body.title).toBe('Detector fault confirmed');
  const list=await request(app.getHttpServer()).get('/api/v1/maintenance/findings').set('Authorization',adminA).expect(200);expect(list.body.some((x:any)=>x.id===findingId)).toBe(true);
  const wo=await request(app.getHttpServer()).get(`/api/v1/maintenance/work-orders/${workOrderId}`).set('Authorization',adminA).expect(200);expect(wo.body.status).toBe('ACTION_REQUIRED');
  const audit=await db.auditEvent.findMany({where:{organizationId:ORG_A,entityId:findingId}});expect(audit.map(x=>x.event)).toEqual(expect.arrayContaining(['maintenance.finding.detected','maintenance.finding.updated']));
 });
});
