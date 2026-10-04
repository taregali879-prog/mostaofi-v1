import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TenantTransactionService } from '../src/database/tenant-transaction.service';
import { MAINT_FIXTURE, seedMaintenanceAcceptanceFixtures } from './helpers/maintenance-fixtures';

describe('Mostaofi v1.1 maintenance vertical acceptance',()=>{
 let app:INestApplication,db:PrismaService,tenant:TenantTransactionService;
 let adminToken:string,viewerToken:string,otherToken:string;
 const runId=`${Date.now()}-${process.pid}`;
 beforeAll(async()=>{
  const m=await Test.createTestingModule({imports:[AppModule]}).compile();
  app=m.createNestApplication();app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.init();
  db=app.get(PrismaService);tenant=app.get(TenantTransactionService);await seedMaintenanceAcceptanceFixtures(db,tenant);
 });
 afterAll(async()=>{await app.close()},20000);
 const api=(token:string,path:string,method:'get'|'post'|'put'|'patch'='get')=>request(app.getHttpServer())[method](path).set('Authorization',`Bearer ${token}`);
 const command=(token:string,path:string,key:string,etag?:string,body:any={})=>{let r=api(token,path,'post').set('Idempotency-Key',key);if(etag)r=r.set('If-Match',etag);return r.send(body)};
 const login=async(email:string)=>{const r=await request(app.getHttpServer()).post('/api/v1/auth/login').send({email,password:MAINT_FIXTURE.password}).expect(201);return r.body.accessToken as string};
 it('authenticates fixtures and proves 401/403 at the maintenance boundary',async()=>{
  adminToken=await login('maint-admin-a@test.invalid');viewerToken=await login('maint-viewer-a@test.invalid');otherToken=await login('maint-admin-b@test.invalid');
  await request(app.getHttpServer()).get('/api/v1/maintenance/contracts').expect(401);
  await api(viewerToken,'/api/v1/maintenance/sla-policies','post').set('Idempotency-Key',`viewer-sla-${runId}`).send({name:'Forbidden SLA',responseTargetMinutes:30,arrivalTargetMinutes:60,resolutionTargetMinutes:120,workingHoursPolicy:{},timezone:'Asia/Riyadh',effectiveFrom:'2026-10-04'}).expect(403);
  await api(adminToken,'/api/v1/projects').expect(200);
 });

 it('drives the governed contract, visit and work-order chain over HTTP',async()=>{
  const slaBody={name:`Acceptance SLA ${runId}`,responseTargetMinutes:30,arrivalTargetMinutes:60,resolutionTargetMinutes:240,workingHoursPolicy:{days:['SUN','MON','TUE','WED','THU']},timezone:'Asia/Riyadh',effectiveFrom:'2026-10-04'};
  const slaKey=`accept-sla-${runId}`;const sla=await api(adminToken,'/api/v1/maintenance/sla-policies','post').set('Idempotency-Key',slaKey).send(slaBody).expect(201);
  const slaReplay=await api(adminToken,'/api/v1/maintenance/sla-policies','post').set('Idempotency-Key',slaKey).send(slaBody).expect(201);expect(slaReplay.body.id).toBe(sla.body.id);
  const technician=await api(adminToken,'/api/v1/maintenance/technicians','post').set('Idempotency-Key',`accept-tech-${runId}`).send({contractorId:MAINT_FIXTURE.contractorA,userId:MAINT_FIXTURE.technicianA,employeeCode:`TECH-${runId}`,displayName:'Acceptance Technician',mobile:'0501234567'}).expect(201);
  const contractBody={clientId:MAINT_FIXTURE.clientA,contractorId:MAINT_FIXTURE.contractorA,contractType:'PREVENTIVE',startDate:'2026-10-04',endDate:'2027-10-03',plannedVisits:12,visitFrequencyType:'MONTH',visitFrequencyValue:1,contractValue:12000,vatAmount:1800,currency:'SAR',slaPolicyId:sla.body.id};
  const contract=await api(adminToken,'/api/v1/maintenance/contracts','post').set('Idempotency-Key',`accept-contract-${runId}`).send(contractBody).expect(201);let contractEtag=contract.headers.etag as string;
  await api(otherToken,`/api/v1/maintenance/contracts/${contract.body.id}`).expect(404);
  await command(adminToken,`/api/v1/maintenance/contracts/${contract.body.id}/submit`,`stale-submit-${runId}`,'"stale"').expect(409);
  const site=await command(adminToken,`/api/v1/maintenance/contracts/${contract.body.id}/sites`,`accept-site-${runId}`,contractEtag,{siteId:MAINT_FIXTURE.siteA}).expect(201);contractEtag=site.headers.etag as string;
  const scope=await command(adminToken,`/api/v1/maintenance/contracts/${contract.body.id}/scopes`,`accept-scope-${runId}`,contractEtag,{scopeCategory:'FIRE',serviceType:'PREVENTIVE',description:'Fire systems maintenance',included:true,visitLimit:12}).expect(201);contractEtag=scope.headers.etag as string;
  const submitted=await command(adminToken,`/api/v1/maintenance/contracts/${contract.body.id}/submit`,`accept-submit-${runId}`,contractEtag).expect(200);contractEtag=submitted.headers.etag as string;
  const activated=await command(adminToken,`/api/v1/maintenance/contracts/${contract.body.id}/activate`,`accept-activate-${runId}`,contractEtag).expect(200);contractEtag=activated.headers.etag as string;expect(activated.body.status).toBe('ACTIVE');

  const visit=await command(adminToken,`/api/v1/maintenance/contracts/${contract.body.id}/visits`,`accept-visit-${runId}`,contractEtag,{siteId:MAINT_FIXTURE.siteA,visitKind:'PLANNED_MAINTENANCE',scheduledStart:'2026-10-10T08:00:00Z',scheduledEnd:'2026-10-10T10:00:00Z'}).expect(201);
  let visitState=await api(adminToken,`/api/v1/maintenance/visits/${visit.body.id}`).expect(200),visitEtag=visitState.headers.etag as string;
  for(const [action,status] of [['schedule','SCHEDULED'],['confirm','CONFIRMED'],['arrive','ARRIVED'],['start','IN_PROGRESS']] as const){const r=await command(adminToken,`/api/v1/maintenance/visits/${visit.body.id}/${action}`,`accept-visit-${action}-${runId}`,visitEtag).expect(200);visitEtag=r.headers.etag as string;expect(r.body.status).toBe(status)}

  const wo=await command(adminToken,`/api/v1/maintenance/visits/${visit.body.id}/work-orders`,`accept-wo-${runId}`,visitEtag,{serviceType:'PREVENTIVE',priority:'HIGH',scheduledStart:'2026-10-10T08:30:00Z',slaDeadline:'2026-10-10T12:00:00Z'}).expect(201);
  let woState=await api(adminToken,`/api/v1/maintenance/work-orders/${wo.body.id}`).expect(200),woEtag=woState.headers.etag as string;
  const assignment=await command(adminToken,`/api/v1/maintenance/work-orders/${wo.body.id}/assignments`,`accept-assignment-${runId}`,woEtag,{technicianId:technician.body.id,role:'LEAD_TECHNICIAN'}).expect(201);woEtag=assignment.headers.etag as string;
  const accepted=await command(adminToken,`/api/v1/maintenance/work-orders/${wo.body.id}/assignments/${assignment.body.id}/accept`,`accept-assignment-accept-${runId}`,woEtag).expect(200);woEtag=accepted.headers.etag as string;
  const arrived=await command(adminToken,`/api/v1/maintenance/work-orders/${wo.body.id}/arrive`,`accept-wo-arrive-${runId}`,woEtag).expect(200);woEtag=arrived.headers.etag as string;
  const started=await command(adminToken,`/api/v1/maintenance/work-orders/${wo.body.id}/start`,`accept-wo-start-${runId}`,woEtag).expect(200);expect(started.body.status).toBe('IN_PROGRESS');
  woEtag=started.headers.etag as string;
  const template=await api(adminToken,'/api/v1/maintenance/inspection-templates','post').set('Idempotency-Key',`accept-template-${runId}`).send({name:`Acceptance Template ${runId}`,serviceType:'PREVENTIVE'}).expect(201);let templateEtag=template.headers.etag as string;
  const version=await command(adminToken,`/api/v1/maintenance/inspection-templates/${template.body.id}/versions`,`accept-version-${runId}`,templateEtag,{effectiveFrom:'2026-10-04'}).expect(201);
  let versionState=await api(adminToken,`/api/v1/maintenance/inspection-template-versions/${version.body.id}`).expect(200),versionEtag=versionState.headers.etag as string;
  const section=await command(adminToken,`/api/v1/maintenance/inspection-template-versions/${version.body.id}/sections`,`accept-section-${runId}`,versionEtag,{title:'Fire Alarm',displayOrder:1}).expect(201);let sectionEtag=section.headers.etag as string;
  const item=await command(adminToken,`/api/v1/maintenance/inspection-sections/${section.body.id}/items`,`accept-item-${runId}`,sectionEtag,{code:'FA-ACCEPT-001',question:'Detector operational?',answerType:'PASS_FAIL',required:true,requiresEvidenceOnFail:false,displayOrder:1}).expect(201);
  versionState=await api(adminToken,`/api/v1/maintenance/inspection-template-versions/${version.body.id}`).expect(200);versionEtag=versionState.headers.etag as string;
  const review=await command(adminToken,`/api/v1/maintenance/inspection-template-versions/${version.body.id}/submit-review`,`accept-review-${runId}`,versionEtag).expect(200);versionEtag=review.headers.etag as string;
  const published=await command(adminToken,`/api/v1/maintenance/inspection-template-versions/${version.body.id}/publish`,`accept-publish-${runId}`,versionEtag).expect(200);expect(published.body.status).toBe('PUBLISHED');

  const inspection=await command(adminToken,`/api/v1/maintenance/work-orders/${wo.body.id}/inspections`,`accept-inspection-${runId}`,woEtag,{templateVersionId:version.body.id,performedBy:technician.body.id}).expect(201);
  let inspectionState=await api(adminToken,`/api/v1/maintenance/inspections/${inspection.body.id}`).expect(200),inspectionEtag=inspectionState.headers.etag as string;
  const inspectionStarted=await command(adminToken,`/api/v1/maintenance/inspections/${inspection.body.id}/start`,`accept-inspection-start-${runId}`,inspectionEtag).expect(200);inspectionEtag=inspectionStarted.headers.etag as string;
  const answer=await api(adminToken,`/api/v1/maintenance/inspections/${inspection.body.id}/answers/${item.body.id}`,'put').set('Idempotency-Key',`accept-answer-${runId}`).set('If-Match',inspectionEtag).send({answerBoolean:false,result:'FAIL',recordedAt:new Date().toISOString()}).expect(200);inspectionEtag=answer.headers.etag as string;
  const inspectionCompleted=await command(adminToken,`/api/v1/maintenance/inspections/${inspection.body.id}/complete`,`accept-inspection-complete-${runId}`,inspectionEtag).expect(200);inspectionEtag=inspectionCompleted.headers.etag as string;expect(inspectionCompleted.body.status).toBe('COMPLETED');
  const findingBody={inspectionItemId:item.body.id,findingType:'FAULT',category:'FIRE_ALARM',title:'Acceptance detector fault',description:'Detector failed during governed inspection',severity:'HIGH',riskLevel:'HIGH'};
  await api(viewerToken,`/api/v1/maintenance/inspections/${inspection.body.id}/findings`,'post').set('Idempotency-Key',`viewer-finding-${runId}`).set('If-Match',inspectionEtag).send(findingBody).expect(403);
  const finding=await command(adminToken,`/api/v1/maintenance/inspections/${inspection.body.id}/findings`,`accept-finding-${runId}`,inspectionEtag,findingBody).expect(201);expect(finding.body.status).toBe('OPEN');
  await api(otherToken,`/api/v1/maintenance/findings/${finding.body.id}`).expect(404);
  const found=await api(adminToken,`/api/v1/maintenance/findings/${finding.body.id}`).expect(200);expect(found.body.title).toBe(findingBody.title);
  const findings=await api(adminToken,'/api/v1/maintenance/findings').expect(200);expect(findings.body.some((x:any)=>x.id===finding.body.id)).toBe(true);
  const finalWo=await api(adminToken,`/api/v1/maintenance/work-orders/${wo.body.id}`).expect(200);expect(finalWo.body.status).toBe('ACTION_REQUIRED');

  const slaRows=await tenant.run({org:MAINT_FIXTURE.orgA,sub:MAINT_FIXTURE.adminA},tx=>tx.sLAPolicy.count({where:{name:slaBody.name}}));expect(slaRows).toBe(1);
  const auditEvents=await db.auditEvent.findMany({where:{organizationId:MAINT_FIXTURE.orgA,event:{startsWith:'maintenance.'}}});
  expect(auditEvents.map(x=>x.event)).toEqual(expect.arrayContaining(['maintenance.contract.activated','maintenance.visit.created','maintenance.workorder.started','maintenance.inspection.completed','maintenance.finding.detected']));
  const domainEvents=await tenant.run({org:MAINT_FIXTURE.orgA,sub:MAINT_FIXTURE.adminA},tx=>tx.domainEvent.findMany({where:{eventType:{startsWith:'maintenance.'}}}));
  expect(domainEvents.map(x=>x.eventType)).toEqual(expect.arrayContaining(['maintenance.contract.activated','maintenance.visit.scheduled','maintenance.workorder.created','maintenance.workorder.assigned','maintenance.workorder.started','maintenance.inspection.completed','maintenance.finding.detected']));
 });
});
