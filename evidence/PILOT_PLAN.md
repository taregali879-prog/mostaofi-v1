# Controlled Field Pilot — One Real Project

## Entry gate
- Full `Release MVP` workflow green: runner preflight, `npm ci`, Prisma generate/migrate, seed, E2E, build, performance smoke and SQL reconciliation.
- `v1.0.0-mvp` created by the release workflow only after the gate passes.
- No open Critical/High defects.
- Database recovery point and rollback runbook verified in staging.
- Test tenant/pilot contractor and named project approved.

## Scope
One real project only. One approved BOQ. One Material Requirement. One RFQ/quote comparison and award. One PO. One delivery/inspection/receipt. One warehouse allocation. KPI and Audit verification. No V1 Finance/Execution/Progress Billing features enter the pilot scope.

## Recommended duration
10 business days or until the full scoped procurement cycle is completed, whichever occurs later, with a formal review after days 2, 5 and 10.

## Quantitative success measures
- End-to-end task completion rate: 100% for the scoped flow.
- Manual database intervention: 0.
- Authorization/data-isolation incidents: 0.
- Inventory reconciliation mismatches: 0.
- Missing mandatory Audit events: 0.
- API availability during agreed pilot window: >= 99%.
- Pilot health endpoint p95: <= 800 ms; core API engineering target remains the SRS threshold where measured under representative load.
- HTTP 5xx rate for pilot actions: < 1%, with every occurrence investigated.
- Support interventions: measured and classified; any intervention that changes DB state outside the application is a pilot stop event.

## Business/process observations
- Time from Material Requirement creation to approved PO.
- Time from delivery arrival to accepted inventory.
- Number of screens/clicks requiring clarification.
- User-reported friction by workflow step.
- Number and severity of validation/reconciliation exceptions.

## Daily control
1. Review application/server error logs.
2. Run/inspect pilot health monitor summary.
3. Reconcile current project PO, delivery, inventory and Audit records.
4. Record incidents, workarounds and user feedback in the pilot log.
5. Do not expand project scope during the pilot.

## Stop conditions
Immediately stop new writes for any authorization leak, tenant isolation failure, inventory mismatch, duplicate PO/delivery, missing critical Audit event, database corruption, unrecoverable MinIO/document failure, failed rollback rehearsal, or Critical/High security issue.

## Incident response
- SEV-1: security/data integrity or unrecoverable workflow failure — stop writes immediately, preserve evidence, invoke rollback, notify owner.
- SEV-2: major workflow blocked with safe data — pause affected flow, investigate, release only after regression/E2E passes.
- SEV-3: minor usability/non-blocking defect — log in backlog; do not expand scope mid-pilot.

## Exit
Pilot exits successfully only after the scoped flow completes, reconciliation is clean, no Critical/High defect is open, and the review explicitly approves progression to wider MVP use.
