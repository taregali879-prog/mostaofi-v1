import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  assertLocalApiBase,
  assertPreviewBucketName,
  assertPreviewDatabaseUrl,
  PREVIEW_GATE_ADMIN_ROLES,
  PREVIEW_GATE_FIXTURES,
  canDeleteGateUser,
  governedCommandHeaders,
  presignS3Request,
  sha256Hex
} from './lib/preview-runtime-gate.mjs';

let db = null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

function passwordHash(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
async function api(base, path, { method = 'GET', token, body, expected, idempotencyKey, ifMatch, withMeta = false } = {}) {
  const headers = governedCommandHeaders({ token, idempotencyKey, ifMatch });
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (expected !== undefined && response.status !== expected) {
    const text = await response.text();
    throw new Error(`HTTP_${method}_${path}_${response.status}:${text.slice(0, 180)}`);
  }
  const type = response.headers.get('content-type') ?? '';
  const parsed = type.includes('application/json') ? await response.json() : await response.text();
  return withMeta ? { body: parsed, etag: response.headers.get('etag'), status: response.status } : parsed;
}

async function bootstrapPreviewApi() {
  const [{ NestFactory }, { ValidationPipe }, { AppModule }] = await Promise.all([
    import('@nestjs/core'), import('@nestjs/common'), import('../apps/api/dist/app.module.js')
  ]);
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.PREVIEW_GATE_PORT ?? 4101);
  await app.listen(port, '127.0.0.1');
  return { app, base: `http://127.0.0.1:${port}` };
}

async function waitReady(base) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/v1/health/ready`);
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('PREVIEW_API_NOT_READY');
}

async function prunePreviousGateResidue() {
  const staleUsers = await db.user.findMany({
    where: { email: { endsWith: '@preview.invalid' } },
    select: { id: true, _count: { select: { auditEvents: true } } }
  });
  const staleUserIds = staleUsers.map((x) => x.id);
  if (staleUserIds.length) {
    await db.authSession.deleteMany({ where: { userId: { in: staleUserIds } } });
    await db.membership.deleteMany({ where: { userId: { in: staleUserIds } } });
    const deletable = staleUsers.filter((x) => canDeleteGateUser(x._count.auditEvents)).map((x) => x.id);
    if (deletable.length) await db.user.deleteMany({ where: { id: { in: deletable } } });
  }

  const gateOrgs = await db.organization.findMany({
    where: { name: { startsWith: 'Preview Gate ' } },
    include: { _count: { select: { memberships: true, projects: true, documents: true, boqs: true, auditEvents: true } } }
  });
  let removedOrgs = 0, retainedAuditOrgs = 0;
  for (const org of gateOrgs) {
    const c = org._count;
    if (c.memberships || c.projects || c.documents || c.boqs) continue;
    if (c.auditEvents) { retainedAuditOrgs += 1; continue; }
    await db.organization.delete({ where: { id: org.id } });
    removedOrgs += 1;
  }
  const retainedAuditUsers = staleUsers.filter((x) => !canDeleteGateUser(x._count.auditEvents)).length;
  console.log(`PREVIEW_GATE_PRUNE users=${staleUserIds.length} retained_audit_users=${retainedAuditUsers} removed_orgs=${removedOrgs} retained_audit_orgs=${retainedAuditOrgs}`);
}

async function ensureUser(id, organizationId, roles, email, password, displayName) {
  const encoded = passwordHash(password);
  await db.user.upsert({
    where: { id },
    update: { email, displayName, passwordHash: encoded },
    create: { id, email, displayName, passwordHash: encoded }
  });
  await db.membership.upsert({
    where: { userId_organizationId: { userId: id, organizationId } },
    update: { roles },
    create: { id: randomUUID(), userId: id, organizationId, roles }
  });
  return id;
}

async function login(base, email, password) {
  const result = await api(base, '/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
    expected: 201
  });
  if (!result?.accessToken) throw new Error('LOGIN_TOKEN_MISSING');
  return result.accessToken;
}

async function tenantTransaction(tenantId, actorId, work) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.tenant_id', $1::text, true)", tenantId);
    await tx.$executeRawUnsafe("SELECT set_config('app.actor_user_id', $1::text, true)", actorId);
    return work(tx);
  });
}

async function maintenanceCoreFixtures(orgA, actorId) {
  const clientId = '01990000-0000-7000-8000-000000000201';
  const siteId = '01990000-0000-7000-8000-000000000202';
  const contractor = await db.contractorProfile.upsert({
    where: { organizationId: orgA },
    update: { legalName: 'Preview Gate Contractor', commercialRegistrationNo: '9090909090', status: 'APPROVED' },
    create: { id: '01990000-0000-7000-8000-000000000203', organizationId: orgA, legalName: 'Preview Gate Contractor', commercialRegistrationNo: '9090909090', status: 'APPROVED' }
  });
  await tenantTransaction(orgA, actorId, async (tx) => {
    await tx.client.upsert({ where: { id: clientId }, update: { displayName: 'Preview Gate Client', updatedBy: actorId }, create: { id: clientId, tenantId: orgA, displayName: 'Preview Gate Client', createdBy: actorId, updatedBy: actorId } });
    await tx.site.upsert({ where: { id: siteId }, update: { displayName: 'Preview Gate Site', city: 'Jazan', updatedBy: actorId }, create: { id: siteId, tenantId: orgA, clientId, displayName: 'Preview Gate Site', city: 'Jazan', createdBy: actorId, updatedBy: actorId } });
  });
  return { clientId, siteId, contractorId: contractor.id };
}

const command = (base, path, { token, key, ifMatch, body = {}, expected = 200, method = 'POST' }) => api(base, path, { method, token, body, expected, idempotencyKey: key, ifMatch, withMeta: true });

async function cleanup(state, s3) {
  if (state.objectKey) {
    try {
      const del = presignS3Request({ ...s3, method: 'DELETE', key: state.objectKey });
      await fetch(del.url, { method: 'DELETE' });
    } catch {}
  }
  if (state.documentId) {
    await db.documentVersion.deleteMany({ where: { documentId: state.documentId } });
    await db.document.deleteMany({ where: { id: state.documentId } });
  }
  if (state.projectId) await db.project.deleteMany({ where: { id: state.projectId } });
  if (state.userIds.length) {
    await db.authSession.deleteMany({ where: { userId: { in: state.userIds } } });
  }
}

async function runMaintenanceJourney(base, { viewerToken, adminAToken, adminBToken, orgA, adminAId, runId }) {
  const core = await maintenanceCoreFixtures(orgA, adminAId);
  const slaBody = { name:`Preview Gate SLA ${runId}`, responseTargetMinutes:30, arrivalTargetMinutes:60, resolutionTargetMinutes:240, workingHoursPolicy:{}, timezone:'Asia/Riyadh', effectiveFrom:'2026-10-04' };
  await api(base, '/api/v1/maintenance/sla-policies', { method:'POST', token:viewerToken, body:slaBody, expected:403, idempotencyKey:`maintenance-viewer-${runId}` });
  console.log('PREVIEW_GATE_PASS maintenance_rbac');

  const sla = await command(base, '/api/v1/maintenance/sla-policies', { token:adminAToken, key:`maintenance-sla-${runId}`, body:slaBody, expected:201 });
  const technician = await command(base, '/api/v1/maintenance/technicians', { token:adminAToken, key:`maintenance-tech-${runId}`, body:{ contractorId:core.contractorId, employeeCode:`PG-${runId}`, displayName:'Preview Gate Technician', mobile:'0500000777' }, expected:201 });
  const contract = await command(base, '/api/v1/maintenance/contracts', { token:adminAToken, key:`maintenance-contract-${runId}`, body:{ clientId:core.clientId, contractorId:core.contractorId, contractType:'PREVENTIVE', startDate:'2026-10-04', endDate:'2027-10-03', plannedVisits:12, visitFrequencyType:'MONTH', visitFrequencyValue:1, contractValue:12000, vatAmount:1800, currency:'SAR', slaPolicyId:sla.body.id }, expected:201 });
  let contractEtag=contract.etag;
  await api(base, `/api/v1/maintenance/contracts/${contract.body.id}`, { token:adminBToken, expected:404 });
  console.log('PREVIEW_GATE_PASS maintenance_tenant_isolation');

  const site = await command(base, `/api/v1/maintenance/contracts/${contract.body.id}/sites`, { token:adminAToken, key:`maintenance-site-${runId}`, ifMatch:contractEtag, body:{siteId:core.siteId}, expected:201 }); contractEtag=site.etag;
  const scope = await command(base, `/api/v1/maintenance/contracts/${contract.body.id}/scopes`, { token:adminAToken, key:`maintenance-scope-${runId}`, ifMatch:contractEtag, body:{scopeCategory:'FIRE',serviceType:'PREVENTIVE',description:'Preview fire maintenance',included:true,visitLimit:12}, expected:201 }); contractEtag=scope.etag;
  const submitted = await command(base, `/api/v1/maintenance/contracts/${contract.body.id}/submit`, { token:adminAToken, key:`maintenance-submit-${runId}`, ifMatch:contractEtag }); contractEtag=submitted.etag;
  const activated = await command(base, `/api/v1/maintenance/contracts/${contract.body.id}/activate`, { token:adminAToken, key:`maintenance-activate-${runId}`, ifMatch:contractEtag }); contractEtag=activated.etag;
  const visit = await command(base, `/api/v1/maintenance/contracts/${contract.body.id}/visits`, { token:adminAToken, key:`maintenance-visit-${runId}`, ifMatch:contractEtag, body:{siteId:core.siteId,visitKind:'PLANNED_MAINTENANCE',scheduledStart:'2026-10-10T08:00:00Z',scheduledEnd:'2026-10-10T10:00:00Z'}, expected:201 });
  let visitState=await api(base, `/api/v1/maintenance/visits/${visit.body.id}`, {token:adminAToken,expected:200,withMeta:true}), visitEtag=visitState.etag;
  for (const action of ['schedule','confirm','arrive','start']) { const r=await command(base, `/api/v1/maintenance/visits/${visit.body.id}/${action}`, { token:adminAToken,key:`maintenance-visit-${action}-${runId}`,ifMatch:visitEtag }); visitEtag=r.etag; }

  const workOrder = await command(base, `/api/v1/maintenance/visits/${visit.body.id}/work-orders`, { token:adminAToken,key:`maintenance-wo-${runId}`,ifMatch:visitEtag,body:{serviceType:'PREVENTIVE',priority:'HIGH',scheduledStart:'2026-10-10T08:30:00Z',slaDeadline:'2026-10-10T12:00:00Z'},expected:201 });
  let woState=await api(base, `/api/v1/maintenance/work-orders/${workOrder.body.id}`, {token:adminAToken,expected:200,withMeta:true}), woEtag=woState.etag;
  const assignment=await command(base, `/api/v1/maintenance/work-orders/${workOrder.body.id}/assignments`, { token:adminAToken,key:`maintenance-assign-${runId}`,ifMatch:woEtag,body:{technicianId:technician.body.id,role:'LEAD_TECHNICIAN'},expected:201 }); woEtag=assignment.etag;
  const accepted=await command(base, `/api/v1/maintenance/work-orders/${workOrder.body.id}/assignments/${assignment.body.id}/accept`, { token:adminAToken,key:`maintenance-accept-${runId}`,ifMatch:woEtag }); woEtag=accepted.etag;
  const arrived=await command(base, `/api/v1/maintenance/work-orders/${workOrder.body.id}/arrive`, { token:adminAToken,key:`maintenance-wo-arrive-${runId}`,ifMatch:woEtag }); woEtag=arrived.etag;
  const started=await command(base, `/api/v1/maintenance/work-orders/${workOrder.body.id}/start`, { token:adminAToken,key:`maintenance-wo-start-${runId}`,ifMatch:woEtag }); woEtag=started.etag;

  const template=await command(base, '/api/v1/maintenance/inspection-templates', {token:adminAToken,key:`maintenance-template-${runId}`,body:{name:`Preview Gate Template ${runId}`,serviceType:'PREVENTIVE'},expected:201});
  const version=await command(base, `/api/v1/maintenance/inspection-templates/${template.body.id}/versions`, {token:adminAToken,key:`maintenance-version-${runId}`,ifMatch:template.etag,body:{effectiveFrom:'2026-10-04'},expected:201});
  let versionState=await api(base, `/api/v1/maintenance/inspection-template-versions/${version.body.id}`, {token:adminAToken,expected:200,withMeta:true}),versionEtag=versionState.etag;
  const section=await command(base, `/api/v1/maintenance/inspection-template-versions/${version.body.id}/sections`, {token:adminAToken,key:`maintenance-section-${runId}`,ifMatch:versionEtag,body:{title:'Fire Alarm',displayOrder:1},expected:201});
  const item=await command(base, `/api/v1/maintenance/inspection-sections/${section.body.id}/items`, {token:adminAToken,key:`maintenance-item-${runId}`,ifMatch:section.etag,body:{code:'PG-001',question:'Detector operational?',answerType:'PASS_FAIL',required:true,requiresEvidenceOnFail:false,displayOrder:1},expected:201});
  versionState=await api(base, `/api/v1/maintenance/inspection-template-versions/${version.body.id}`, {token:adminAToken,expected:200,withMeta:true});versionEtag=versionState.etag;
  const review=await command(base, `/api/v1/maintenance/inspection-template-versions/${version.body.id}/submit-review`, {token:adminAToken,key:`maintenance-review-${runId}`,ifMatch:versionEtag});versionEtag=review.etag;
  await command(base, `/api/v1/maintenance/inspection-template-versions/${version.body.id}/publish`, {token:adminAToken,key:`maintenance-publish-${runId}`,ifMatch:versionEtag});

  const inspection=await command(base, `/api/v1/maintenance/work-orders/${workOrder.body.id}/inspections`, {token:adminAToken,key:`maintenance-inspection-${runId}`,ifMatch:woEtag,body:{templateVersionId:version.body.id,performedBy:technician.body.id},expected:201});
  let inspectionState=await api(base, `/api/v1/maintenance/inspections/${inspection.body.id}`, {token:adminAToken,expected:200,withMeta:true}),inspectionEtag=inspectionState.etag;
  const inspectionStarted=await command(base, `/api/v1/maintenance/inspections/${inspection.body.id}/start`, {token:adminAToken,key:`maintenance-inspection-start-${runId}`,ifMatch:inspectionEtag});inspectionEtag=inspectionStarted.etag;
  const answer=await api(base, `/api/v1/maintenance/inspections/${inspection.body.id}/answers/${item.body.id}`, {method:'PUT',token:adminAToken,body:{answerBoolean:false,result:'FAIL',recordedAt:new Date().toISOString()},expected:200,idempotencyKey:`maintenance-answer-${runId}`,ifMatch:inspectionEtag,withMeta:true});inspectionEtag=answer.etag;
  const completed=await command(base, `/api/v1/maintenance/inspections/${inspection.body.id}/complete`, {token:adminAToken,key:`maintenance-inspection-complete-${runId}`,ifMatch:inspectionEtag});inspectionEtag=completed.etag;
  const finding=await command(base, `/api/v1/maintenance/inspections/${inspection.body.id}/findings`, {token:adminAToken,key:`maintenance-finding-${runId}`,ifMatch:inspectionEtag,body:{inspectionItemId:item.body.id,findingType:'FAULT',category:'FIRE_ALARM',title:`Preview detector fault ${runId}`,description:'Gate-detected fault',severity:'HIGH',riskLevel:'HIGH'},expected:201});
  await api(base, `/api/v1/maintenance/findings/${finding.body.id}`, {token:adminBToken,expected:404});
  const finalWorkOrder=await api(base, `/api/v1/maintenance/work-orders/${workOrder.body.id}`, {token:adminAToken,expected:200});
  if(finalWorkOrder.status!=='ACTION_REQUIRED'||finding.body.status!=='OPEN')throw new Error('MAINTENANCE_VERTICAL_STATE_MISMATCH');
  console.log('PREVIEW_GATE_PASS maintenance_vertical');
}

export async function runPreviewRuntimeGate() {
  const databaseUrl = required('DATABASE_URL');
  const bucket = required('S3_BUCKET');
  assertPreviewDatabaseUrl(databaseUrl);
  assertPreviewBucketName(bucket);
  db = new PrismaClient();
  let bootstrappedApi = null;
  let apiBase;
  if (process.env.PREVIEW_GATE_API_BASE) {
    apiBase = process.env.PREVIEW_GATE_API_BASE;
    assertLocalApiBase(apiBase);
  } else {
    bootstrappedApi = await bootstrapPreviewApi();
    apiBase = bootstrappedApi.base;
    assertLocalApiBase(apiBase);
  }
  const s3 = {
    endpoint: required('S3_ENDPOINT'),
    region: process.env.S3_REGION ?? 'auto',
    bucket,
    accessKey: required('S3_ACCESS_KEY'),
    secretKey: required('S3_SECRET_KEY'),
    urlStyle: process.env.S3_URL_STYLE ?? 'path'
  };
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `Gate-${randomUUID()}!`;
  const state = { userIds: [], projectId: null, documentId: null, objectKey: null };
  let gateError = null;
  console.log(`PREVIEW_GATE_START ${runId}`);

  try {
    await prunePreviousGateResidue();
    await waitReady(apiBase);
    await api(apiBase, '/api/v1/projects', { expected: 401 });
    console.log('PREVIEW_GATE_PASS auth_401');

    const orgA = PREVIEW_GATE_FIXTURES.orgA, orgB = PREVIEW_GATE_FIXTURES.orgB;
    await db.organization.upsert({ where: { id: orgA }, update: { name: 'Preview Gate Fixture A' }, create: { id: orgA, name: 'Preview Gate Fixture A' } });
    await db.organization.upsert({ where: { id: orgB }, update: { name: 'Preview Gate Fixture B' }, create: { id: orgB, name: 'Preview Gate Fixture B' } });

    const [viewerFixture, adminAFixture, adminBFixture] = PREVIEW_GATE_FIXTURES.users;
    state.userIds.push(await ensureUser(viewerFixture.id, orgA, viewerFixture.roles, viewerFixture.email, password, viewerFixture.displayName));
    state.userIds.push(await ensureUser(adminAFixture.id, orgA, PREVIEW_GATE_ADMIN_ROLES, adminAFixture.email, password, adminAFixture.displayName));
    state.userIds.push(await ensureUser(adminBFixture.id, orgB, adminBFixture.roles, adminBFixture.email, password, adminBFixture.displayName));

    const viewerToken = await login(apiBase, viewerFixture.email, password);
    const adminAToken = await login(apiBase, adminAFixture.email, password);
    const adminBToken = await login(apiBase, adminBFixture.email, password);
    await api(apiBase, '/api/v1/projects', {
      method: 'POST', token: viewerToken,
      body: { name: 'Forbidden Preview Project', clientName: 'Gate', city: 'Jazan', scope: 'RBAC' },
      expected: 403
    });
    console.log('PREVIEW_GATE_PASS rbac_403');

    const project = await db.project.create({ data: {
      id: randomUUID(), organizationId: orgA, name: `Preview Gate ${runId}`,
      clientName: 'Preview Gate', city: 'Jazan', scope: 'Runtime verification'
    }});
    state.projectId = project.id;
    await api(apiBase, `/api/v1/projects/${project.id}`, { token: adminBToken, expected: 404 });
    await api(apiBase, `/api/v1/projects/${project.id}`, { token: adminAToken, expected: 200 });
    console.log('PREVIEW_GATE_PASS tenant_isolation');

    await runMaintenanceJourney(apiBase, { viewerToken, adminAToken, adminBToken, orgA, adminAId: adminAFixture.id, runId });

    const content = randomBytes(96);
    const intent = await api(apiBase, `/api/v1/projects/${project.id}/documents/upload-intent`, {
      method: 'POST', token: adminAToken,
      body: { type: 'GATE', title: 'Preview Bucket Gate', fileName: `gate-${runId}.bin`, mimeType: 'application/octet-stream', sizeBytes: content.length },
      expected: 201
    });
    state.documentId = intent.documentId;
    state.objectKey = intent.storageKey;

    const putResponse = await fetch(intent.uploadUrl, {
      method: 'PUT', headers: intent.headers ?? { 'content-type': 'application/octet-stream' }, body: content
    });
    if (!putResponse.ok) throw new Error(`BUCKET_PUT_${putResponse.status}`);

    const getSigned = presignS3Request({ ...s3, method: 'GET', key: intent.storageKey });
    const getResponse = await fetch(getSigned.url);
    if (!getResponse.ok) throw new Error(`BUCKET_GET_${getResponse.status}`);
    const downloaded = Buffer.from(await getResponse.arrayBuffer());
    const expectedSha = sha256Hex(content), actualSha = sha256Hex(downloaded);
    if (!content.equals(downloaded) || expectedSha !== actualSha) throw new Error('BUCKET_SHA256_MISMATCH');

    const delSigned = presignS3Request({ ...s3, method: 'DELETE', key: intent.storageKey });
    const delResponse = await fetch(delSigned.url, { method: 'DELETE' });
    if (!delResponse.ok) throw new Error(`BUCKET_DELETE_${delResponse.status}`);
    state.objectKey = null;
    console.log(`PREVIEW_GATE_PASS bucket_roundtrip sha256=${expectedSha}`);
    console.log('PREVIEW_GATE_PASS all');
  } catch (error) {
    gateError = error;
  } finally {
    try { await cleanup(state, s3); }
    catch (cleanupError) { if (!gateError) gateError = cleanupError; else console.error(`PREVIEW_GATE_CLEANUP_FAIL ${cleanupError.message}`); }
    if (bootstrappedApi?.app) await bootstrappedApi.app.close();
    if (db) await db.$disconnect();
  }
  if (gateError) throw gateError;
  return true;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runPreviewRuntimeGate().catch((error) => {
    console.error(`PREVIEW_GATE_FAIL ${error?.message ?? error}`);
    process.exitCode = 1;
  });
}