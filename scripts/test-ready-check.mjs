import fs from 'node:fs';
const required=['package.json','database/schema.prisma','database/seed.sql','database/migrations/20260829044000_procurement_delivery_inventory/migration.sql','apps/api/test/vertical-slice.e2e-spec.ts','.github/workflows/ci.yml','apps/api/src/procurement/procurement.service.ts','apps/api/src/delivery/delivery.service.ts','apps/api/src/inventory/inventory.service.ts','apps/api/src/kpi/kpi.service.ts'];
let failed=false;for(const f of required){const ok=fs.existsSync(f);console.log(`${ok?'PASS':'FAIL'} ${f}`);failed||=!ok}
const lock=fs.existsSync('package-lock.json');console.log(`${lock?'PASS':'BLOCKED'} package-lock.json`);if(!lock)console.log('Generate on a network-enabled runner using npm install --package-lock-only, commit it, then use npm ci.');
if(failed)process.exit(1);if(!lock)process.exitCode=2;
