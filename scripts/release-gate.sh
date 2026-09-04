#!/usr/bin/env bash
set -Eeuo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${S3_ENDPOINT:?S3_ENDPOINT is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"
: "${JWT_ACCESS_SECRET:?JWT_ACCESS_SECRET is required}"
: "${JWT_REFRESH_SECRET:?JWT_REFRESH_SECRET is required}"
mkdir -p evidence/runtime/gates

cleanup(){ if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then kill "$API_PID" || true; fi; }
trap cleanup EXIT
utc(){ date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"; }
run_gate(){
  local name="$1"; shift
  local started completed rc log="evidence/runtime/${name}.log"
  started="$(utc)"
  set +e
  "$@" > >(tee "$log") 2>&1
  rc=$?
  set -e
  completed="$(utc)"
  if [[ $rc -eq 0 ]]; then node scripts/record-gate.mjs "$name" PASS "$rc" "$started" "$completed" "$log"; else node scripts/record-gate.mjs "$name" FAIL "$rc" "$started" "$completed" "$log"; return "$rc"; fi
}

[[ -f package-lock.json ]] || { echo 'FAIL package-lock.json missing'; exit 2; }
run_gate npm_ci npm ci --no-audit --fund=false
run_gate security bash -lc "npm audit --audit-level=high --omit=dev && docker run --rm -v \"$PWD:/src\" semgrep/semgrep semgrep scan --config auto --error /src/apps /src/packages"
run_gate migration bash -lc "npm run db:generate && npm run db:migrate && psql \"$DATABASE_URL\" -v ON_ERROR_STOP=1 -f database/seed.sql"
run_gate e2e npm run test:e2e
run_gate build bash -lc "npm run test:local && npm run build"

node apps/api/dist/main.js > evidence/runtime/api.log 2>&1 & API_PID=$!
for i in {1..45}; do
  curl -fsS http://127.0.0.1:${PORT:-4000}/api/v1/health/ready >/dev/null && break
  [[ $i -eq 45 ]] && { echo 'FAIL API readiness timeout'; exit 1; }
  sleep 2
done
run_gate performance npm run perf:smoke
run_gate sql_reconciliation psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f evidence/verify_mvp.sql
run_gate rollback_verification ./scripts/verify-rollback.sh

echo 'RELEASE_GATE_AUTOMATED_CORE=PASS'
