# Governance Revision — MOSTAOFI-V1.1-GATE-SEPARATION-R001

- Status: `ADOPTED_FOR_EXECUTION`
- Authorized at: `2026-09-04T09:21:24Z`
- Purpose: separate controlled implementation start from sprint acceptance/OpenAPI final freeze.
- ERD baseline change: `false`
- OpenAPI contract change: `false`
- Contract Test semantic change: `false`
- Test Registry revision: `002` unchanged

## Decision

1. `IMPLEMENTATION_START_UNLOCK` authorizes development activity only.
2. `SPRINT_ACCEPTANCE(Sn)` remains evidence-driven and fail-closed.
3. `OPENAPI_FINAL_FREEZE` remains dependent on all adopted CTs, G01..G10, ERD integration invariants, evidence integrity, and exact commit binding.
4. Release/pilot authorization remains outside this gate and is not implied.
