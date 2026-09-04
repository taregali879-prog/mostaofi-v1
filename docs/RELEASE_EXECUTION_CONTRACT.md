# v1.0.0-mvp Release Execution Contract

## Governing equation

`Effective Release Decision = Automated GO AND Human GO`

Any FAIL, BLOCKED, UNKNOWN, missing evidence, skipped mandatory gate, invalid artifact hash, or unverified attestation signature produces `NO-GO`. Human approval cannot override an automated `NO-GO`.

## Mandatory gates

1. `npm_ci`
2. `build`
3. `migration`
4. `e2e`
5. `sql_reconciliation`
6. `performance`
7. `security` (SCA via `npm audit` and SAST via Semgrep)
8. `artifacts_signing`
9. `rollback_verification`

Each gate writes an ISO8601 UTC start/end time, exit code, log path and SHA-256 of the evidence log into `evidence/runtime/gates/<gate>.json`.

## Attestation

`release-artifacts/release-attestation.json` is generated only from machine-recorded gate evidence. It contains the full Git commit SHA, GitHub Run ID, release Run ID, artifact-manifest SHA-256, human approval and effective decision. The attestation and artifact manifest are signed keylessly with Sigstore/Cosign using GitHub OIDC and verified before tag creation.

## Tag rule

`v1.0.0-mvp` may be created only by `.github/workflows/release-mvp.yml`, after `scripts/release-decision.mjs` exits 0 and the signed attestation states `RELEASE GO`. No manual bypass is part of the contract.

## Pilot

The controlled pilot starts only after the release tag exists from the successful workflow and `evidence/PILOT_CHECKLIST.md` is satisfied. A SEV-1, tenant-isolation failure, data corruption, audit loss, or material-ledger reconciliation error is an immediate pilot stop/rollback condition.
