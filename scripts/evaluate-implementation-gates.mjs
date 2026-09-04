import process from 'node:process';

const raw = await new Promise((resolve, reject) => {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', () => resolve(data));
  process.stdin.on('error', reject);
});

let input;
try {
  input = JSON.parse(raw || '{}');
} catch (error) {
  console.error(`Invalid JSON input: ${error.message}`);
  process.exit(2);
}

const startChecks = [
  ['ERD_BASELINE_NOT_FROZEN', input.erdBaselineStatus === 'FROZEN_FOR_IMPLEMENTATION'],
  ['ERD_DIGEST_NOT_VERIFIED', input.erdDigestVerified === true],
  ['OPENAPI_CANDIDATE_NOT_BOUND', input.openApiCandidateStatus === 'FROZEN_SPECIFICATION_CANDIDATE'],
  ['OPENAPI_DIGEST_NOT_VERIFIED', input.openApiDigestVerified === true],
  ['OPENAPI_STATIC_VALIDATION_NOT_PASS', input.openApiStaticValidationPass === true],
  ['BASELINE_DRIFT_DETECTED', input.baselineDriftDetected === false],
  ['SOURCE_COMMIT_NOT_BOUND', input.sourceCommitBound === true],
  ['SOURCE_TREE_NOT_CLEAN', input.sourceTreeClean === true],
  ['TEST_REGISTRY_NOT_ADOPTED', input.testRegistryStatus === 'ADOPTED_FOR_EXECUTION'],
  ['TEST_REGISTRY_COVERAGE_INCOMPLETE', input.testRegistryCoverageComplete === true],
  ['GOVERNANCE_AUDIT_NOT_PASS', input.governanceAuditPass === true],
  ['DEVELOPMENT_ENVIRONMENT_NOT_READY', input.developmentEnvironmentReady === true],
];

const implementationStartBlockers = startChecks.filter(([, ok]) => !ok).map(([code]) => code);
const implementationStartUnlocked = implementationStartBlockers.length === 0;

const gateResults = input.gateResults ?? {};
const requiredGateIds = Array.from({ length: 10 }, (_, i) => `G${String(i + 1).padStart(2, '0')}`);
const nonPassGates = requiredGateIds.filter(id => gateResults[id] !== 'PASS');

const acceptanceBlockers = [];
if (input.erdBaselineStatus !== 'FROZEN_FOR_IMPLEMENTATION' || input.erdDigestVerified !== true || input.baselineDriftDetected !== false) {
  acceptanceBlockers.push('ERD_BASELINE_NOT_VERIFIED');
}
if (input.openApiCandidateStatus !== 'FROZEN_SPECIFICATION_CANDIDATE' || input.openApiDigestVerified !== true) {
  acceptanceBlockers.push('OPENAPI_CANDIDATE_NOT_VERIFIED');
}
if (input.testRegistryStatus !== 'ADOPTED_FOR_EXECUTION' || input.testRegistryCoverageComplete !== true) {
  acceptanceBlockers.push('TEST_REGISTRY_NOT_VERIFIED');
}
if (input.governanceAuditPass !== true) acceptanceBlockers.push('GOVERNANCE_AUDIT_NOT_PASS');
if (nonPassGates.length) acceptanceBlockers.push(`NON_PASS_GATES:${nonPassGates.join(',')}`);
if (input.allAdoptedContractTests !== 'PASS_EVIDENCED') acceptanceBlockers.push('CONTRACT_TESTS_NOT_PASS_EVIDENCED');
if (input.erdInvariantTests !== 'PASS_EVIDENCED') acceptanceBlockers.push('ERD_INVARIANTS_NOT_PASS_EVIDENCED');
if (input.evidenceIntegrity !== 'VERIFIED') acceptanceBlockers.push('EVIDENCE_INTEGRITY_NOT_VERIFIED');
if (input.testedCommitEqualsAuthorizedCommit !== true) acceptanceBlockers.push('TESTED_COMMIT_NOT_AUTHORIZED_COMMIT');

const sprintAcceptance = acceptanceBlockers.length === 0;
const openApiFinalFreeze = sprintAcceptance;

const output = {
  decisionModel: 'MOSTAOFI-V1.1-GATE-SEPARATION-R001',
  implementationStartUnlocked,
  implementationStartBlockers,
  sprintAcceptance,
  sprintAcceptanceBlockers: acceptanceBlockers,
  openApiFinalFreeze,
  releaseAuthorized: false,
  releaseAuthorizationRule: 'Release/pilot authorization is evaluated by the separate release governance gate and is never implied by implementation start or sprint acceptance.',
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
