#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('usage: node scripts/evaluate-s0-acceptance.mjs <evidence-input.json>');
  process.exit(64);
}

const input = JSON.parse(readFileSync(inputPath, 'utf8'));
const requiredChecks = [
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

const decision = {
  sprint: 'S0',
  runId: input.runId ?? null,
  environmentId: input.environmentId ?? null,
  authorizedCommitSha: input.authorizedCommitSha ?? null,
  testedCommitSha: input.testedCommitSha ?? null,
  status: 'BLOCKED',
  reason: null,
  S0_ACCEPTED: false,
  S1_ACCEPTANCE_AUTHORIZED: false,
  requiredChecks: {},
};

if (input.sprint !== 'S0') {
  decision.status = 'FAIL';
  decision.reason = 'INVALID_SPRINT';
  console.log(JSON.stringify(decision, null, 2));
  process.exit(3);
}

if (!input.authorizedCommitSha || input.testedCommitSha !== input.authorizedCommitSha) {
  decision.status = 'FAIL';
  decision.reason = 'TESTED_COMMIT_MISMATCH';
  console.log(JSON.stringify(decision, null, 2));
  process.exit(3);
}

let hasBlocked = false;
let hasFail = false;
for (const name of requiredChecks) {
  const value = input.checks?.[name] ?? 'MISSING';
  decision.requiredChecks[name] = value;
  const expected = name === 'evidenceIntegrity' ? 'VERIFIED' : 'PASS';
  if (value === expected) continue;
  if (value === 'FAIL') hasFail = true;
  else hasBlocked = true;
}

if (hasFail) {
  decision.status = 'FAIL';
  decision.reason = 'REQUIRED_CHECK_FAILED';
  console.log(JSON.stringify(decision, null, 2));
  process.exit(3);
}

if (hasBlocked) {
  decision.status = 'BLOCKED';
  decision.reason = 'REQUIRED_EVIDENCE_NOT_PASS_VERIFIED';
  console.log(JSON.stringify(decision, null, 2));
  process.exit(2);
}

decision.status = 'PASS';
decision.reason = 'ALL_S0_ACCEPTANCE_CHECKS_PASS_EVIDENCED';
decision.S0_ACCEPTED = true;
decision.S1_ACCEPTANCE_AUTHORIZED = true;
console.log(JSON.stringify(decision, null, 2));
