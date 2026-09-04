# MOSTAOFI v1.1 — S1 CI Execution Runbook R003

Status: `FINAL_FOR_EXECUTION`  
Prerequisite: `S0_ACCEPTED = TRUE`  
Manifest: `governance/s1/ci-manifest-r003.yaml`  
Registry: `S1-TEST-REGISTRY-R002`  
Decision model: `FAIL_CLOSED`

## 1. Run identity and bindings

Before any gate runs:

- checkout the authorized commit;
- require a clean working tree;
- record full commit SHA, branch, runner identity, environment ID and runner/workflow hash;
- verify the frozen ERD, S1 OpenAPI and manifest digests;
- verify the S0 Acceptance Record and the three delivered S0 bundle SHA-256 values.

## 2. Gate order

Execute in strict dependency order:

`G01 → G02 → G03 → G04 → G05 → G06 → G07 → G08 → G09 → G10`

G01 is fail-closed. Runtime Contract Tests are not sent when G01 is not PASS. They still receive complete `BLOCKED` evidence artifacts documenting the non-execution reason.

## 3. G01

G01 requires:

- `HEAD == S1_AUTHORIZED_COMMIT_SHA`;
- clean tree at run start;
- exact S1 OpenAPI SHA-256;
- exact CI manifest SHA-256 recorded at run time;
- YAML/static structural validation PASS;
- specialized OpenAPI semantic validator PASS;
- evidence integrity VERIFIED.

A missing specialized validator, registry/network failure while acquiring it, or validator infrastructure failure is `BLOCKED`, not a semantic OpenAPI failure.

## 4. Contract Test execution

For every adopted CT produce:

- `result.json`
- `request.json`
- `response.json`
- `execution.log`
- `sha256.txt`

The current registry defines 31 CTs through ID 071 and three additive G08 tests 072–074. Numeric gaps are reserved/undefined IDs, not missing tests.

When an HTTP runtime is available, the runner must send the canonical method/path and validate status, canonical error envelope, idempotency/concurrency and domain assertions as mapped. When it is unavailable or G01 is not PASS, the test is `BLOCKED` with no fabricated response.

## 5. Integrity

SHA-256 is mandatory for every evidence artifact. A run-level artifact manifest is built after all CT and gate artifacts exist. The manifest itself is SHA-256 bound.

## 6. Gate decision

A gate passes only when its coverage is `COVERED`, every mapped required CT is PASS, and every evidence digest verifies.

```text
S1_PASS = G01_PASS ∧ G02_PASS ∧ G03_PASS ∧ G04_PASS ∧ G05_PASS
          ∧ G06_PASS ∧ G07_PASS ∧ G08_PASS ∧ G09_PASS ∧ G10_PASS

S2_UNLOCKED = S1_PASS
```

Any `FAIL`, `BLOCKED`, `UNKNOWN`, `MISSING`, `SKIPPED`, missing evidence or digest mismatch keeps `S1_PASS = FALSE` and `S2_UNLOCKED = FALSE`.

## 7. Human review

Human review is appended only after machine evidence exists. It cannot override a non-PASS automated result.
