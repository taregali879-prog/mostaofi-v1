import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { DatabaseModule } from '../src/database/database.module';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaService } from '../src/database/prisma.service';
import { HydraulicsService } from '../src/hydraulics/hydraulics.service';

describe('Hydraulic engineering project persistence & tenant isolation',()=>{
  let db: PrismaService, service: HydraulicsService;
  const orgA=randomUUID(), orgB=randomUUID(), user=randomUUID(), projectId=randomUUID(),
    docId=randomUUID(), versionId=randomUUID();
  const ctxA={org:orgA,sub:user}, ctxB={org:orgB,sub:user};
  const input={
    segments:[{id:'S01',lengthM:32,flowGpm:250,insideDiameterMm:100,cFactor:120}],
    residualPressurePsi:12,elevationRiseM:4,designFlowGpm:250,
  };
  let calculationId='';
  beforeAll(async()=>{
    if(process.env.NODE_ENV!=='test') throw new Error('HYDRAULIC_E2E_REQUIRES_DISPOSABLE_TEST_DATABASE');
    const m=await Test.createTestingModule({
      imports:[DatabaseModule,AuditModule],providers:[HydraulicsService]
    }).compile();
    db=m.get(PrismaService); service=m.get(HydraulicsService);
    await db.user.create({data:{id:user,email:`hydraulic-${user}@example.test`,displayName:'Hydraulic Test',passwordHash:'test-only'}});
    await db.organization.createMany({data:[{id:orgA,name:'Hydraulic A'},{id:orgB,name:'Hydraulic B'}]});
    await db.project.create({data:{id:projectId,organizationId:orgA,name:'Fire Project',clientName:'Test',city:'Jazan',scope:'Fire'}}); 
    await db.document.create({data:{
      id:docId,organizationId:orgA,projectId,type:'FIRE_DRAWING',title:'Verified drawing',status:'UPLOADED',
      versions:{create:{id:versionId,version:1,fileName:'sample.dxf',mimeType:'application/dxf',
        sizeBytes:123n,sha256:'a'.repeat(64),storageKey:'tests/sample.dxf'}}
    }});
  });
  // The audit log is append-only by design. CI must use a disposable database;
  // never disable the immutable-audit trigger to clean up test fixtures.
  afterAll(async()=>{ await db.$disconnect(); });
  it('saves a version tied to a completed project drawing',async()=>{
    const item=await service.create(ctxA,projectId,{title:'Hydraulic 1',documentVersionId:versionId,
      sourceSha256:'a'.repeat(64),input});
    calculationId=item.id;
    expect(item.currentVersion).toBe(1);
    expect(item.versions[0].documentVersionId).toBe(versionId);
    expect((item.versions[0].result as any).requiredPressurePsi).toBeGreaterThan(10);
    expect((await service.list(ctxA,projectId))).toHaveLength(1);
  });
  it('preserves previous results when creating a new version',async()=>{
    const before=await service.get(ctxA,calculationId);
    const original=(before.versions[0].result as any).requiredPressurePsi;
    const newV=await service.newVersion(ctxA,calculationId,{
      documentVersionId:versionId,input:{...input,residualPressurePsi:18},
    });
    expect(newV.version).toBe(2);
    const after=await service.get(ctxA,calculationId);
    expect(after.versions).toHaveLength(2);
    expect((after.versions.find(v=>v.version===1)?.result as any).requiredPressurePsi).toBe(original);
    expect((after.versions.find(v=>v.version===2)?.result as any).requiredPressurePsi).toBeGreaterThan(original);
  });
  it('rejects cross-tenant reads and cross-tenant source drawing',async()=>{
    await expect(service.get(ctxB,calculationId)).rejects.toMatchObject({status:404});
    await expect(service.list(ctxB,projectId)).rejects.toMatchObject({status:404});
    await expect(service.create(ctxB,projectId,{
      title:'Forbidden',documentVersionId:versionId,input
    })).rejects.toMatchObject({status:404});
  });
  it('rejects a mismatching source hash without writing a revision',async()=>{
    await expect(service.newVersion(ctxA,calculationId,{
      documentVersionId:versionId,sourceSha256:'b'.repeat(64),input
    })).rejects.toMatchObject({status:400});
    const after=await service.get(ctxA,calculationId);
    expect(after.currentVersion).toBe(2);
  });
});
