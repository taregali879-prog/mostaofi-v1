import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ERD = 'spec/v1.1/Mostaofi-v1.1-Final-ERD-Baseline.md';
const OPENAPI = 'spec/v1.1/Mostaofi-v1.1-OpenAPI-Baseline.yaml';
const MIGRATION = 'database/migrations/20260904000100_v11_s0_foundation/migration.sql';

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const migrationSql = () => readFileSync(MIGRATION, 'utf8');

test('S0 binds the exact frozen ERD and OpenAPI candidate digests', () => {
  assert.equal(sha256(ERD), 'cd57b2b76fee1b962e0a16991414181ea4743004b3065de2ef0376b0f93d6f31');
  assert.equal(sha256(OPENAPI), '46e03a0e625927bee92ce5e0ab7981f27654a228f17ab4462c7c9d0715a61d51');
});

test('S0 migration exists', () => {
  assert.equal(existsSync(MIGRATION), true, `missing ${MIGRATION}`);
});

test('S0 establishes fail-closed tenant and actor context functions', () => {
  const sql = migrationSql();
  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+current_tenant_id\s*\(\s*\)/i);
  assert.match(sql, /current_setting\s*\(\s*'app\.tenant_id'\s*,\s*true\s*\)/i);
  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+current_actor_user_id\s*\(\s*\)/i);
  assert.match(sql, /current_setting\s*\(\s*'app\.actor_user_id'\s*,\s*true\s*\)/i);
});

test('S0 creates the Core organization-to-tenant compatibility bridge without duplicating Core data', () => {
  const sql = migrationSql();
  assert.match(sql, /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+tenant\b/i);
  assert.match(sql, /FROM\s+organizations\b/i);
  assert.doesNotMatch(sql, /CREATE\s+TABLE\s+tenant\b/i);
});

test('S0 idempotency store enforces canonical uniqueness and request SHA-256', () => {
  const sql = migrationSql();
  assert.match(sql, /CREATE\s+TABLE\s+idempotency_record\b/i);
  assert.match(sql, /request_sha256\s+char\s*\(\s*64\s*\)\s+NOT\s+NULL/i);
  assert.match(sql, /CHECK\s*\(\s*request_sha256\s*~\s*'\^\[0-9a-f\]\{64\}\$'\s*\)/i);
  assert.match(sql, /UNIQUE\s*\(\s*tenant_id\s*,\s*actor_user_id\s*,\s*operation_scope\s*,\s*idempotency_key\s*\)/i);
});

test('S0 creates transactional outbox infrastructure with correlation and causation', () => {
  const sql = migrationSql();
  assert.match(sql, /CREATE\s+TABLE\s+domain_event\b/i);
  assert.match(sql, /payload_json\s+jsonb\s+NOT\s+NULL/i);
  assert.match(sql, /correlation_id\s+uuid\s+NOT\s+NULL/i);
  assert.match(sql, /causation_id\s+uuid\s+NULL/i);
  assert.match(sql, /status\s+domain_event_status\s+NOT\s+NULL/i);
});

test('S0 forces RLS on tenant-owned infrastructure tables with fail-closed policies', () => {
  const sql = migrationSql();
  for (const table of ['idempotency_record', 'domain_event']) {
    assert.match(sql, new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'));
    assert.match(sql, new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'));
  }
  assert.match(sql, /USING\s*\(\s*tenant_id\s*=\s*current_tenant_id\s*\(\s*\)\s*\)/i);
  assert.match(sql, /WITH\s+CHECK\s*\(\s*tenant_id\s*=\s*current_tenant_id\s*\(\s*\)\s*\)/i);
});

test('S0 enforces audit append-only and domain-event business-content immutability at DB level', () => {
  const sql = migrationSql();
  assert.match(sql, /BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+audit_events/i);
  assert.match(sql, /RAISE\s+EXCEPTION[^;]*audit/i);
  assert.match(sql, /BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+domain_event/i);
  assert.match(sql, /domain_event[^;]*immutable/i);
});
