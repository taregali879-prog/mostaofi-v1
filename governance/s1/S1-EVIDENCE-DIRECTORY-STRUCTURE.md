# Mostaofi v1.1 — S1 Evidence Directory Structure

Status: `FINAL_FOR_EXECUTION`  
Manifest: `governance/s1/ci-manifest-r003.yaml`  
Registry: `S1-TEST-REGISTRY-R002`

```text
evidence/s1/
├── run-identity.json
├── runtime-preflight.json
├── strict-validator-attempt.log
├── tests/
│   ├── S1-CT-001/
│   │   ├── result.json
│   │   ├── request.json
│   │   ├── response.json
│   │   ├── execution.log
│   │   └── sha256.txt
│   └── ... one directory for every adopted CT ...
├── gates/
│   ├── G01/
│   │   ├── gate-result.json
│   │   ├── test-index.json
│   │   └── sha256.txt
│   └── ... G02 through G10 ...
├── integrity/
│   ├── artifact-manifest.json
│   └── artifact-manifest.sha256
├── test-summary.json
├── gate-summary.json
└── s1-gate-decision.json
```

Rules:

1. Every adopted CT gets an evidence directory even when the result is `BLOCKED`.
2. A test that is not executed because an upstream gate blocks execution records `executionAttempt=NOT_SENT` in request/response evidence.
3. Every request, response, execution log and result is SHA-256 bound.
4. Missing artifacts or digest mismatch fail-close the affected CT and gate.
5. CT IDs not present in Registry R002 are not silently invented. The canonical range through `S1-CT-071` contains 31 defined CTs; R002 adds `S1-CT-072..074` for G08.
