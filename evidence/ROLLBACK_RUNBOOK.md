# MVP Rollback Runbook

## Trigger
Use this runbook for a SEV-1 event, data-integrity mismatch, authorization leak, failed release health gate, or release-owner decision.

## Immediate containment
1. Stop new writes by taking the pilot API out of service or enabling infrastructure-level maintenance/read-only routing.
2. Record incident time, current release tag, commit SHA, deployment/image identifier and database migration state.
3. Preserve API, CI, PostgreSQL and MinIO logs; do not delete the failed deployment evidence.

## Application rollback
4. Redeploy the previous known-good application artifact/image by immutable SHA/tag.
5. Do **not** automatically run down-migrations for destructive or stateful schema changes.

## Data rollback
6. If the new release wrote incompatible/corrupt data, restore PostgreSQL to the pre-pilot snapshot/PITR checkpoint after approval from the incident owner.
7. Reconcile object-storage references and restore/version objects only when required; never silently discard uploaded evidence.

## Verification before reopening writes
8. Verify `/health/live` and `/health/ready`.
9. Verify login and tenant isolation.
10. Verify project read, BOQ, PO, delivery and warehouse inventory balance.
11. Verify Audit read and run the reconciliation SQL appropriate to the restored release.
12. Re-enable writes only after the incident owner signs off.

## Post-rollback
13. Keep the failed release disabled.
14. Create a root-cause record with timeline, data impact and corrective tests.
15. A corrected release must pass the full Test Ready/Release MVP workflow before another pilot attempt.
