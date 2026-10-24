import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const full = process.argv.includes('--full');
const output = resolve('.audit-output', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(output, { recursive: true });
const npm = (...args) => [process.execPath, process.env.npm_execpath, ...args];
const checks = [
  ['dependencies', npm('run', 'deps:check')],
  ['sca', npm('audit', '--json')],
  ['lint', npm('run', 'lint')],
  ['typecheck', npm('run', 'typecheck')],
  ['unit-and-contracts', npm('run', 'test:local')],
  ['evidence-integrity', ['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py']],
  ['sast', ['semgrep', 'scan', '--config', '.semgrep.yml', '--metrics=off', '--disable-version-check', '--error', '--json']],
  ['build', npm('run', 'build')],
  [full ? 'integration-coverage' : 'isolated-api-tests', full ? npm('run', 'test:coverage', '--', '--coverageDirectory=' + resolve(output, 'coverage')) :
    npm('--workspace', 'apps/api', 'run', 'test:e2e', '--', '--runInBand', '--testPathPatterns=bootstrap-config|document-json|password-recovery|registration|s3-signer|numeric-validation')],
];
const results = [];
let activeChild;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  activeChild?.kill(signal);
  process.exit(signal === 'SIGINT' ? 130 : 143);
});
for (const [name, [command, ...args]] of checks) {
  if (full && name === 'integration-coverage' && (!process.env.DATABASE_URL || !process.env.S3_ENDPOINT || process.env.NODE_ENV !== 'test')) {
    results.push({ name, status: 'BLOCKED', reason: 'Requires NODE_ENV=test, DATABASE_URL and S3_ENDPOINT for disposable test services' });
    continue;
  }
  const started = Date.now(), log = createWriteStream(resolve(output, name + '.log'));
  const code = await new Promise(complete => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
    activeChild = child;
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    child.once('error', error => { log.write(error.message + '\n'); complete(127); });
    child.once('close', exitCode => { log.end(); complete(exitCode ?? 1); });
  });
  activeChild = undefined;
  const result = { name, status: code === 0 ? 'PASS' : 'FAIL', exitCode: code, elapsedMs: Date.now() - started, log: name + '.log' };
  results.push(result); console.log(`${name}: ${result.status}`);
}
const passed = results.every(item => item.status === 'PASS');
writeFileSync(resolve(output, 'summary.json'), JSON.stringify({ mode: full ? 'full' : 'local', passed, releaseApproved: false,
  note: 'S1 governance, production SMTP, deployment identity and release approval remain separate gates.', results }, null, 2) + '\n');
console.log('Evidence: ' + output);
process.exitCode = passed ? 0 : 1;
