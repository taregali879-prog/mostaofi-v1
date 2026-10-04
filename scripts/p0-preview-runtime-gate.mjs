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
  presignS3Request,
  sha256Hex
} from './lib/preview-runtime-gate.mjs';

const db = new PrismaClient();
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
}async function api(base, path, { method = 'GET', token, body, expected } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (expected !== undefined && response.status !== expected) {
    const text = await response.text();
    throw new Error(`HTTP_${method}_${path}_${response.status}:${text.slice(0, 180)}`);
  }
  const type = response.headers.get('content-type') ?? '';
  return type.includes('application/json') ? response.json() : response.text();
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

export async function runPreviewRuntimeGate() {
  const databaseUrl = required('DATABASE_URL');
  const bucket = required('S3_BUCKET');
  assertPreviewDatabaseUrl(databaseUrl);
  assertPreviewBucketName(bucket);
  const apiBase = process.env.PREVIEW_GATE_API_BASE ?? `http://127.0.0.1:${process.env.PORT ?? '4000'}`;
  assertLocalApiBase(apiBase);
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
    await db.$disconnect();
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