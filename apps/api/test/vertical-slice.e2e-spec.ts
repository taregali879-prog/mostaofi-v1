import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
describe('Vertical Slice E2E',()=>{
 let app:INestApplication, token:string, projectId:string;
 beforeAll(async()=>{const m=await Test.createTestingModule({imports:[AppModule]}).compile(); app=m.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init()});
 afterAll(()=>app.close());
 it('Login → Contractor → Create Project → Upload intent → Complete → Verify Audit',async()=>{
  const login=await request(app.getHttpServer()).post('/api/v1/auth/login').send({email:'admin@partner.local',password:'ChangeMe123!'}).expect(201); token=login.body.accessToken;
  await request(app.getHttpServer()).get('/api/v1/contractor-profile').set('Authorization',`Bearer ${token}`).expect(200);
  const p=await request(app.getHttpServer()).post('/api/v1/projects').set('Authorization',`Bearer ${token}`).send({name:'E2E Fire Project',clientName:'E2E Client',city:'جازان',scope:'Fire systems'}).expect(201); projectId=p.body.id;
  const i=await request(app.getHttpServer()).post(`/api/v1/projects/${projectId}/documents/upload-intent`).set('Authorization',`Bearer ${token}`).send({type:'BOQ',title:'BOQ',fileName:'boq.pdf',mimeType:'application/pdf',sizeBytes:1200}).expect(201);
  expect(i.body.uploadUrl).toContain('X-Amz-Signature');
  await request(app.getHttpServer()).post(`/api/v1/documents/${i.body.documentId}/complete`).set('Authorization',`Bearer ${token}`).send({version:1,sha256:'a'.repeat(64)}).expect(201);
  const a=await request(app.getHttpServer()).get(`/api/v1/projects/${projectId}/activity`).set('Authorization',`Bearer ${token}`).expect(200);
  expect(a.body.map((x:any)=>x.event)).toEqual(expect.arrayContaining(['PROJECT_CREATED','DOCUMENT_UPLOADED']));
  const boq=await request(app.getHttpServer()).post(`/api/v1/projects/${projectId}/boqs`).set('Authorization',`Bearer ${token}`).send({title:'BOQ Fire Systems'}).expect(201);
  await request(app.getHttpServer()).post(`/api/v1/boqs/${boq.body.id}/versions/1/items`).set('Authorization',`Bearer ${token}`).send({lineNo:1,description:'Fire sprinkler',unit:'EA',quantity:10,unitPrice:25}).expect(201);
  await request(app.getHttpServer()).post(`/api/v1/boqs/${boq.body.id}/versions/1/submit`).set('Authorization',`Bearer ${token}`).expect(201);
  await request(app.getHttpServer()).post(`/api/v1/boqs/${boq.body.id}/versions/1/approve`).set('Authorization',`Bearer ${token}`).expect(201);
  const a2=await request(app.getHttpServer()).get(`/api/v1/projects/${projectId}/activity`).set('Authorization',`Bearer ${token}`).expect(200);
  expect(a2.body.map((x:any)=>x.event)).toEqual(expect.arrayContaining(['BOQ_CREATED','BOQ_SUBMITTED','BOQ_APPROVED']));
 });
});
