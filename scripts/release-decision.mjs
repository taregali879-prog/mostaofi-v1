import fs from 'node:fs';
import { MANDATORY_GATES, computeReleaseDecision } from './release-governance.mjs';

const file = process.argv[2] || 'release-artifacts/release-attestation.json';
const signatureVerified = process.env.ATTESTATION_SIGNATURE_VERIFIED === 'true';
const a = JSON.parse(fs.readFileSync(file, 'utf8'));
const decision = computeReleaseDecision({ gates: a.gates, humanApproval: a.human_approval });
const commitOk = /^[0-9a-f]{40}$/i.test(a?.source?.commit_sha || '');
const manifestOk = /^[0-9a-f]{64}$/i.test(a?.artifacts?.manifest_sha256 || '');
const allEvidenceHasHash = MANDATORY_GATES.every((g) => a.gates?.[g]?.status === 'PASS' && /^[0-9a-f]{64}$/i.test(a.gates?.[g]?.log_sha256 || ''));
if (decision.effective_release_decision !== 'RELEASE GO' || !signatureVerified || !commitOk || !manifestOk || !allEvidenceHasHash || a.override_used !== false) {
  console.error(JSON.stringify({ ...decision, signatureVerified, commitOk, manifestOk, allEvidenceHasHash }, null, 2));
  process.exit(42);
}
console.log(JSON.stringify({ ...decision, signatureVerified, commitOk, manifestOk, allEvidenceHasHash }, null, 2));
