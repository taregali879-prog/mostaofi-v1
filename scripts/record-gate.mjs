import fs from 'node:fs';
import path from 'node:path';

const [name, status, exitCode, startedAt, completedAt, logPath = ''] = process.argv.slice(2);
if (!name || !['PASS','FAIL','BLOCKED'].includes(status)) process.exit(2);
const sha = logPath && fs.existsSync(logPath)
  ? await import('node:crypto').then(({createHash}) => createHash('sha256').update(fs.readFileSync(logPath)).digest('hex'))
  : null;
const outDir = 'evidence/runtime/gates';
fs.mkdirSync(outDir, { recursive: true });
const payload = {
  gate: name,
  status,
  exit_code: Number(exitCode),
  started_at: startedAt,
  completed_at: completedAt,
  log: logPath || null,
  log_sha256: sha,
};
fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(payload, null, 2) + '\n');
