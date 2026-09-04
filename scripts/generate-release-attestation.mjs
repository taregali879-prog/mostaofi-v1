import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { computeReleaseDecision } from './release-governance.mjs';

const humanApproval = process.env.HUMAN_APPROVAL === 'GO' ? 'GO' : 'NO-GO';
const version = process.env.RELEASE_VERSION || 'v1.0.0-mvp';
const commitSha = process.env.GITHUB_SHA || process.env.COMMIT_SHA || '';
const runId = process.env.RELEASE_RUN_ID || `${process.env.GITHUB_WORKFLOW || 'release'}/${process.env.DEPLOY_ENV || 'pilot'}/${new Date().toISOString()}/${process.env.GITHUB_RUN_ID || 'local'}`;
const gateDir = 'evidence/runtime/gates';
const gates = {};
if (fs.existsSync(gateDir)) {
  for (const name of fs.readdirSync(gateDir).filter((n) => n.endsWith('.json'))) {
    const value = JSON.parse(fs.readFileSync(path.join(gateDir, name), 'utf8'));
    gates[value.gate] = value;
  }
}
const manifestPath = 'release-artifacts/artifact-manifest.json';
const manifestSha = fs.existsSync(manifestPath)
  ? crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex')
  : null;
const decision = computeReleaseDecision({ gates, humanApproval });
const attestation = {
  schema_version: '1.0',
  release: { version, environment: process.env.DEPLOY_ENV || 'pilot' },
  source: { repository: process.env.GITHUB_REPOSITORY || null, commit_sha: commitSha, ref: process.env.GITHUB_REF || null },
  pipeline: {
    workflow: process.env.GITHUB_WORKFLOW || null,
    github_run_id: process.env.GITHUB_RUN_ID || null,
    run_id: runId,
    attestation_created_at: new Date().toISOString(),
  },
  gates,
  artifacts: { manifest_path: manifestPath, manifest_sha256: manifestSha },
  ...decision,
  override_used: false,
};
fs.writeFileSync('release-artifacts/release-attestation.json', JSON.stringify(attestation, null, 2) + '\n');
console.log(JSON.stringify(decision));
