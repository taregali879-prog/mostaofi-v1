# MOSTAOFI v1.1 — S1 Governing PASS/FAIL Report

Run: `MOSTAOFI-S1-EXEC-20260904-002`  
Tested commit: `75093ae45e353c1bab351db445d31392ecfeb999`  
Authorized commit: `75093ae45e353c1bab351db445d31392ecfeb999`  
Commit binding: **PASS**

## Gate result

| Gate | Result |
|---|---|
| G01 | **BLOCKED** |
| G02 | **BLOCKED** |
| G03 | **BLOCKED** |
| G04 | **BLOCKED** |
| G05 | **BLOCKED** |
| G06 | **BLOCKED** |
| G07 | **BLOCKED** |
| G08 | **BLOCKED** |
| G09 | **BLOCKED** |
| G10 | **BLOCKED** |

## Contract Test result

- Adopted CTs: **34**
- Defined CTs in canonical range `S1-CT-001..071`: **31**
- Additive G08 CTs `072..074`: **3**
- PASS: **0**
- FAIL: **0**
- BLOCKED: **34**

The numeric gaps in `001..071` are not tests in Registry R002 and were not invented.

## Blocking evidence

1. G01 strict OpenAPI semantic validation: `BLOCKED` because the pinned Redocly acquisition/execution attempt timed out in the runner environment.
2. S1 maintenance runtime: no `S1_BASE_URL` is configured and no maintenance runtime source directory was detected; therefore no HTTP request/response was fabricated.
3. Because G01 is non-PASS, every adopted CT is recorded `BLOCKED` with request/response/log/result evidence and SHA-256.

## Governing decision

```text
S1_PASS = G01_PASS ∧ G02_PASS ∧ G03_PASS ∧ G04_PASS ∧ G05_PASS
          ∧ G06_PASS ∧ G07_PASS ∧ G08_PASS ∧ G09_PASS ∧ G10_PASS

S1_PASS = FALSE
S2_UNLOCKED = FALSE
```

Final state: **BLOCKED — fail closed.**
