import test from 'node:test';
import assert from 'node:assert/strict';
import { localLaunchEnvironment } from '../scripts/lib/local-launch-environment.mjs';
import { validateProductionConfig } from '../apps/api/src/config/production-config.ts';

test('local launch uses the loopback API without triggering production deployment validation', () => {
  const env = localLaunchEnvironment({ NODE_ENV: 'production', HOST: '0.0.0.0', WEB_URL: 'https://mostaofi.sa' });
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.NEXT_PUBLIC_API_URL, 'http://localhost:4000/api/v1');
  assert.doesNotThrow(() => validateProductionConfig(env));
  assert.throws(() => validateProductionConfig({ ...env, NODE_ENV: 'production' }), /PRODUCTION_CONFIG_INVALID/);
});
