import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { validateProductionConfig } from '../src/config/production-config';

describe('MVP Full Vertical Slice E2E',()=>{
 let app:INestApplication, token:string, projectId:string, boqId:string, boqItemId:string, requirementId:string, rfqId:string, quoteId:string, poId:string, poItemId:string, deliveryId:string, deliveryItemId:string;
 const warehouseId='01900000-0000-7000-8000-000000000301';
 const runId=`${Date.now().toString(36)}-${process.pid}`;
 beforeAll(async()=>{const m=await Test.createTestingModule({imports:[AppModule]}).compile();app=m.createNestApplication();app.setGlobalPrefix('api/v1');await app.init()});
 afterAll(()=>app.close());

 it('health ready',async()=>{await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200)});
 it('production config fails closed and accepts a governed Git deployment',()=>{
  const strong=(c:string)=>c.repeat(48);
  const env:any={NODE_ENV:'production',DATABASE_URL:'postgresql://app:runtime@db.internal:5432/mostaofi',WEB_URL:'https://mostaofi.example',JWT_ACCESS_SECRET:strong('a'),JWT_REFRESH_SECRET:strong('b'),S3_ENDPOINT:'https://objects.example',S3_BUCKET:'mostaofi-prod',S3_ACCESS_KEY:'runtime-access',S3_SECRET_KEY:strong('c'),RAILWAY_GIT_COMMIT_SHA:'0123456789abcdef0123456789abcdef01234567',RAILWAY_GIT_BRANCH:'main',RAILWAY_GIT_REPO_NAME:'mostaofi-v1',RAILWAY_GIT_REPO_OWNER:'taregali879-prog'};
  expect(()=>validateProductionConfig({NODE_ENV:'production'})).toThrow(/PRODUCTION_CONFIG_INVALID/);
  expect(()=>validateProductionConfig({...env,RAILWAY_GIT_BRANCH:'feature/test'})).toThrow(/RAILWAY_GIT_BRANCH/);
  expect(()=>validateProductionConfig({...env,JWT_ACCESS_SECRET:'dev-only-change-me'})).toThrow(/JWT_ACCESS_SECRET/);
  expect(()=>validateProductionConfig(env)).not.toThrow();
 });
 it('release provenance exposes the Railway Git commit',async()=>{
  const oldSha=process.env.RAILWAY_GIT_COMMIT_SHA, oldBranch=process.env.RAILWAY_GIT_BRANCH, oldRepo=process.env.RAILWAY_GIT_REPO_NAME, oldOwner=process.env.RAILWAY_GIT_REPO_OWNER;
  process.env.RAILWAY_GIT_COMMIT_SHA='0123456789abcdef0123456789abcdef01234567';process.env.RAILWAY_GIT_BRANCH='main';process.env.RAILWAY_GIT_REPO_NAME='mostaofi-v1';process.env.RAILWAY_GIT_REPO_OWNER='taregali879-prog';
  try{const r=await request(app.getHttpServer()).get('/api/v1/health/release').expect(200);expect(r.body).toEqual({source:'git',commitSha:'0123456789abcdef0123456789abcdef01234567',branch:'main',repo:'mostaofi-v1',owner:'taregali879-prog'});}finally{
   if(oldSha===undefined)delete process.env.RAILWAY_GIT_COMMIT_SHA;else process.env.RAILWAY_GIT_COMMIT_SHA=oldSha;
   if(oldBranch===undefined)delete process.env.RAILWAY_GIT_BRANCH;else process.env.RAILWAY_GIT_BRANCH=oldBranch;
   if(oldRepo===undefined)delete process.env.RAILWAY_GIT_REPO_NAME;else process.env.RAILWAY_GIT_REPO_NAME=oldRepo;
   if(oldOwner===undefined)delete process.env.RAILWAY_GIT_REPO_OWNER;else process.env.RAILWAY_GIT_REPO_OWNER=oldOwner;
  }
 });
 it('Login → Contractor → Project',async()=>{
  const login=await request(app.getHttpServer()).post('/api/v1/auth/login').send({email:'admin@partner.local',password:'ChangeMe123!'}).expect(201);token=login.body.accessToken;expect(token).toBeTruthy();
  await request(app.getHttpServer()).get('/api/v1/contractor-profile').set('Authorization',`Bearer ${token}`).expect(200);
  const p=await request(app.getHttpServer()).post('/api/v1/projects').set('Authorization',`Bearer ${token}`).send({name:'MVP Pilot Fire Project',clientName:'Pilot Client',city:'جازان',scope:'Fire systems'}).expect(201);projectId=p.body.id;
  const content=Buffer.from('pilot-document');
  const intent=await request(app.getHttpServer()).post(`/api/v1/projects/${projectId}/documents/upload-intent`).set('Authorization',`Bearer ${token}`).send({type:'BOQ',title:'Pilot BOQ Document',fileName:'pilot.pdf',mimeType:'application/pdf',sizeBytes:content.length}).expect(201);
  const upload=await fetch(intent.body.uploadUrl,{method:'PUT',headers:{'content-type':'application/pdf'},body:content});expect(upload.ok).toBe(true);
  const {createHash}=await import('crypto');const sha=createHash('sha256').update(content).digest('hex');
  await request(app.getHttpServer()).post(`/api/v1/documents/${intent.body.documentId}/complete`).set('Authorization',`Bearer ${token}`).send({version:1,sha256:sha}).expect(201);
 });
 it('Approved BOQ',async()=>{
  const boq=await request(app.getHttpServer()).post(`/api/v1/projects/${projectId}/boqs`).set('Authorization',`Bearer ${token}`).send({title:'Fire Systems BOQ'}).expect(201);boqId=boq.body.id;
  const item=await request(app.getHttpServer()).post(`/api/v1/boqs/${boqId}/versions/1/items`).set('Authorization',`Bearer ${token}`).send({lineNo:1,description:'Fire sprinkler',unit:'EA',quantity:10,unitPrice:25}).expect(201);boqItemId=item.body.id;
  await request(app.getHttpServer()).post(`/api/v1/boqs/${boqId}/versions/1/submit`).set('Authorization',`Bearer ${token}`).expect(201);
  await request(app.getHttpServer()).post(`/api/v1/boqs/${boqId}/versions/1/approve`).set('Authorization',`Bearer ${token}`).expect(201);
 });
 it('Material Requirement → RFQ → Supplier Quote → Comparison → Award → PO',async()=>{
  const mr=await request(app.getHttpServer()).post(`/api/v1/projects/${projectId}/material-requirements`).set('Authorization',`Bearer ${token}`).send({boqId,version:1,items:[{boqItemId,quantity:10}]}).expect(201);requirementId=mr.body.id;
  await request(app.getHttpServer()).post(`/api/v1/material-requirements/${requirementId}/submit`).set('Authorization',`Bearer ${token}`).expect(201);
  await request(app.getHttpServer()).post(`/api/v1/material-requirements/${requirementId}/approve`).set('Authorization',`Bearer ${token}`).expect(201);
  const rfq=await request(app.getHttpServer()).post(`/api/v1/material-requirements/${requirementId}/rfqs`).set('Authorization',`Bearer ${token}`).send({}).expect(201);rfqId=rfq.body.id;
  await request(app.getHttpServer()).post(`/api/v1/rfqs/${rfqId}/issue`).set('Authorization',`Bearer ${token}`).expect(201);
  const q=await request(app.getHttpServer()).post(`/api/v1/rfqs/${rfqId}/quotes`).set('Authorization',`Bearer ${token}`).send({supplierId:'01900000-0000-7000-8000-000000000401',leadTimeDays:2,paymentTerms:'30 days',items:[{boqItemId,quantity:10,unitPrice:20,availableQty:10}]}).expect(201);quoteId=q.body.id;
  await request(app.getHttpServer()).post(`/api/v1/supplier-quotes/${quoteId}/submit`).set('Authorization',`Bearer ${token}`).expect(201);
  const cmp=await request(app.getHttpServer()).get(`/api/v1/rfqs/${rfqId}/comparison`).set('Authorization',`Bearer ${token}`).expect(200);expect(cmp.body[0].total).toBe(200);
  await request(app.getHttpServer()).post(`/api/v1/rfqs/${rfqId}/award`).set('Authorization',`Bearer ${token}`).send({quoteId}).expect(201);
  const po=await request(app.getHttpServer()).post(`/api/v1/rfqs/${rfqId}/purchase-orders`).set('Authorization',`Bearer ${token}`).send({poNumber:`PO-E2E-${runId}`}).expect(201);poId=po.body.id;poItemId=po.body.items[0].id;
  await request(app.getHttpServer()).post(`/api/v1/purchase-orders/${poId}/approve`).set('Authorization',`Bearer ${token}`).expect(201);
 });
 it('Delivery → Inspection → Goods Receipt → Inventory',async()=>{
  const d=await request(app.getHttpServer()).post(`/api/v1/purchase-orders/${poId}/deliveries`).set('Authorization',`Bearer ${token}`).send({deliveryNumber:`DEL-E2E-${runId}`,items:[{purchaseOrderItemId:poItemId,arrivedQty:8}]}).expect(201);deliveryId=d.body.id;deliveryItemId=d.body.items[0].id;
  await request(app.getHttpServer()).post(`/api/v1/deliveries/${deliveryId}/arrive`).set('Authorization',`Bearer ${token}`).expect(201);
  await request(app.getHttpServer()).post(`/api/v1/deliveries/${deliveryId}/inspect`).set('Authorization',`Bearer ${token}`).send({items:[{deliveryItemId,acceptedQty:7,rejectedQty:1,damagedQty:0}]}).expect(201);
  await request(app.getHttpServer()).post(`/api/v1/deliveries/${deliveryId}/receive`).set('Authorization',`Bearer ${token}`).send({warehouseId}).expect(201);
  const stock=await request(app.getHttpServer()).get(`/api/v1/warehouses/${warehouseId}/inventory`).set('Authorization',`Bearer ${token}`).expect(200);expect(stock.body.find((x:any)=>x.boqItemId===boqItemId).quantity).toBe(7);
 });
 it('Project Allocation → KPI → Audit',async()=>{
  await request(app.getHttpServer()).post(`/api/v1/projects/${projectId}/materials/allocate`).set('Authorization',`Bearer ${token}`).send({warehouseId,boqItemId,quantity:5}).expect(201);
  const k=await request(app.getHttpServer()).get(`/api/v1/projects/${projectId}/materials/kpis`).set('Authorization',`Bearer ${token}`).expect(200);
  expect(k.body).toMatchObject({required:10,ordered:10,arrived:8,accepted:7,rejected:1,remainingReceive:3,remainingNeed:3,allocated:5,budget:250,committed:200,actual:140,weightedAveragePurchaseCost:20});
  const a=await request(app.getHttpServer()).get(`/api/v1/projects/${projectId}/activity`).set('Authorization',`Bearer ${token}`).expect(200);
  const events=a.body.map((x:any)=>x.event);
  expect(events).toEqual(expect.arrayContaining(['PROJECT_CREATED','BOQ_APPROVED','MATERIAL_REQUIREMENT_CREATED','RFQ_ISSUED','SUPPLIER_QUOTE_SUBMITTED','RFQ_AWARDED','PURCHASE_ORDER_APPROVED','DELIVERY_ARRIVED','GOODS_INSPECTED','INVENTORY_RECEIVED','MATERIAL_ALLOCATED']));
 });
});
