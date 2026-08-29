import { existsSync, readFileSync } from 'node:fs';
const required = [
  'apps/api/src/main.ts','apps/api/src/app.module.ts','apps/web/app/page.tsx',
  'packages/contracts/src/index.ts','database/schema.prisma','database/migrations/0001_initial/migration.sql',
  'database/seed.sql','.github/workflows/ci.yml','.env.example','docker-compose.yml'
];
let failed = false;
for (const file of required) {
  if (!existsSync(file)) { console.error(`MISSING ${file}`); failed = true; }
  else console.log(`OK ${file}`);
}
const schema = readFileSync('database/schema.prisma','utf8');
for (const model of ['User','Organization','Membership','ContractorProfile','Project','Document','DocumentVersion','AuditEvent']) {
  if (!schema.includes(`model ${model}`)) { console.error(`SCHEMA MISSING ${model}`); failed = true; }
}
if (failed) process.exit(1);
console.log('Repository baseline validation passed.');
