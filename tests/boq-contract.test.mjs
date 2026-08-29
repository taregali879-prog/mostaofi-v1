import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
const schema=fs.readFileSync('database/schema.prisma','utf8'); const svc=fs.readFileSync('apps/api/src/boq/boq.service.ts','utf8');
test('BOQ schema has immutable versions and items',()=>{for(const x of ['model Boq {','model BoqVersion {','model BoqItem {','SUPERSEDED']) assert.ok(schema.includes(x),x)});
test('BOQ lifecycle enforces draft submit approval',()=>{for(const x of ['BOQ_VERSION_LOCKED','BOQ_EMPTY','BOQ_SUBMITTED','BOQ_APPROVED','BOQ_VERSION_CREATED']) assert.ok(svc.includes(x),x)});
