import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReleaseDecision, MANDATORY_GATES } from '../scripts/release-governance.mjs';

function passingGates() {
  return Object.fromEntries(MANDATORY_GATES.map((name) => [name, { status: 'PASS' }]));
}

test('all mandatory gates PASS plus human GO yields RELEASE GO', () => {
  const result = computeReleaseDecision({ gates: passingGates(), humanApproval: 'GO' });
  assert.equal(result.automated_decision, 'GO');
  assert.equal(result.effective_release_decision, 'RELEASE GO');
  assert.deepEqual(result.failed_or_missing_gates, []);
});

test('a failed mandatory gate forces NO-GO even with human GO', () => {
  const gates = passingGates();
  gates.e2e.status = 'FAIL';
  const result = computeReleaseDecision({ gates, humanApproval: 'GO' });
  assert.equal(result.automated_decision, 'NO-GO');
  assert.equal(result.effective_release_decision, 'NO-GO');
  assert.deepEqual(result.failed_or_missing_gates, ['e2e']);
});

test('a missing gate forces NO-GO', () => {
  const gates = passingGates();
  delete gates.performance;
  const result = computeReleaseDecision({ gates, humanApproval: 'GO' });
  assert.equal(result.automated_decision, 'NO-GO');
  assert.equal(result.effective_release_decision, 'NO-GO');
  assert.deepEqual(result.failed_or_missing_gates, ['performance']);
});

test('human NO-GO cannot become RELEASE GO when automation passes', () => {
  const result = computeReleaseDecision({ gates: passingGates(), humanApproval: 'NO-GO' });
  assert.equal(result.automated_decision, 'GO');
  assert.equal(result.effective_release_decision, 'NO-GO');
});
