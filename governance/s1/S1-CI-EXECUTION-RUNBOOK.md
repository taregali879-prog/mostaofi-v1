# MOSTAOFI v1.1 — S1 CI Execution Runbook

Status: FROZEN SPECIFICATION CANDIDATE  
Registry: Revision 001 (canonical IDs through S1-CT-071)  
Decision model: FAIL CLOSED

## 1. Preflight

1. Checkout a clean target commit.
2. Record full commit SHA, branch, workflow SHA, runner identity and environment ID.
3. Verify the exact OpenAPI artifact digest and governance manifest digest.
4. Do not start runtime Contract Tests unless G01 schema validation passes.
5. Any coverage gap is non-PASS.

## 2. Canonical Inputs

- `mostaofi-v1.1-s1-openapi-FROZEN.yaml`
- `mostaofi-v1.1-s1-governance-manifest-registry-r001.yaml`

The effective tenant is server-derived from the authenticated principal. `X-Tenant-Id` is context only.

## 3. Gate Execution

Execute in dependency order:

`G01 → G02 → G03 → G04 → G05 → G06 → G07 → G08 → G09 → G10`

For every Contract Test produce:

- `result.json`
- `request.json`
- `response.json`
- `execution.log`
- `sha256.txt`

The result must bind the test to `runId + commitSha + environmentId + gateIds`.

## 4. Evidence Integrity

For every artifact:

1. calculate SHA-256;
2. write digest to the test integrity file;
3. include digest in `result.json`;
4. build a run-level `integrity/artifact-manifest.json`;
5. calculate SHA-256 for the run-level manifest.

Missing evidence or digest mismatch is a gate failure.

## 5. Gate Decision

A gate is PASS only when:

`coverageStatus == COVERED && all(required mapped tests == PASS) && all evidence digests verify`

No partial pass and no compensating gate.

## 6. Registry Governance

Revision 001 does not silently introduce new CT IDs. Tests above `S1-CT-071` require a formal Test Registry Revision.

**Known coverage gap:** G08 Pagination Determinism currently has no canonical CT in Registry Revision 001. Therefore G08 remains `GAP/BLOCKED` until a formal revision adds dedicated pagination tests. Removed from the previous draft: S1-CT-072, S1-CT-073, S1-CT-074.

## 7. Final Decision

`S1_PASS = G01 ∧ G02 ∧ G03 ∧ G04 ∧ G05 ∧ G06 ∧ G07 ∧ G08 ∧ G09 ∧ G10`

`S2_UNLOCKED = S1_PASS`

Any `FAIL / BLOCKED / UNKNOWN / MISSING / SKIPPED`, coverage gap, missing evidence, or SHA-256 mismatch keeps S2 locked.

## 8. Human Review

Human review is recorded after machine evidence is produced. Reviewer identity, timestamp and decision are appended to the evidence record. Human review cannot convert a failed automated gate into PASS.
