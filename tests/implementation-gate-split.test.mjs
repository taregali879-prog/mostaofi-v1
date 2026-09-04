import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const protocol = readFileSync(new URL('../governance/s1/IMPLEMENTATION-UNLOCK-PROTOCOL.md', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../governance/s1/ci-manifest-r002.yaml', import.meta.url), 'utf8');

function evaluate(input) {
  const result = spawnSync(process.execPath, ['scripts/evaluate-implementation-gates.mjs'], {
    cwd: new URL('..', import.meta.url),
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `evaluator failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function startReady(overrides = {}) {
  return {
    erdBaselineStatus: 'FROZEN_FOR_IMPLEMENTATION',
    erdDigestVerified: true,
    openApiCandidateStatus: 'FROZEN_SPECIFICATION_CANDIDATE',
    openApiDigestVerified: true,
    openApiStaticValidationPass: true,
    baselineDriftDetected: false,
    sourceCommitBound: true,
    sourceTreeClean: true,
    testRegistryStatus: 'ADOPTED_FOR_EXECUTION',
    testRegistryCoverageComplete: true,
    governanceAuditPass: true,
    developmentEnvironmentReady: true,
    gateResults: {
      G01: 'BLOCKED', G02: 'NOT_AUTHORIZED', G03: 'NOT_AUTHORIZED', G04: 'NOT_AUTHORIZED', G05: 'NOT_AUTHORIZED',
      G06: 'NOT_AUTHORIZED', G07: 'NOT_AUTHORIZED', G08: 'BLOCKED', G09: 'NOT_AUTHORIZED', G10: 'NOT_AUTHORIZED',
    },
    allAdoptedContractTests: 'NOT_PASS_EVIDENCED',
    erdInvariantTests: 'NOT_PASS_EVIDENCED',
    evidenceIntegrity: 'VALID',
    testedCommitEqualsAuthorizedCommit: false,
    ...overrides,
  };
}

test('governance protocol explicitly separates implementation start from acceptance/final freeze', () => {
  assert.match(protocol, /IMPLEMENTATION_START_UNLOCK/);
  assert.match(protocol, /SPRINT_ACCEPTANCE/);
  assert.match(protocol, /OPENAPI_FINAL_FREEZE/);
  assert.match(protocol, /does not authorize release|لا يصرح بالإصدار|does not authorize pilot/i);
});

test('manifest defines separate implementation-start and acceptance policies', () => {
  assert.match(manifest, /^implementationStartPolicy:/m);
  assert.match(manifest, /^sprintAcceptancePolicy:/m);
  assert.match(manifest, /^openApiFinalFreezePolicy:/m);
});


test('legacy unlock rule no longer conflates implementation start with S1 acceptance', () => {
  assert.doesNotMatch(manifest, /S2_UNLOCKED:\s*S1_IMPLEMENTATION == PASS/);
  assert.match(manifest, /IMPLEMENTATION_START_UNLOCK:/);
  assert.match(manifest, /SPRINT_ACCEPTANCE:/);
});

test('implementation can start with runtime contract gates still blocked', () => {
  const decision = evaluate(startReady());
  assert.equal(decision.implementationStartUnlocked, true);
  assert.equal(decision.sprintAcceptance, false);
  assert.equal(decision.openApiFinalFreeze, false);
});

test('baseline drift fail-closes implementation start', () => {
  const decision = evaluate(startReady({ baselineDriftDetected: true }));
  assert.equal(decision.implementationStartUnlocked, false);
  assert.ok(decision.implementationStartBlockers.includes('BASELINE_DRIFT_DETECTED'));
});

test('full pass-evidenced gates unlock acceptance and final freeze', () => {
  const allPass = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`G${String(i + 1).padStart(2, '0')}`, 'PASS']));
  const decision = evaluate(startReady({
    gateResults: allPass,
    allAdoptedContractTests: 'PASS_EVIDENCED',
    erdInvariantTests: 'PASS_EVIDENCED',
    evidenceIntegrity: 'VERIFIED',
    testedCommitEqualsAuthorizedCommit: true,
  }));
  assert.equal(decision.implementationStartUnlocked, true);
  assert.equal(decision.sprintAcceptance, true);
  assert.equal(decision.openApiFinalFreeze, true);
});
