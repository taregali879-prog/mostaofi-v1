export const MANDATORY_GATES = Object.freeze([
  'npm_ci',
  'build',
  'migration',
  'e2e',
  'sql_reconciliation',
  'performance',
  'security',
  'artifacts_signing',
  'rollback_verification',
]);

export function computeReleaseDecision({ gates = {}, humanApproval = 'NO-GO' } = {}) {
  const failedOrMissing = MANDATORY_GATES.filter((name) => gates?.[name]?.status !== 'PASS');
  const automatedDecision = failedOrMissing.length === 0 ? 'GO' : 'NO-GO';
  const normalizedHuman = humanApproval === 'GO' ? 'GO' : 'NO-GO';
  const effective = automatedDecision === 'GO' && normalizedHuman === 'GO' ? 'RELEASE GO' : 'NO-GO';

  return {
    automated_decision: automatedDecision,
    human_approval: normalizedHuman,
    effective_release_decision: effective,
    failed_or_missing_gates: failedOrMissing,
  };
}
