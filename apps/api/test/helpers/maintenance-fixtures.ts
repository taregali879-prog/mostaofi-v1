import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/database/prisma.service';
import { TenantTransactionService } from '../../src/database/tenant-transaction.service';
import { hashPassword } from '../../src/security/password';

export const MAINT_FIXTURE={
 orgA:'01940000-0000-7000-8000-000000000101',orgB:'01940000-0000-7000-8000-000000000102',
 adminA:'01940000-0000-7000-8000-000000000201',operatorA:'01940000-0000-7000-8000-000000000202',viewerA:'01940000-0000-7000-8000-000000000203',adminB:'01940000-0000-7000-8000-000000000204',technicianA:'01940000-0000-7000-8000-000000000205',
 contractorA:'01940000-0000-7000-8000-000000000301',contractorB:'01940000-0000-7000-8000-000000000302',
 clientA:'01940000-0000-7000-8000-000000000401',siteA:'01940000-0000-7000-8000-000000000501',
 password:'MaintenanceSlice123!'
} as const;

export async function seedMaintenanceAcceptanceFixtures(db:PrismaService,tenant:TenantTransactionService){
 const f=MAINT_FIXTURE;
 await db.organization.upsert({where:{id:f.orgA},update:{name:'Maintenance Acceptance A'},create:{id:f.orgA,name:'Maintenance Acceptance A'}});
 await db.organization.upsert({where:{id:f.orgB},update:{name:'Maintenance Acceptance B'},create:{id:f.orgB,name:'Maintenance Acceptance B'}});
 const users=[
  [f.adminA,'maint-admin-a@test.invalid','Maintenance Admin A',f.orgA,['ORG_ADMIN','PROJECT_MANAGER','ENGINEER']],
  [f.operatorA,'maint-operator-a@test.invalid','Maintenance Operator A',f.orgA,['PROJECT_MANAGER','ENGINEER']],
  [f.viewerA,'maint-viewer-a@test.invalid','Maintenance Viewer A',f.orgA,['VIEWER']],
  [f.adminB,'maint-admin-b@test.invalid','Maintenance Admin B',f.orgB,['ORG_ADMIN','PROJECT_MANAGER']],
  [f.technicianA,'maint-tech-a@test.invalid','Maintenance Technician A',f.orgA,['TECHNICIAN']],
 ] as const;
 for(const [id,email,displayName,org,roles] of users){
  await db.user.upsert({where:{id},update:{email,displayName,passwordHash:hashPassword(f.password)},create:{id,email,displayName,passwordHash:hashPassword(f.password)}});
  await db.membership.upsert({where:{userId_organizationId:{userId:id,organizationId:org}},update:{roles:[...roles]},create:{id:randomUUID(),userId:id,organizationId:org,roles:[...roles]}});
 }
 await db.contractorProfile.upsert({where:{organizationId:f.orgA},update:{legalName:'Maintenance Contractor A',commercialRegistrationNo:'4040404040',status:'APPROVED'},create:{id:f.contractorA,organizationId:f.orgA,legalName:'Maintenance Contractor A',commercialRegistrationNo:'4040404040',status:'APPROVED'}});
 await db.contractorProfile.upsert({where:{organizationId:f.orgB},update:{legalName:'Maintenance Contractor B',commercialRegistrationNo:'5050505050',status:'APPROVED'},create:{id:f.contractorB,organizationId:f.orgB,legalName:'Maintenance Contractor B',commercialRegistrationNo:'5050505050',status:'APPROVED'}});
 await tenant.run({org:f.orgA,sub:f.adminA},async tx=>{
  await tx.client.upsert({where:{id:f.clientA},update:{displayName:'Maintenance Client A',updatedBy:f.adminA},create:{id:f.clientA,tenantId:f.orgA,displayName:'Maintenance Client A',createdBy:f.adminA,updatedBy:f.adminA}});
  await tx.site.upsert({where:{id:f.siteA},update:{displayName:'Maintenance Site A',city:'Jazan',updatedBy:f.adminA},create:{id:f.siteA,tenantId:f.orgA,clientId:f.clientA,displayName:'Maintenance Site A',city:'Jazan',createdBy:f.adminA,updatedBy:f.adminA}});
 });
 return f;
}
