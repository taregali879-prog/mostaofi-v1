import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('runtime gate fails closed before network access on a non-preview database', () => {
  const result = spawnSync(process.execPath, ['scripts/p0-preview-runtime-gate.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://u:p@db.internal:5432/mostaofi',
      S3_BUCKET: 'mostaofi-preview'
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /PREVIEW_DATABASE_REQUIRED/);
});