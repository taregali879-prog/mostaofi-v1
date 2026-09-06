import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('../../', import.meta.url);
const text = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const json = (path) => JSON.parse(text(path));

test('S0 acceptance governance artifacts bind the accepted run and all three delivered bundle SHA-256 values', () => {
  assert.ok(existsSync(new URL('governance/v1.1/s0/S0-ACCEPTANCE-RECORD.json', ROOT)));
  assert.ok(existsSync(new URL('governance/v1.1/s0/S0-EVIDENCE-INDEX.json', ROOT)));
  assert.ok(existsSync(new URL('governance/v1.1/s0/S0-ACCEPTANCE-CERTIFICATE.md', ROOT)));
  const record = json('governance/v1.1/s0/S0-ACCEPTANCE-RECORD.json');
  assert.equal(record.status, 'PASS');
  assert.equal(record.S0_ACCEPTED, true);
  assert.equal(record.S1_ACCEPTANCE_AUTHORIZED, true);
  assert.equal(record.testedCommitSha, 'e99854862d9b874da9258e8496dbd544e5312605');
  const index = json('governance/v1.1/s0/S0-EVIDENCE-INDEX.json');
  assert.equal(index.bundles.evidence.sha256, '7c95096a098a967805294044076471dc4a8efb1df9f9781b7177ead7a845c9b1');
  assert.equal(index.bundles.source.sha256, '643eb6a94f309f229531cff6222afe5f24efa55c14f7a6870db62cda2466de11');
  assert.equal(index.bundles.gitBundle.sha256, '513582a62efe738c3d8f1e7487f072e8076bab6899dcc0923a1bb2db48cd5ee1');
});

test('S1 corrected manifest keeps Registry R002 semantics and binds accepted S0', () => {
  const manifest = text('governance/s1/ci-manifest-r003.yaml');
  assert.match(manifest, /manifestVersion:\s*['"]?3\.0/);
  assert.match(manifest, /S0_ACCEPTED:\s*true/);
  assert.match(manifest, /S1_ACCEPTANCE_AUTHORIZED:\s*true/);
  assert.match(manifest, /revision:\s*['"]?002/);
  assert.match(manifest, /S1-CT-072/);
  assert.match(manifest, /S1-CT-074/);
  assert.match(manifest, /S1_PASS\s*=\s*G01/);
  assert.match(manifest, /S2_UNLOCKED\s*=\s*S1_PASS/);
});

test('S1 evidence governance artifacts define runbook, directory structure, template, and final matrix', () => {
  for (const path of [
    'governance/s1/S1-CI-EXECUTION-RUNBOOK-R003.md',
    'governance/s1/S1-EVIDENCE-DIRECTORY-STRUCTURE.md',
    'governance/s1/templates/s1-evidence-artifact.template.json',
    'governance/s1/S1-GOVERNANCE-MATRIX-FINAL.yaml',
    'scripts/run-s1-evidence.py',
  ]) assert.ok(existsSync(new URL(path, ROOT)), `${path} missing`);
});

test('S1 evidence runner fail-closes all adopted CTs when G01 strict validation is blocked', () => {
  const out = mkdtempSync(join(tmpdir(), 'mostaofi-s1-evidence-'));
  const runner = spawnSync('python3', ['scripts/run-s1-evidence.py', '--output', out, '--mode', 'dry-run-blocked'], {
    cwd: new URL('../..', import.meta.url), encoding: 'utf8', env: { ...process.env }
  });
  assert.equal(runner.status, 2, runner.stderr || runner.stdout);
  const decision = JSON.parse(readFileSync(join(out, 's1-gate-decision.json'), 'utf8'));
  assert.equal(decision.S1_PASS, false);
  assert.equal(decision.S2_UNLOCKED, false);
  assert.equal(decision.gates.G01, 'BLOCKED');
  const summary = JSON.parse(readFileSync(join(out, 'test-summary.json'), 'utf8'));
  assert.equal(summary.adoptedTestCount, 34);
  assert.equal(summary.canonicalThrough071DefinedTestCount, 31);
  assert.equal(summary.pass, 0);
  assert.equal(summary.blocked, 34);
  rmSync(out, { recursive: true, force: true });
});

test('S1 runner captures clean-tree preflight before mutating the evidence output directory', () => {
  const source = text('scripts/run-s1-evidence.py');
  const statusPos = source.indexOf("git('status','--porcelain')");
  const removePos = source.indexOf('out.mkdir(parents=True');
  assert.ok(statusPos >= 0 && removePos >= 0, 'expected status and output cleanup operations');
  assert.ok(statusPos < removePos, 'git status must be captured before evidence output is deleted or rewritten');
});
