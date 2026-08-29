import { readFileSync } from 'node:fs';
const files = [
  'apps/api/src/auth/auth.controller.ts','apps/api/src/contractors/contractors.controller.ts',
  'apps/api/src/projects/projects.controller.ts','apps/api/src/documents/documents.controller.ts'
];
const all = files.map(f=>readFileSync(f,'utf8')).join('\n');
const requiredTokens = [
  "@Post('login')", "@Get('/me')", "@Post('submit')", "@Post() create",
  "@Get(':id/activity')", "projects/:projectId/documents", "documents/:id/versions"
];
let bad = false;
for (const token of requiredTokens) {
  if (!all.includes(token)) { console.error(`MISSING CONTRACT ${token}`); bad=true; }
  else console.log(`OK ${token}`);
}
if (bad) process.exit(1);
console.log('Vertical slice contract smoke passed.');
