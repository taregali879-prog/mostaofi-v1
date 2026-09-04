# MVP Pilot Release Checklist

## Release identity
- [ ] Candidate commit SHA recorded.
- [ ] `package-lock.json` committed and `npm ci` reproducible.
- [ ] Full Release MVP workflow is green.
- [ ] Release evidence artifact downloaded and retained.
- [ ] `v1.0.0-mvp` tag points to the green commit only.

## Security and access
- [ ] Pilot uses unique PostgreSQL, MinIO and JWT secrets; no `change-me` or CI credentials.
- [ ] Secrets are stored in the deployment secret store, never committed to Git.
- [ ] Pilot contractor has only required organization/project roles.
- [ ] Cross-tenant negative authorization test is green.
- [ ] Admin access is limited and reviewed.

## Data and recovery
- [ ] Pre-pilot database snapshot/PITR checkpoint recorded.
- [ ] MinIO bucket versioning/backup policy confirmed where supported.
- [ ] Rollback runbook rehearsed against staging.
- [ ] Project, PO, delivery, inventory and audit reconciliation SQL passes.

## Operational monitoring
- [ ] `/api/v1/health/live` and `/api/v1/health/ready` are monitored.
- [ ] API/application logs are retained for the pilot window.
- [ ] Health monitor p95 threshold is configured.
- [ ] Alert owner and escalation phone/channel are defined.

## Pilot scope
- [ ] Exactly one real project enrolled.
- [ ] Exactly one initial approved BOQ procurement cycle selected.
- [ ] Named pilot users and support owner confirmed.
- [ ] Pilot start/end dates documented.
- [ ] Stop conditions reviewed with operations.

## Go / No-Go
Pilot is **GO** only if every mandatory checkbox above is complete and no Critical/High defect remains open.
