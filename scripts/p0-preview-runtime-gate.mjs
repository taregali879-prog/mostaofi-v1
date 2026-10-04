import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  assertLocalApiBase,
  assertPreviewBucketName,
  assertPreviewDatabaseUrl,
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
}async function createUser(organizationId, roles, email, password, displayName) {
  const userId = randomUUID();
  await db.user.create({
    data: { id: userId, email, displayName, passwordHash: passwordHash(password) }
  });
  await db.membership.create({
    data: { id: randomUUID(), userId, organizationId, roles }
  });
  return userId;
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
  }  if (state.projectId) await db.project.deleteMany({ where: { id: state.projectId } });
  if (state.organizationIds.length) {
    await db.auditEvent.deleteMany({ where: { organizationId: { in: state.organizationIds } } });
  }
  if (state.userIds.length) {
    await db.authSession.deleteMany({ where: { userId: { in: state.userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: state.userIds } } });
    await db.user.deleteMany({ where: { id: { in: state.userIds } } });
  }
  if (state.organizationIds.length) {
    await db.organization.deleteMany({ where: { id: { in: state.organizationIds } } });
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
  };  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `Gate-${randomUUID()}!`;
  const state = { organizationIds: [], userIds: [], projectId: null, documentId: null, objectKey: null };
  let gateError = null;
  console.log(`PREVIEW_GATE_START ${runId}`);

  try {
    await waitReady(apiBase);
    await api(apiBase, '/api/v1/projects', { expected: 401 });
    console.log('PREVIEW_GATE_PASS auth_401');

    const orgA = randomUUID(), orgB = randomUUID();
    state.organizationIds.push(orgA, orgB);
    await db.organization.create({ data: { id: orgA, name: `Preview Gate A ${runId}` } });
    await db.organization.create({ data: { id: orgB, name: `Preview Gate B ${runId}` } });

    const viewerEmail = `viewer-${runId}@preview.invalid`;
    const adminAEmail = `admin-a-${runId}@preview.invalid`;
    const adminBEmail = `admin-b-${runId}@preview.invalid`;
    state.userIds.push(await createUser(orgA, ['VIEWER'], viewerEmail, password, 'Preview Viewer'));
    state.userIds.push(await createUser(orgA, ['ORG_ADMIN'], adminAEmail, password, 'Preview Admin A'));
    state.userIds.push(await createUser(orgB, ['ORG_ADMIN'], adminBEmail, password, 'Preview Admin B'));

    const viewerToken = await login(apiBase, viewerEmail, password);
    const adminAToken = await login(apiBase, adminAEmail, password);
    const adminBToken = await login(apiBase, adminBEmail, password);    await api(apiBase, '/api/v1/projects', {
      method: 'POST', token: viewerToken,
      body: { name: 'Forbidden Preview Project', clientName: 'Gate', city: 'Jazan', scope: 'RBAC' },
      expected: 403
    });
    console.log('PREVIEW_GATE_PASS rbac_403');

    const project = await api(apiBase, '/api/v1/projects', {
      method: 'POST', token: adminAToken,
      body: { name: `Preview Gate ${runId}`, clientName: 'Preview Gate', city: 'Jazan', scope: 'Runtime verification' },
      expected: 201
    });
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
    state.objectKey = intent.storageKey;    const putResponse = await fetch(intent.uploadUrl, {
      method: 'PUT', headers: intent.headers ?? { 'content-type': 'application/octet-stream' }, body: content
    });
    if (!putResponse.ok) throw new Error(`BUCKET_PUT_${putResponse.status}`);

    const getSigned = presignS3Request({ ...s3, method: 'GET', key: intent.storageKey });
    const getResponse = await fetch(getSigned.url);
    if (!getResponse.ok) throw new Error(`BUCKET_GET_${getResponse.status}`);
    const downloaded = Buffer.from(await getResponse.arrayBuffer());
    const expectedSha = sha256Hex(content), actualSha = sha256Hex(downloaded);
    if (!content.equals(downloaded) || expectedSha !== actualSha) throw new Error('BUCKET_SHA256_MISMATCH');

    await api(apiBase, `/api/v1/documents/${intent.documentId}/complete`, {
      method: 'POST', token: adminAToken, body: { version: 1, sha256: expectedSha }, expected: 201
    });
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
  }  if (gateError) throw gateError;
  return true;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runPreviewRuntimeGate().catch((error) => {
    console.error(`PREVIEW_GATE_FAIL ${error?.message ?? error}`);
    process.exitCode = 1;
  });
}