import { readFileSync } from 'node:fs';
const files=[
'apps/api/src/auth/auth.controller.ts','apps/api/src/contractors/contractors.controller.ts','apps/api/src/projects/projects.controller.ts','apps/api/src/documents/documents.controller.ts','apps/api/src/boq/boq.controller.ts','apps/api/src/procurement/procurement.controller.ts','apps/api/src/delivery/delivery.controller.ts','apps/api/src/inventory/inventory.controller.ts','apps/api/src/kpi/kpi.controller.ts'
];
const all=files.map(f=>readFileSync(f,'utf8')).join('\n');
const required=["@Post('login')","@Get('/me')","@Post('projects/:projectId/material-requirements')","@Post('material-requirements/:id/rfqs')","@Post('rfqs/:id/quotes')","@Get('rfqs/:id/comparison')","@Post('rfqs/:id/award')","@Post('rfqs/:id/purchase-orders')","@Post('purchase-orders/:id/approve')","@Post('purchase-orders/:poId/deliveries')","@Post('deliveries/:id/inspect')","@Post('deliveries/:id/receive')","@Post('projects/:projectId/materials/allocate')","@Post('projects/:projectId/materials/issue')","@Post('projects/:projectId/materials/return')","@Get('projects/:projectId/materials/kpis')"];
let bad=false;for(const t of required){if(!all.includes(t)){console.error('MISSING CONTRACT',t);bad=true}else console.log('OK',t)}if(bad)process.exit(1);console.log('MVP S4-S8 contract smoke passed.');
