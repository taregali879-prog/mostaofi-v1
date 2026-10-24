import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function checkTree(tree) {
  const directory = mkdtempSync(join(tmpdir(), 'mostaofi-tree-'));
  try {
    const fakeNpm = join(directory, 'npm.cjs');
    writeFileSync(fakeNpm, 'process.stdout.write(' + JSON.stringify(JSON.stringify(tree)) + ');');
    return spawnSync(process.execPath, ['scripts/check-dependency-tree.mjs'], {
      encoding: 'utf8', env: { ...process.env, npm_execpath: fakeNpm },
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test('rejects invalid nested dependency metadata even if npm exits successfully', () => {
  const result = checkTree({ dependencies: { lib: { version: '1.0.0', invalid: 'expected 2.0.0' } } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DEPENDENCY_TREE_INVALID/);
});
test('accepts a consistent dependency tree', () => {
  assert.equal(checkTree({ dependencies: { lib: { version: '1.0.0' } } }).status, 0);
});
