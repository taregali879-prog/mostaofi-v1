import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPreviewDatabaseUrl, assertPreviewBucketName, assertLocalApiBase, presignS3Request, sha256Hex } from '../scripts/lib/preview-runtime-gate.mjs';

test('preview gate refuses any database except mostaofi_preview', () => {
  assert.doesNotThrow(() => assertPreviewDatabaseUrl('postgresql://u:p@db:5432/mostaofi_preview'));
  assert.throws(() => assertPreviewDatabaseUrl('postgresql://u:p@db:5432/mostaofi'), /PREVIEW_DATABASE_REQUIRED/);
});

test('preview gate refuses a non-preview bucket', () => {
  assert.doesNotThrow(() => assertPreviewBucketName('mostaofi-preview'));
  assert.throws(() => assertPreviewBucketName('mostaofi-production'), /PREVIEW_BUCKET_REQUIRED/);
});

test('preview gate only targets localhost HTTP', () => {
  assert.doesNotThrow(() => assertLocalApiBase('http://127.0.0.1:4000'));
  assert.doesNotThrow(() => assertLocalApiBase('http://localhost:4000'));
  assert.throws(() => assertLocalApiBase('https://mostaofi-v1-production.up.railway.app'), /LOCAL_API_REQUIRED/);
});

test('S3 probe signs virtual-hosted PUT, GET and DELETE URLs', () => {
  const cfg = { endpoint: 'https://t3.storageapi.dev', region: 'auto', bucket: 'preview-bucket-123', accessKey: 'access', secretKey: 's'.repeat(48), urlStyle: 'virtual-host' };
  const put = new URL(presignS3Request({ ...cfg, method: 'PUT', key: 'gates/a.bin', contentType: 'application/octet-stream' }).url);
  const get = new URL(presignS3Request({ ...cfg, method: 'GET', key: 'gates/a.bin' }).url);
  const del = new URL(presignS3Request({ ...cfg, method: 'DELETE', key: 'gates/a.bin' }).url);
  for (const u of [put, get, del]) {
    assert.equal(u.host, 'preview-bucket-123.t3.storageapi.dev');
    assert.equal(u.pathname, '/gates/a.bin');
    assert.match(u.searchParams.get('X-Amz-Signature') ?? '', /^[a-f0-9]{64}$/);
  }
  assert.equal(put.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host');
  assert.equal(get.searchParams.get('X-Amz-SignedHeaders'), 'host');
});

test('sha256 helper returns deterministic digest', () => {
  assert.equal(sha256Hex(Buffer.from('mostaofi-preview-gate')), 'cdd7b30010bcf876913d327831c404a12f3af8d0df7068f9b76d55745f07dff5');
});