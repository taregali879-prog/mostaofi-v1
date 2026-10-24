import { spawnSync } from 'node:child_process';

const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this script through npm run setup:audit');
const version = spawnSync(process.execPath, [npm, '--version'], { encoding: 'utf8' });
if (version.status !== 0 || version.stdout.trim() !== '12.2.1') throw new Error('Use npx --yes npm@12.2.1 run setup:audit');
for (const args of [['ci', '--ignore-scripts', '--no-audit', '--fund=false'], ['run', 'db:generate']]) {
  const child = spawnSync(process.execPath, [npm, ...args], { stdio: 'inherit' });
  if (child.status !== 0) process.exit(child.status ?? 1);
}
