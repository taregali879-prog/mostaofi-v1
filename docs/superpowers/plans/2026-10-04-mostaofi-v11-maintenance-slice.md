# Mostaofi v1.1 Maintenance Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first governed v1.1 maintenance vertical slice on Git Preview: `MaintenanceContract → MaintenanceVisit → WorkOrder → Inspection → Finding`, with tenant isolation, RBAC, audit/domain events, and real `/work-orders` and `/findings` pages.

**Architecture:** Extend the existing NestJS modular monolith and Prisma/PostgreSQL schema without replacing current MVP project/procurement flows. Reuse `Organization` as the tenant boundary, reuse `ContractorProfile` as the existing contractor identity, add missing Core-compatible `client` and `site` persistence, include the required SLA policy reference data, and enforce RLS through transaction-scoped tenant/actor context. Implement API behavior against the frozen v1.1 ERD and OpenAPI baseline, then expose the slice through the existing Next.js app.

**Tech Stack:** NestJS 11, TypeScript, Prisma 6.19.3, PostgreSQL 18, Jest/Supertest, Next.js 16.3.6, React 19, Railway Git Preview.

**Spec:** `docs/superpowers/specs/2026-10-04-mostaofi-v11-maintenance-slice-design.md`

**Plan source commit:** `d889ad86120f5f82cba0b788ae05ec0a95799af9`

## Global Constraints

- `MOSTAOFI-V1.1-ERD-BASELINE-001` and `spec/v1.1/Mostaofi-v1.1-OpenAPI-Baseline.yaml` are immutable inputs, not files to rewrite.
- All runtime work deploys to Git Preview and `mostaofi_preview` first; `Mostaofi V1` production, its domain, and production database remain untouched.
- Existing MVP project, BOQ, procurement, delivery, inventory, KPI, auth, and document flows must remain green.
- No shadow copy of an existing Core identity: `Organization` remains tenant, `User` remains user, `ContractorProfile` backs contractor identity; add only missing `client` and `site` persistence.
- Every new tenant-owned operational table carries tenant ownership, common audit columns, composite tenant FKs where applicable, and fail-closed RLS.
- Tenant identity comes from authenticated context; request bodies never select ownership.
- Cross-tenant object lookup returns not-found behavior; insufficient role returns `403 INSUFFICIENT_ROLE`.
- Governed write operations honor `Idempotency-Key` and `If-Match` where the frozen OpenAPI requires them.
- State transitions append `audit_event` and required `domain_event` records in the same transaction as the state change.
- No hard delete of audited operational rows; no production cutover is authorized by this plan.
## Review Focus

1. **Missing tenant/actor DB context:** any maintenance query outside the scoped transaction must fail closed under RLS rather than silently reading zero rows or bypassing isolation.
2. **Idempotency reuse:** replaying the same key with the same request must return the stored result without duplicate side effects; reusing it with a different request hash must return `409 IDEMPOTENCY_KEY_REUSED`.
3. **Stale concurrency token:** protected transitions with missing `If-Match` must return `428`; stale ETags must return `409 CONCURRENT_MODIFICATION` without changing state.
4. **Cross-tenant references:** parent IDs from another tenant (contract/site/visit/work order/inspection) must be invisible at the API and rejected by tenant-safe foreign keys/RLS.
5. **Lifecycle/time validation:** impossible state jumps or invalid time ordering (`scheduled_end <= scheduled_start`, completion before start) must fail without audit/domain side effects.

## File Structure

- `database/migrations/20261004050000_v11_maintenance_slice/migration.sql` — Core compatibility plus all first-slice tables, enums, tenant FKs, indexes, RLS, and invariants.
- `database/schema.prisma` — Prisma models/enums for the same database objects.
- `apps/api/src/database/tenant-transaction.service.ts` — transaction-scoped tenant and actor context for RLS.
- `apps/api/src/maintenance/maintenance.module.ts` — maintenance module composition.
- `apps/api/src/maintenance/maintenance.roles.ts` — explicit v1.0→v1.1 role compatibility arrays used by controllers.
- `apps/api/src/maintenance/maintenance-command.service.ts` — idempotency, ETag/If-Match checks, and transactional command wrapper.
- `apps/api/src/maintenance/contracts/*` — contract/site/scope API and lifecycle.
- `apps/api/src/maintenance/operations/*` — visits, work orders, assignments, and lifecycle.
- `apps/api/src/maintenance/inspections/*` — templates, inspections, answers, classifications, and findings.
- `apps/api/src/audit/domain-event.service.ts` — append-only domain event writer usable inside a Prisma transaction.
- `apps/api/test/maintenance-slice.e2e-spec.ts` — commit-bound vertical, RBAC, tenant, idempotency, and concurrency E2E.
- `tests/v1.1/maintenance-slice-schema.test.mjs` — migration/baseline invariants.
- `apps/web/app/work-orders/*`, `apps/web/app/findings/*` — Preview UI routes.
- `apps/web/lib/api.ts` — authenticated browser API helper reused by new pages.

---
### Task 1: Database foundation and Core compatibility

**Files:**
- Create: `database/migrations/20261004050000_v11_maintenance_slice/migration.sql`
- Modify: `database/schema.prisma`
- Test: `tests/v1.1/maintenance-slice-schema.test.mjs`

**Interfaces:**
- Reuse `organizations.id` as `tenant_id` and `contractor_profiles.id` as the contractor identity referenced by maintenance tables; add a non-destructive composite unique key on `(organization_id, id)` so tenant-safe maintenance FKs can target it.
- Create minimal Core-compatible `client` identity with `id`, `tenant_id`, `display_name`, and common create/update actor columns.
- Create minimal Core-compatible `site` identity with `id`, `tenant_id`, `client_id`, `display_name`, optional `city`, and common create/update actor columns; enforce same-tenant client→site ownership. Do not add CRM/address fields not needed by this slice.
- Produce Prisma models for `Client`, `Site`, `Technician`, `SLAPolicy`, `MaintenanceContract`, `MaintenanceContractSite`, `MaintenanceContractScope`, `MaintenanceVisit`, `WorkOrder`, `WorkOrderAssignment`, `InspectionTemplate`, `InspectionTemplateVersion`, `InspectionSection`, `InspectionItem`, `Inspection`, `InspectionAnswer`, `FindingClassification`, and `Finding`; also map the already-created S0 `idempotency_record` and `domain_event` tables into Prisma as `IdempotencyRecord` and `DomainEvent` without recreating them.
- Use exactly the frozen enum values from `spec/v1.1/Mostaofi-v1.1-Final-ERD-Baseline.md` for entities included in this slice.

- [ ] **Step 1: Write the failing schema-invariant tests**

Add tests named `creates the governed maintenance chain`, `enforces composite tenant ownership`, `forces RLS on every maintenance tenant table`, `preserves previous_visit_id visit sequencing`, and `uses frozen enum values without additions`.

- [ ] **Step 2: Run the schema tests and verify RED**

Run: `node --test tests/v1.1/maintenance-slice-schema.test.mjs`
Expected: FAIL because the migration/tables do not exist.

- [ ] **Step 3: Add the migration and matching Prisma schema models**

Create only the entities required by the approved slice, including the frozen `technician` identity needed by assignments/inspections/findings and `sla_policy` because `maintenance_contract.sla_policy_id` is mandatory. Add `UNIQUE (tenant_id, id)`, composite tenant-safe FKs, indexes for tenant/status/time queries, fail-closed RLS policies using `current_tenant_id()`, validation checks for dates/counts/money, and no destructive changes to existing MVP tables. Do not recreate S0 `idempotency_record`/`domain_event`; add Prisma mappings to their existing tables.

- [ ] **Step 4: Generate Prisma and rerun schema tests**

Run: `npm run db:generate && node --test tests/v1.1/maintenance-slice-schema.test.mjs`
Expected: Prisma generation succeeds and all maintenance schema tests PASS.

- [ ] **Step 5: Commit the database foundation**

Run: `git add database/schema.prisma database/migrations/20261004050000_v11_maintenance_slice tests/v1.1/maintenance-slice-schema.test.mjs && git commit -m "feat: add v1.1 maintenance data foundation"`
### Task 2: Tenant transaction, audit/domain events, idempotency, and concurrency

**Files:**
- Create: `apps/api/src/database/tenant-transaction.service.ts`
- Create: `apps/api/src/audit/domain-event.service.ts`
- Create: `apps/api/src/maintenance/maintenance-command.service.ts`
- Create: `apps/api/src/maintenance/maintenance.roles.ts`
- Modify: `apps/api/src/database/database.module.ts`
- Modify: `apps/api/src/audit/audit.service.ts`
- Modify: `apps/api/src/audit/audit.module.ts`
- Test: `apps/api/test/maintenance-command.e2e-spec.ts`

**Interfaces:**
- `type TenantActorContext = { org: string; sub: string }`.
- `type CommandMeta = { idempotencyKey: string; ifMatch?: string; requestId: string }`.
- `type AuditInput = { event: string; actorId: string | null; organizationId: string; entityType: string; entityId: string; requestId: string; metadata?: Prisma.InputJsonObject }`.
- `type DomainEventInput = { tenantId: string; eventType: string; aggregateType: string; aggregateId: string; payload: Prisma.InputJsonObject; correlationId?: string; causationId?: string }`.
- `TenantTransactionService.run<T>(ctx: TenantActorContext, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>`; set `app.tenant_id` and `app.actor_user_id` transaction-locally before `work` executes.
- `AuditService.appendWith(tx: Prisma.TransactionClient, input: AuditInput): Promise<AuditEvent>`; existing `append()` stays compatible for MVP code.
- `DomainEventService.appendWith(tx: Prisma.TransactionClient, input: DomainEventInput): Promise<void>` writes immutable business content with a generated correlation ID when one is not supplied.
- `MaintenanceCommandService.execute<T>(ctx: TenantActorContext, options: { operationScope: string; meta: CommandMeta; requestBody: unknown; currentUpdatedAt?: Date }, work: (tx: Prisma.TransactionClient) => Promise<{ body: T; updatedAt: Date }>): Promise<{ body: T; etag: string; replayed: boolean }>` enforces the S0 idempotency store and optimistic concurrency.
- Role arrays include explicit compatibility aliases: `ORG_ADMIN` with `TENANT_ADMIN`, `PROJECT_MANAGER` with `OPERATIONS_MANAGER`, and `ENGINEER` only on technician/inspection operations approved by the design.

- [ ] **Step 1: Write failing command-infrastructure E2E tests**

Assert: missing tenant context cannot see tenant-owned maintenance rows; same idempotency key+payload replays once; changed payload returns `409 IDEMPOTENCY_KEY_REUSED`; missing `If-Match` returns `428`; stale ETag returns `409 CONCURRENT_MODIFICATION`; audit/domain writes roll back if the command fails.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm --workspace apps/api run test:e2e -- --runInBand maintenance-command.e2e-spec.ts`
Expected: FAIL because the services do not exist.

- [ ] **Step 3: Implement the transaction and command infrastructure**

Use transaction-local PostgreSQL `set_config` for tenant/actor context. Hash canonical JSON requests with SHA-256 for idempotency. Derive ETags deterministically from the aggregate `updated_at` value; do not introduce a second concurrency column outside the frozen ERD.

- [ ] **Step 4: Run command tests and existing auth tests**

Run: `npm --workspace apps/api run test:e2e -- --runInBand maintenance-command.e2e-spec.ts bootstrap-config.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit infrastructure**

Run: `git add apps/api/src/database apps/api/src/audit apps/api/src/maintenance apps/api/test/maintenance-command.e2e-spec.ts && git commit -m "feat: enforce maintenance tenant command guards"`
### Task 3: SLA policies, maintenance contracts, sites, scopes, and activation

**Files:**
- Create: `apps/api/src/maintenance/maintenance.module.ts`
- Create: `apps/api/src/maintenance/contracts/maintenance-contracts.controller.ts`
- Create: `apps/api/src/maintenance/contracts/sla-policies.controller.ts`
- Create: `apps/api/src/maintenance/contracts/maintenance-contracts.service.ts`
- Create: `apps/api/src/maintenance/contracts/maintenance-contracts.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/maintenance-contracts.e2e-spec.ts`

**Interfaces:**
- Controller prefix: `maintenance/contracts` under the global `/api/v1` prefix.
- Implement frozen SLA operations required to make contracts usable: `listSLAPolicies`, `createSLAPolicy`, and `getSLAPolicy`.
- Implement frozen contract operations used by the slice: `createMaintenanceContract`, list/get contract, add/list contract sites, add contract scopes, submit contract, and `activateMaintenanceContract`.
- `MaintenanceContractsService.create(ctx, input, commandMeta)`, `get(ctx, contractId)`, `list(ctx, filters)`, `addSite(ctx, contractId, input, commandMeta)`, `addScope(...)`, `submit(...)`, and `activate(...)` all execute through `TenantTransactionService`/`MaintenanceCommandService`.
- Contract create starts `DRAFT`; governed path is `DRAFT → PENDING_APPROVAL → ACTIVE` using submit then activate. `activated_at` is written only on successful activation.
- Emit `maintenance.contract.created`, `maintenance.contract.submitted`, and `maintenance.contract.activated` audit/domain events as required by the baseline.

- [ ] **Step 1: Write failing contract API tests**

Cover: SLA create/list/get and tenant isolation; authenticated contract create/list/get; duplicate contract number conflict; same-tenant SLA/client/site acceptance; cross-tenant SLA/client/site rejection; insufficient role `403`; idempotent replay; missing/stale `If-Match`; invalid activation before submit; and successful submit→activate with audit/domain events.

- [ ] **Step 2: Run focused contract E2E and verify RED**

Run: `npm --workspace apps/api run test:e2e -- --runInBand maintenance-contracts.e2e-spec.ts`
Expected: FAIL with missing maintenance contract routes/module.

- [ ] **Step 3: Implement minimal DTO/controller/service behavior against the frozen OpenAPI**

Use exact request/response field names from `spec/v1.1/Mostaofi-v1.1-OpenAPI-Baseline.yaml`; do not invent alternative endpoint names. Keep validation local to the maintenance DTO/service layer and preserve existing MVP controllers unchanged.

- [ ] **Step 4: Run contract tests plus baseline smoke**

Run: `npm --workspace apps/api run test:e2e -- --runInBand maintenance-contracts.e2e-spec.ts && npm run smoke`
Expected: PASS and existing MVP smoke remains unchanged.

- [ ] **Step 5: Commit contract slice**

Run: `git add apps/api/src/maintenance apps/api/src/app.module.ts apps/api/test/maintenance-contracts.e2e-spec.ts && git commit -m "feat: add governed maintenance contracts"`
### Task 4: Maintenance visits, technicians, work orders, and assignments

**Files:**
- Create: `apps/api/src/maintenance/operations/maintenance-operations.controller.ts`
- Create: `apps/api/src/maintenance/operations/maintenance-operations.service.ts`
- Create: `apps/api/src/maintenance/operations/maintenance-operations.dto.ts`
- Modify: `apps/api/src/maintenance/maintenance.module.ts`
- Test: `apps/api/test/maintenance-operations.e2e-spec.ts`

**Interfaces:**
- Implement frozen visit operations under `/api/v1/maintenance/...`, including contract visit creation/list/get and lifecycle commands needed for `PLANNED → SCHEDULED → CONFIRMED → ARRIVED → IN_PROGRESS → COMPLETED`.
- Implement `listWorkOrders`, visit work-order list/create, get work order, assignment, and lifecycle commands needed through `IN_PROGRESS`; inspection-driven terminal transitions are completed in Task 5.
- Expose the frozen `listTechnicians`, `createTechnician`, and `getTechnician` operations so work-order assignment does not depend on hidden database fixtures.
- `MaintenanceOperationsService.createVisit(ctx, contractId, input, commandMeta)` validates active contract/site ownership and scheduling order.
- `MaintenanceOperationsService.createWorkOrder(ctx, visitId, input, commandMeta)` inherits contract/site/contractor context from the visit instead of trusting duplicate tenant ownership in the request.
- `assignWorkOrder(ctx, workOrderId, technicianId, role, commandMeta)` requires a same-tenant active technician and creates one assignment record per governed role/status transition.
- Emit the exact `maintenance.visit.*`, `maintenance.work_order.*`, and assignment audit/domain event names specified by the frozen OpenAPI baseline.

- [ ] **Step 1: Write failing visit/work-order E2E tests**

Cover: technician create/list/get and contractor ownership; invalid schedule ordering; visit on inactive/cross-tenant contract/site; correct lifecycle order; duplicate visit sequence prevention; work order inheriting visit ownership; same-tenant technician assignment; cross-tenant technician rejection; unauthorized roles; idempotent replays; and stale `If-Match`.

- [ ] **Step 2: Run focused operations tests and verify RED**

Run: `npm --workspace apps/api run test:e2e -- --runInBand maintenance-operations.e2e-spec.ts`
Expected: FAIL with missing visit/work-order routes.

- [ ] **Step 3: Implement visit/work-order services and controllers**

Follow operation IDs and paths from `spec/v1.1/Mostaofi-v1.1-OpenAPI-Baseline.yaml`. Enforce allowed transitions explicitly; never infer or skip intermediate lifecycle states. Use transaction-scoped tenant/actor context for all persistence.

- [ ] **Step 4: Run operations plus contract E2E**

Run: `npm --workspace apps/api run test:e2e -- --runInBand maintenance-contracts.e2e-spec.ts maintenance-operations.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit operations slice**

Run: `git add apps/api/src/maintenance apps/api/test/maintenance-operations.e2e-spec.ts && git commit -m "feat: add maintenance visits and work orders"`
### Task 5: Inspection templates, inspections, answers, and findings

**Files:**
- Create: `apps/api/src/maintenance/inspections/maintenance-inspections.controller.ts`
- Create: `apps/api/src/maintenance/inspections/maintenance-inspections.service.ts`
- Create: `apps/api/src/maintenance/inspections/maintenance-inspections.dto.ts`
- Modify: `apps/api/src/maintenance/maintenance.module.ts`
- Test: `apps/api/test/maintenance-inspections.e2e-spec.ts`

**Interfaces:**
- Provide the governed API subset required to create a template/version, add ordered sections/items, publish the version, create/start/answer/complete an inspection, and create/list/get/update a finding.
- `createInspection(ctx, workOrderId, templateVersionId, commandMeta)` accepts only a same-tenant `PUBLISHED` template version and a work order that is in an inspection-eligible state.
- `recordAnswer(ctx, inspectionId, itemId, input, commandMeta)` enforces one answer value matching the frozen `inspection_answer_type` and records `inspection_answer_result`.
- `completeInspection(...)` rejects missing required answers and moves the work order to `INSPECTION_COMPLETED` in the same transaction.
- `createFinding(ctx, inspectionId, input, commandMeta)` follows frozen `FindingCreateRequest`, creates `OPEN`, and moves the associated work order to `ACTION_REQUIRED`; finding severity never implies or performs shutdown/closure authority.
- Read operations are tenant-scoped; write roles follow the frozen baseline plus the explicit compatibility aliases in `maintenance.roles.ts`.

- [ ] **Step 1: Write failing inspection/finding E2E tests**

Cover: unpublished template rejection, wrong answer type, missing required answer, successful inspection completion, finding with optional classification, `VIEWER`/client write denial, cross-tenant work-order/inspection invisibility, finding creation event, and work-order transition to `ACTION_REQUIRED`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --workspace apps/api run test:e2e -- --runInBand maintenance-inspections.e2e-spec.ts`
Expected: FAIL because inspection/finding routes are absent.

- [ ] **Step 3: Implement the minimal governed inspection/finding API**

Use the exact enum values and request/response names from the frozen ERD/OpenAPI. Published template versions and completed inspections are immutable except for fields the baseline explicitly permits; no hard delete endpoints are introduced.

- [ ] **Step 4: Run the maintenance API suite**

Run: `npm --workspace apps/api run test:e2e -- --runInBand maintenance-contracts.e2e-spec.ts maintenance-operations.e2e-spec.ts maintenance-inspections.e2e-spec.ts maintenance-command.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit inspection/findings slice**

Run: `git add apps/api/src/maintenance apps/api/test/maintenance-inspections.e2e-spec.ts && git commit -m "feat: add maintenance inspections and findings"`
### Task 6: Commit-bound maintenance vertical acceptance test

**Files:**
- Create: `apps/api/test/helpers/maintenance-fixtures.ts`
- Create: `apps/api/test/maintenance-slice.e2e-spec.ts`
- Modify: `apps/api/test/jest-e2e.json` only if test discovery requires it; otherwise leave unchanged.

**Interfaces:**
- Fixture helper creates two isolated organizations, admin/operator/technician/viewer users, one client, one site, and one contractor-backed profile using deterministic UUIDs reserved for tests; SLA policy and technician records are created through the public maintenance API in the vertical journey.
- Vertical E2E drives only public HTTP endpoints after fixture setup; it does not call service methods directly for the business chain.
- The acceptance chain is: login → SLA policy create → technician create → contract create → site/scope → submit/activate → visit create/schedule/confirm/arrive/start → work order create/assign/accept/arrive/start → template/version/item publish → inspection create/start/answer/complete → finding create/get/list.
- The final assertions verify tenant isolation, role denial, aggregate statuses, audit events, domain events, and unchanged MVP APIs.

- [ ] **Step 1: Write the full vertical E2E test**

Include explicit assertions for `401`, viewer `403`, second-tenant `404`, same-tenant success, idempotent replay without duplicate rows/events, stale `If-Match`, and the expected final work-order/finding states.

- [ ] **Step 2: Run the vertical test alone**

Run: `npm --workspace apps/api run test:e2e -- --runInBand maintenance-slice.e2e-spec.ts`
Expected: PASS only after Tasks 1–5 are complete.

- [ ] **Step 3: Run all API E2E tests**

Run: `npm --workspace apps/api run test:e2e -- --runInBand`
Expected: all suites PASS, including existing `vertical-slice.e2e-spec.ts` for MVP procurement/inventory.

- [ ] **Step 4: Run repository/domain/S0 regression**

Run: `npm run test:local`
Expected: repository validation, all domain tests, all S0 tests, and contract smoke PASS.

- [ ] **Step 5: Commit acceptance coverage**

Run: `git add apps/api/test && git commit -m "test: prove v1.1 maintenance vertical slice"`
### Task 7: Work Orders and Findings Git Preview UI

**Files:**
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/app/work-orders/page.tsx`
- Create: `apps/web/app/work-orders/[id]/page.tsx`
- Create: `apps/web/app/findings/page.tsx`
- Create: `apps/web/app/findings/[id]/page.tsx`
- Modify: `apps/web/app/layout.tsx`
- Test: `tests/maintenance-web-routes.test.mjs`

**Interfaces:**
- `class ApiError extends Error { status: number }` represents non-2xx API responses.
- `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` uses `NEXT_PUBLIC_API_URL`, attaches `muqawil_access_token` from browser storage, throws `ApiError` with status/message, and never falls back to the legacy production host.
- `/work-orders` calls `GET /api/v1/maintenance/work-orders` and renders number/status/priority/contract/site/assignment summary with links to `/work-orders/[id]`.
- `/work-orders/[id]` renders lifecycle, visit context, inspection summary, findings, and activity/audit data available from the maintenance API.
- `/findings` calls `GET /api/v1/maintenance/findings` and supports status/severity/type query filters.
- `/findings/[id]` renders finding details and inspection/work-order context without implementing Evidence/Proposal features that are outside this slice.

- [ ] **Step 1: Write failing web-route contract tests**

Assert the four route files exist, use the shared API helper, contain links between work orders/findings, add navigation entries, and contain no `mostaofi-v1-production.up.railway.app` or other legacy hard-coded API host.

- [ ] **Step 2: Run the web contract test and verify RED**

Run: `node --test tests/maintenance-web-routes.test.mjs`
Expected: FAIL because the routes/helper do not exist.

- [ ] **Step 3: Implement the API helper and four client-facing routes**

Follow the existing RTL layout and minimal card/badge styling; do not redesign unrelated project/contractor pages. Use loading/error/empty states so an empty tenant does not appear broken.

- [ ] **Step 4: Verify routes and production build**

Run: `node --test tests/maintenance-web-routes.test.mjs && npm --workspace apps/web run build`
Expected: test PASS and Next build lists `/work-orders`, `/work-orders/[id]`, `/findings`, `/findings/[id]`.

- [ ] **Step 5: Commit Preview UI**

Run: `git add apps/web tests/maintenance-web-routes.test.mjs && git commit -m "feat: add maintenance work order and finding views"`
### Task 8: Extend the Railway Preview runtime gate to the maintenance slice

**Files:**
- Modify: `scripts/p0-preview-runtime-gate.mjs`
- Modify: `scripts/lib/preview-runtime-gate.mjs`
- Modify: `tests/preview-runtime-gate.test.mjs`
- Create: `tests/maintenance-preview-runtime-gate.test.mjs`

**Interfaces:**
- Preserve all existing fail-closed checks: database must be exactly `mostaofi_preview`, bucket name must contain `preview`, and the gate must never target the legacy production service.
- Add a bootstrap mode that starts the compiled Nest `AppModule` on localhost inside the gate process when no already-running local API is supplied; close it before process exit.
- Extend the HTTP helper so governed commands can send `Idempotency-Key`/`If-Match` and inspect response `ETag` values without logging tokens/secrets.
- Add maintenance fixture setup only for missing Core client/site/contractor-backed identities, then create SLA policy and technician through the maintenance API and drive the approved maintenance chain through HTTP.
- Preserve the existing real Bucket `PUT → GET → SHA-256 → DELETE` probe.
- Print explicit markers: `PREVIEW_GATE_PASS maintenance_rbac`, `maintenance_tenant_isolation`, `maintenance_vertical`, `bucket_roundtrip`, and finally `PREVIEW_GATE_PASS all`.

- [ ] **Step 1: Write failing runtime-gate unit/CLI tests**

Assert the gate refuses production DB/bucket/API, requires the maintenance PASS markers, carries governed command headers, and never deletes audit-linked users or audited maintenance operational rows.

- [ ] **Step 2: Run gate tests and verify RED**

Run: `node --test tests/preview-runtime-gate.test.mjs tests/maintenance-preview-runtime-gate.test.mjs tests/preview-runtime-gate-cli.test.mjs`
Expected: FAIL until maintenance/bootstrap support is implemented.

- [ ] **Step 3: Implement bootstrap + maintenance HTTP journey**

Keep direct Prisma usage limited to gate fixture identities/reference data; contract/visit/work-order/inspection/finding business transitions must use the API. Retain audited maintenance records as Preview evidence rather than hard deleting them; delete the temporary S3 object after SHA verification.

- [ ] **Step 4: Run runtime-gate tests and local Preview-shaped probe**

Run: `node --test tests/preview-runtime-gate*.test.mjs tests/maintenance-preview-runtime-gate.test.mjs`
Then with the isolated local test environment: `node scripts/p0-preview-runtime-gate.mjs`
Expected: all required `PREVIEW_GATE_PASS ...` markers and exit code 0.

- [ ] **Step 5: Commit runtime evidence gate**

Run: `git add scripts/p0-preview-runtime-gate.mjs scripts/lib/preview-runtime-gate.mjs tests/preview-runtime-gate*.test.mjs tests/maintenance-preview-runtime-gate.test.mjs && git commit -m "test: gate maintenance preview runtime"`
### Task 9: Full verification, Git/CI, and Railway Preview promotion

**Files:**
- Modify only if required by verified deployment configuration: `deploy/railway/p0-service-settings.json`
- No production service/domain/database files or settings are changed.

**Interfaces:**
- The candidate SHA is one exact clean `main` commit and must be identical locally, on GitHub `main`, in GitHub CI, API `/api/v1/health/release`, and both Railway Git Preview deployments.
- API Preview continues using `mostaofi_preview` and `mostaofi-preview` Bucket only.
- API Preview pre-deploy runs migration plus the fail-closed runtime gate in bootstrap mode; normal start remains the governed Git API command.
- Web Preview uses `NEXT_PUBLIC_API_URL` for the API Preview, never the legacy `Mostaofi V1` domain.
- Legacy `Mostaofi V1` receives read-only health checks only and remains the rollback path.

- [ ] **Step 1: Run fresh security/regression/build gates on the candidate commit**

Run: `npm audit --audit-level=high`
Run: `npm run db:generate`
Run: `npm run test:local`
Run: `set -a; source ./.env; set +a; npm run test:e2e`
Run: `NODE_ENV=production npm run build`
Expected: zero high/critical audit findings; all tests and builds PASS.

- [ ] **Step 2: Verify clean source and push exact `main`**

Run: `git status --short && git rev-parse HEAD && git push origin main && git ls-remote origin refs/heads/main`
Expected: clean tree and identical local/remote SHA.

- [ ] **Step 3: Require GitHub CI green on that exact SHA**

Do not proceed if any required job is failed, cancelled, skipped unexpectedly, or attached to a different SHA.

- [ ] **Step 4: Deploy API Preview and require runtime evidence**

Apply migration to `mostaofi_preview` only. Run the Preview runtime gate and require log markers for `maintenance_rbac`, `maintenance_tenant_isolation`, `maintenance_vertical`, `bucket_roundtrip`, and `all`; any missing marker is NO-GO.

- [ ] **Step 5: Deploy Web Preview from the same SHA and probe routes**

Require HTTP 200 for API `/api/v1/health/ready`, API `/api/v1/health/release`, Web `/login`, `/work-orders`, and `/findings`. Confirm release metadata reports `source=git`, `branch=main`, owner/repo exact, and candidate SHA exact.

- [ ] **Step 6: Confirm rollback service is untouched**

Read-only probe the existing `Mostaofi V1` health endpoint and Railway status. Expected: Online/200 with no service source, domain, variables, or database mutation performed by this task.

- [ ] **Step 7: Record decision**

If every gate passes, mark the maintenance slice **Preview PASS / Production cutover still NOT AUTHORIZED**. Any failed/unknown gate remains fail-closed and blocks the next slice/cutover review.

---