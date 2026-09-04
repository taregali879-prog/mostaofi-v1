import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = 'scripts/evaluate-s0-acceptance.mjs';
const REQUIRED = [
  'baselineDigests',
  'staticFoundationTests',
  'migrationChainExecution',
  'rlsFailClosedNoTenant',
  'rlsSameTenantReadWrite',
  'rlsCrossTenantDenied',
  'idempotencyUniqueness',
  'auditAppendOnly',
  'domainEventImmutability',
  'regression',
  'evidenceIntegrity',
];

function makeInput(overrides = {}) {
  const checks = Object.fromEntries(REQUIRED.map((name) => [name, name === 'evidenceIntegrity' ? 'VERIFIED' : 'PASS']));
  return {
    sprint: 'S0',
    runId: 'run-s0-test',
    environmentId: 'postgres-test',
    authorizedCommitSha: 'abc123',
    testedCommitSha: 'abc123',
    checks,
    ...overrides,
  };
}

function evaluate(input) {
  const dir = mkdtempSync(join(tmpdir(), 'mostaofi-s0-'));
  const path = join(dir, 'input.json');
  writeFileSync(path, JSON.stringify(input));
  const result = spawnSync(process.execPath, [SCRIPT, path], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

test('S0 acceptance is PASS only when every required executable check is pass-evidenced and commit-bound', () => {
  const result = evaluate(makeInput());
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'PASS');
  assert.equal(output.S0_ACCEPTED, true);
  assert.equal(output.S1_ACCEPTANCE_AUTHORIZED, true);
});

test('S0 acceptance fail-closes on BLOCKED evidence', () => {
  const input = makeInput();
  input.checks.migrationChainExecution = 'BLOCKED';
  const result = evaluate(input);
  assert.equal(result.status, 2);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'BLOCKED');
  assert.equal(output.S0_ACCEPTED, false);
  assert.equal(output.S1_ACCEPTANCE_AUTHORIZED, false);
});

test('S0 acceptance fail-closes on commit mismatch', () => {
  const input = makeInput({ testedCommitSha: 'different' });
  const result = evaluate(input);
  assert.equal(result.status, 3);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'FAIL');
  assert.equal(output.reason, 'TESTED_COMMIT_MISMATCH');
  assert.equal(output.S0_ACCEPTED, false);
});
