# Mostaofi v1.1 — Maintenance Slice Design

Status: `DESIGN_APPROVED_IN_CHAT / SPEC_REVIEW_PENDING`
Date: 2026-10-04
Source commit: `9f61f7af932d05dbf13b913572b2880e09c60e77`

## 1. Goal

Implement the first production-shaped v1.1 maintenance slice on Git Preview only, while preserving the current MVP flows and keeping `Mostaofi V1` live as rollback.

The accepted vertical path is:

`MaintenanceContract → MaintenanceVisit → WorkOrder → Inspection → Finding`

Success means this chain is persisted, tenant-isolated, RBAC-protected, audit-evidenced, API-accessible, and visible through `/work-orders` and `/findings` in the Git Preview web app.

No production-domain cutover, live-service mutation, or production-database migration is authorized by this design.

## 2. Governing sources

- Frozen ERD: `MOSTAOFI-V1.1-ERD-BASELINE-001` in `spec/v1.1/Mostaofi-v1.1-Final-ERD-Baseline.md`.
- S1 API contract candidate: `spec/s1/openapi.yaml`.
- Governance: `governance/s1/IMPLEMENTATION-UNLOCK-PROTOCOL.md`.
- Existing S0 compatibility bridge: `tenant` view over `organizations`, fail-closed tenant context helpers, RLS foundations, idempotency and domain-event infrastructure.
- Current MVP authentication/RBAC/audit mechanisms remain authoritative unless a frozen v1.1 contract requires stricter behavior.
## 3. Core compatibility prerequisite

The frozen ERD requires canonical Core entities `tenant`, `user`, `client`, `contractor`, and `site`. The current v0.5 code has `Organization`, `User`, and `ContractorProfile`, but lacks canonical `client` and `site` persistence and does not expose a frozen-Core `contractor` identity.

The implementation must not create v1.1 shadow copies of Core entities. Instead it will add a controlled Core compatibility layer before the maintenance tables:

1. Keep `tenant` mapped to `organizations` through the existing S0 bridge.
2. Introduce canonical Core-compatible `client`, `contractor`, and `site` persistence only where the current schema has no equivalent identity.
3. Link the existing `contractor_profiles.organization_id` to the canonical contractor identity rather than duplicating profile data.
4. Preserve all existing MVP project/procurement data; no destructive rename or data rewrite is permitted in this slice.
5. Every compatibility table is tenant-owned, receives `UNIQUE (tenant_id, id)`, composite tenant FKs where applicable, and fail-closed RLS.

This prerequisite is an implementation dependency, not a change to the frozen v1.1 ERD.

## 4. Slice data model

The first slice implements the frozen entities and enum values required for:

- `maintenance_contract` plus contract-site and contract-scope links.
- `maintenance_visit`, including `previous_visit_id` and `visit_sequence`.
- `work_order` and `work_order_assignment`.
- inspection template/version/section/item plus `inspection` and `inspection_answer`.
- `finding_classification` and `finding`.

All tenant-owned rows carry the baseline common columns (`id`, `tenant_id`, create/update timestamps and actors). Monetary values use `numeric(19,4)` and UTC timestamps use `timestamptz`.
## 5. API and authorization design

The API follows the adopted `/api/v1/maintenance/...` contract shape. Existing S1 contract endpoints for maintenance contracts are implemented without semantic drift; new endpoints needed by later entities must be derived from the frozen ERD and bound to the existing OpenAPI governance before acceptance.

Authorization rules for the slice:

- Authentication remains global JWT bearer authentication.
- Write operations require explicit role decorators; read operations still enforce tenant visibility.
- Initial maintenance write roles: `ORG_ADMIN`, `PROJECT_MANAGER`, and `ENGINEER` only where operationally appropriate; approval/state-transition actions remain narrower.
- A role that is not permitted must receive `403 INSUFFICIENT_ROLE`.
- Cross-tenant object lookup must be indistinguishable from absence (`404`) unless the adopted API contract explicitly requires `403`.
- No endpoint accepts tenant ownership from the request body; tenant identity comes from authenticated context.
- Sensitive create/transition operations use the S0 idempotency store where the OpenAPI contract requires `Idempotency-Key`.

Database access for the new slice must set tenant/actor context inside the transaction before tenant-owned reads or writes so RLS is an active enforcement layer, not only an application filter.

## 6. State transitions and audit

The implementation uses only frozen enum values. It must reject impossible jumps rather than silently normalize state.

At minimum, the first executable path supports:

`Contract DRAFT → ACTIVE`
`Visit PLANNED → SCHEDULED → CONFIRMED → ARRIVED → IN_PROGRESS → COMPLETED`
`WorkOrder DRAFT → PENDING_ASSIGNMENT → ASSIGNED → ACCEPTED → ARRIVED → IN_PROGRESS → INSPECTION_COMPLETED → ACTION_REQUIRED/COMPLETED`
`Inspection DRAFT → IN_PROGRESS → COMPLETED`
`Finding OPEN → ACKNOWLEDGED` (later proposal/execution states remain outside this slice)

Every accepted state-changing command appends an `audit_event` and the corresponding `domain_event` where required by the governed event model. Audit rows remain append-only.
## 7. Web design

The Git Preview web app adds real Next.js routes instead of SPA fallback placeholders:

- `/work-orders` — tenant-scoped list with status, priority, contract/site context, assigned technician summary, and navigation to the work order.
- `/work-orders/[id]` — work-order lifecycle, visit context, inspection summary, findings, and audit/activity feed.
- `/findings` — tenant-scoped list with severity, status, category, work-order/site context, and filters.
- `/findings/[id]` — finding detail with inspection context and future evidence/proposal extension points.

The first slice does not clone the legacy Function/Bun UI. It reproduces the required business capability against the governed Git API and leaves unsupported legacy screens unchanged until their respective slices are implemented.

## 8. Testing and evidence

Implementation follows TDD. Required evidence before this slice can be called implemented:

1. Migration tests prove tenant composite FKs, RLS, frozen enums, append-only audit, and no destructive changes to existing MVP tables.
2. API tests prove `401` without bearer token, `403` for insufficient role, same-tenant success, and cross-tenant invisibility.
3. Vertical E2E proves `Contract → Visit → WorkOrder → Inspection → Finding` with persisted audit events.
4. Regression suite remains green: repository validation, domain tests, S0 tests, current MVP vertical E2E, and build.
5. Web route tests verify `/work-orders` and `/findings` render against the Preview API and do not point to the legacy service.
6. Railway Preview deployment must report the tested Git SHA through `/api/v1/health/release` and use `mostaofi_preview` only.
7. Production `Mostaofi V1` must remain healthy and unmodified throughout the work.

Sprint acceptance remains fail-closed under `IMPLEMENTATION-UNLOCK-PROTOCOL.md`; implementation success is not equivalent to release or production cutover.
## 9. Preview rollout and rollback

All schema/API/web changes deploy first to the existing Git Preview services and `mostaofi_preview` database. The live Function/Bun `Mostaofi V1` service, its domain, and production data remain untouched.

Promotion sequence after implementation:

`tests → Git main → GitHub CI → API Preview migration → API/Web Preview health → runtime RBAC/tenant checks → functional comparison → explicit cutover decision`

Any failed gate stops promotion. Rollback is the previous successful Git Preview deployment; production rollback remains the unchanged legacy service until a later cutover is explicitly authorized.

## 10. Out of scope for this slice

The following remain separate later slices and are not partially simulated here:

- Evidence/Waa’iyah and training.
- Corrective proposals and client approvals.
- Service execution and execution materials.
- Completion reports, billable events, invoices, collection/reconciliation.
- Full user administration, reports, SLA dashboard, and other legacy UI parity not required by the first maintenance chain.
- Production traffic cutover or deletion of the legacy service.

## 11. Acceptance criteria

This design is satisfied only when a fresh, commit-bound run proves all of the following on the implemented commit:

- A tenant can create a maintenance contract, schedule/advance a visit, create/assign a work order, complete an inspection, and create a finding.
- An unauthorized role cannot perform protected commands.
- A second tenant cannot read or mutate the first tenant's maintenance records.
- Required audit/domain events are present and immutable.
- `/work-orders` and `/findings` are functional Git Preview pages, not placeholders.
- Existing MVP procurement/inventory E2E remains green.
- Preview uses the isolated database and governed Git SHA.
- The live production service remains healthy and unchanged.

Only after these criteria pass may the next v1.1 slice or a cutover-readiness review begin.