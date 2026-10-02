import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const release = readFileSync('.github/workflows/release-mvp.yml', 'utf8');
const productionConfig = readFileSync('apps/api/src/config/production-config.ts', 'utf8');

test('CI and release do not depend on unavailable MinIO runner images', () => {
  for (const workflow of [ci, release]) {
    assert.doesNotMatch(workflow, /minio\/minio:latest/);
    assert.doesNotMatch(workflow, /minio\/mc:latest/);
    assert.doesNotMatch(workflow, /docker logs minio/);
  }
});

test('production still fails closed on required S3 configuration', () => {
  for (const name of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
    assert.match(productionConfig, new RegExp(`['\"]${name}['\"]`));
  }
});
