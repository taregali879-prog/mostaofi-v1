import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.argv[2] || 'release-artifacts';
const out = process.argv[3] || path.join(root, 'artifact-manifest.json');
const skip = new Set([path.resolve(out), path.resolve(`${out}.bundle`), path.resolve(`${out}.sig`)]);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (!skip.has(path.resolve(full))) {
      const data = fs.readFileSync(full);
      files.push({
        path: path.relative(root, full),
        size_bytes: data.length,
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
      });
    }
  }
}
walk(root);
files.sort((a,b) => a.path.localeCompare(b.path));
fs.writeFileSync(out, JSON.stringify({ schema_version:'1.0', created_at:new Date().toISOString(), files }, null, 2) + '\n');
console.log(out);
