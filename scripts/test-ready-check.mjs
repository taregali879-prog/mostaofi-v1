import fs from 'node:fs';
const required=['package.json','database/schema.prisma','database/seed.sql','apps/api/test/vertical-slice.e2e-spec.ts','.github/workflows/ci.yml','apps/api/src/boq/boq.service.ts'];
let failed=false; for(const f of required){const ok=fs.existsSync(f); console.log(`${ok?'PASS':'FAIL'} ${f}`); failed ||= !ok;}
const lock=fs.existsSync('package-lock.json'); console.log(`${lock?'PASS':'BLOCKED'} reproducible dependency lock (package-lock.json)`); if(!lock) console.log('Reason: dependency registry was unreachable in the execution environment; generate with npm install, commit, then npm ci.');
if(failed) process.exit(1);
