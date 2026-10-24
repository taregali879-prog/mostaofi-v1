#!/usr/bin/env bash
set -euo pipefail
if [[ "${NODE_ENV:-}" != test || "${DATABASE_URL##*/}" != mostaofi_audit_test ]]; then
  echo 'Refusing to initialize a database other than the disposable audit database.' >&2
  exit 2
fi
npm run db:migrate
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed.sql
for audit_attempt in {1..30}; do
  if node -e "fetch(process.env.S3_ENDPOINT,{signal:AbortSignal.timeout(1000)}).then(()=>process.exit(0)).catch(()=>process.exit(1))"; then break; fi
  sleep 1
done
npm run audit:full
