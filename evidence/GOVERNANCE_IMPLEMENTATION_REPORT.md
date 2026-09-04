# Release Governance Implementation Report — v0.5.0-rc3

## Scope implemented

- Nine mandatory fail-closed gates: npm ci, build/local validation, migration, E2E, SQL reconciliation, performance, security SCA/SAST, artifact signing, rollback verification.
- Per-gate ISO8601 UTC timestamps, exit code, evidence-log path, and SHA-256.
- Artifact manifest with per-file SHA-256.
- Sigstore/Cosign keyless signing and verification through GitHub OIDC.
- Signed `release-attestation.json` containing full commit SHA, run identity, gate evidence, human approval, automated decision and effective decision.
- `release-decision.mjs` exits non-zero unless every mandatory gate is PASS, human approval is GO, commit/manifest hashes are valid, all gate logs have SHA-256, attestation signature verification is confirmed, and no override is recorded.
- `v1.0.0-mvp` tag step is physically downstream of the decision gate.
- Rollback verification performs a PostgreSQL custom-format dump, restores it into a temporary database, verifies restored public schema presence, and removes the temporary database.

## Local verification performed

- Release governance unit tests: PASS (4/4).
- Complete dependency-free domain suite: PASS (17/17).
- Repository validation: PASS.
- S4-S8 HTTP contract smoke: PASS.
- Bash syntax for release/rollback/preflight scripts: PASS.
- Node syntax for governance scripts: PASS.
- GitHub workflow YAML parsing: PASS.
- Explicit fail-closed probe: `release-decision.mjs` returned exit code 42 when an otherwise-GO attestation was marked as having an unverified digital signature.

## Not claimed

This local environment does not prove the external Runner/Docker/PostgreSQL/MinIO/npm-registry gates. `v1.0.0-mvp` must not be created until the GitHub release workflow produces Green evidence for all nine gates and verifies the signed attestation.
