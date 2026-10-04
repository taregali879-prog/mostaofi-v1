import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  REQUIRED_MAINTENANCE_MARKERS,
  governedCommandHeaders,
  canDeleteAuditedOperationalRecord
} from '../scripts/lib/preview-runtime-gate.mjs';

const source=()=>fs.readFileSync('scripts/p0-preview-runtime-gate.mjs','utf8');

test('maintenance preview gate defines every acceptance marker',()=>{
 assert.deepEqual(REQUIRED_MAINTENANCE_MARKERS,[
  'maintenance_rbac','maintenance_tenant_isolation','maintenance_vertical','bucket_roundtrip','all'
 ]);
 for(const marker of REQUIRED_MAINTENANCE_MARKERS)assert.match(source(),new RegExp(`PREVIEW_GATE_PASS ${marker}`));
});

test('governed command headers carry bearer, idempotency and concurrency tokens without secrets in names',()=>{
 const headers=governedCommandHeaders({token:'jwt-value',idempotencyKey:'idem-1',ifMatch:'"etag"'});
 assert.equal(headers.authorization,'Bearer jwt-value');assert.equal(headers['idempotency-key'],'idem-1');assert.equal(headers['if-match'],'"etag"');
 assert.deepEqual(Object.keys(headers).sort(),['authorization','idempotency-key','if-match']);
});
test('runtime evidence never deletes audited operational maintenance rows',()=>{
 assert.equal(canDeleteAuditedOperationalRecord(0),true);
 assert.equal(canDeleteAuditedOperationalRecord(1),false);
 assert.equal(canDeleteAuditedOperationalRecord(12),false);
 assert.doesNotMatch(source(),/deleteMany\([^\n]*maintenance(?:Contract|Visit)|delete\([^\n]*workOrder|deleteMany\([^\n]*finding/i);
});

test('runtime gate bootstraps compiled Nest locally and never targets legacy production',()=>{
 const text=source();
 assert.match(text,/bootstrapPreviewApi/);
 assert.match(text,/apps\/api\/dist\/app\.module\.js/);
 assert.match(text,/127\.0\.0\.1/);
 assert.doesNotMatch(text,/mostaofi-v1-production\.up\.railway\.app/);
});

test('maintenance journey uses governed HTTP endpoints rather than service methods',()=>{
 const text=source();
 for(const fragment of ['/maintenance/sla-policies','/maintenance/technicians','/maintenance/contracts','/visits','/work-orders','/inspection-templates','/inspections/','/findings']) assert.match(text,new RegExp(fragment.replaceAll('/','\\/')));
 assert.doesNotMatch(text,/MaintenanceContractsService|MaintenanceOperationsService|MaintenanceInspectionsService/);
});

test('preview DB and bucket assertions happen before Prisma initialization',()=>{
 const text=source();
 assert.ok(text.indexOf('assertPreviewDatabaseUrl(databaseUrl)') < text.indexOf('new PrismaClient()'));
 assert.ok(text.indexOf('assertPreviewBucketName(bucket)') < text.indexOf('new PrismaClient()'));
});
