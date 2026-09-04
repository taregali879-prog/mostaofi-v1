import fs from 'node:fs';
const required=[
 'package.json','package-lock.json','database/schema.prisma','database/seed.sql',
 'database/migrations/20260829044000_procurement_delivery_inventory/migration.sql',
 'apps/api/test/vertical-slice.e2e-spec.ts','.github/workflows/ci.yml','.github/workflows/release-mvp.yml',
 'scripts/runner-preflight.sh','scripts/release-gate.sh','scripts/pilot-monitor.mjs',
 'apps/api/src/procurement/procurement.service.ts','apps/api/src/delivery/delivery.service.ts',
 'apps/api/src/inventory/inventory.service.ts','apps/api/src/kpi/kpi.service.ts',
 'evidence/PILOT_CHECKLIST.md','evidence/ROLLBACK_RUNBOOK.md'
];
let failed=false;
for(const f of required){const ok=fs.existsSync(f);console.log(`${ok?'PASS':'FAIL'} ${f}`);failed||=!ok}
if(failed)process.exit(1);
console.log('TEST_READY_STATIC_GATE=PASS');
