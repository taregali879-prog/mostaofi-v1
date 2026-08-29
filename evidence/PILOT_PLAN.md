# Controlled Field Pilot — one real project

## Entry gate
- Full CI green: npm ci, Prisma generate/migrate, seed, E2E, build, performance smoke.
- No open Critical/High defects.
- Backups and rollback runbook verified.
- Test tenant and one pilot contractor approved.

## Pilot scope
One project only. One approved BOQ. One supplier quotation cycle. One purchase order. One delivery/inspection. One warehouse receipt. One project allocation. KPI and Audit verification.

## Measured observations
- Task completion rate.
- Number of support interventions.
- HTTP/API failures.
- Data reconciliation mismatches.
- Time from Material Requirement to PO.
- Time from Delivery arrival to accepted inventory.
- User-reported friction points by screen/step.

## Stop conditions
Any authorization leak, inventory mismatch, duplicate PO/delivery, missing audit event, failed rollback, or Critical/High security issue stops the pilot.
