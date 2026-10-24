import { spawnSync } from 'node:child_process';

// npm's exit status alone has not consistently reflected workspace/override problems.
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'ls', '--all', '--json'], {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
let tree;
try { tree = JSON.parse(result.stdout); } catch { process.exit(1); }
const problems = [];
function inspect(node) {
  if (node.problems?.length) problems.push(...node.problems);
  if (node.invalid || node.extraneous || node.missing || node.error) problems.push(node.error?.summary ?? 'Invalid dependency node');
  for (const child of Object.values(node.dependencies ?? {})) inspect(child);
}
inspect(tree);
if (result.error || result.status !== 0 || problems.length) {
  console.error('DEPENDENCY_TREE_INVALID: ' + [...new Set(problems)].join('; '));
  process.exit(1);
}
