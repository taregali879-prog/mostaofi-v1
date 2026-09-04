# Mostaofi v1.1 — Implementation Start / Acceptance Gate Separation

Status: `GATE_SPLIT_ADOPTED`

Governance revision: `MOSTAOFI-V1.1-GATE-SEPARATION-R001`

Authorization basis: explicit instruction to separate the gates on `2026-09-04T09:21:24Z`.

## 1. Purpose

The previous rule created a circular dependency: runtime Contract Tests were required before implementation could start, while those tests require the runtime produced by implementation. This revision separates permission to **start controlled implementation** from permission to **accept a sprint / freeze the API**.

This revision does not modify `MOSTAOFI-V1.1-ERD-BASELINE-001`, the S1 OpenAPI contract, or the meaning of any adopted Contract Test.

## 2. Gate A — IMPLEMENTATION_START_UNLOCK

```text
IMPLEMENTATION_START_UNLOCK =
    ERD_BASELINE_FROZEN
    ∧ ERD_DIGEST_VERIFIED
    ∧ OPENAPI_CANDIDATE_BOUND
    ∧ OPENAPI_DIGEST_VERIFIED
    ∧ OPENAPI_STATIC_VALIDATION_PASS
    ∧ NO_BASELINE_DRIFT
    ∧ SOURCE_COMMIT_BOUND
    ∧ SOURCE_TREE_CLEAN
    ∧ TEST_REGISTRY_ADOPTED
    ∧ TEST_REGISTRY_COVERAGE_COMPLETE
    ∧ GOVERNANCE_AUDIT_PASS
    ∧ DEVELOPMENT_TOOLCHAIN_READY
```

When this gate is `TRUE`, controlled implementation work for S0→S10 may begin: code, migrations, tests, local/CI tooling, and evidence instrumentation may be created.

`G01..G10` are **not** prerequisites for this start gate. In particular, a runtime-dependent or specialized-validator `BLOCKED` state does not prevent implementation from starting; it remains an acceptance blocker.

`IMPLEMENTATION_START_UNLOCK` **does not authorize release or pilot**, does not imply `OPENAPI_FINAL_FREEZE`, and does not convert any Contract Test or Gate to PASS.

## 3. Gate B — SPRINT_ACCEPTANCE

For each sprint, acceptance is fail-closed and requires the executable evidence applicable to that sprint:

```text
SPRINT_ACCEPTANCE(Sn) =
    ALL_MAPPED_REQUIRED_CTS_PASS_EVIDENCED
    ∧ RELEVANT_ERD_INVARIANTS_PASS_EVIDENCED
    ∧ EVIDENCE_INTEGRITY_VERIFIED
    ∧ TESTED_COMMIT == AUTHORIZED_COMMIT
    ∧ GOVERNANCE_AUDIT_PASS
    ∧ NO_BASELINE_DRIFT
```

A sprint may be implemented while its acceptance evidence is still pending. It is not accepted, promoted, or used to unlock dependent acceptance until this gate is true.

## 4. Final OpenAPI freeze

```text
OPENAPI_FINAL_FREEZE =
    ALL_ADOPTED_CONTRACT_TESTS_PASS_EVIDENCED
    ∧ G01_PASS ∧ G02_PASS ∧ G03_PASS ∧ G04_PASS ∧ G05_PASS
    ∧ G06_PASS ∧ G07_PASS ∧ G08_PASS ∧ G09_PASS ∧ G10_PASS
    ∧ ALL_REQUIRED_ERD_INVARIANTS_PASS_EVIDENCED
    ∧ EVIDENCE_INTEGRITY_VERIFIED
    ∧ TESTED_COMMIT == AUTHORIZED_COMMIT
    ∧ GOVERNANCE_AUDIT_PASS
    ∧ NO_BASELINE_DRIFT
```

Any `FAIL`, `BLOCKED`, `UNKNOWN`, `MISSING`, or `SKIPPED` in a required acceptance check keeps acceptance/final freeze false.

## 5. Release boundary

Release and controlled pilot remain governed by the independent release governance chain. Neither implementation start nor sprint acceptance by itself authorizes deployment, release, pilot, or emergency-layer state changes.

## 6. Source-of-truth binding

- ERD: `MOSTAOFI-V1.1-ERD-BASELINE-001` — unchanged and immutable under this revision.
- S1 OpenAPI: `spec/s1/openapi.yaml` — unchanged.
- Test Registry: Revision `002`; `S1-CT-001..071` remain immutable in meaning, and `S1-CT-072..074` remain the adopted additive G08 tests.

## 7. Sprint baseline preserved

S0 Foundation → S1 Maintenance Contract + Sites + SLA → S2 Scheduling → S3 Work Orders → S4 Inspection/Findings → S5 Evidence → S6 Waa’iyah → S7 Corrective Proposal/Approval → S8 Execution/Materials → S9 Report/Billing/Collection → S10 Training/Next Visit/Integration.
