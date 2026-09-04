#!/usr/bin/env bash
set -Eeuo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
mkdir -p evidence/runtime/rollback
DUMP=evidence/runtime/rollback/pre-release.dump
RESTORE_DB="muqawil_rollback_${GITHUB_RUN_ID:-local}_$RANDOM"
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" -f "$DUMP"
BASE_URL="${DATABASE_URL%/*}"
createdb "${BASE_URL}/${RESTORE_DB}"
trap 'dropdb --if-exists "${BASE_URL}/${RESTORE_DB}" >/dev/null 2>&1 || true' EXIT
pg_restore --no-owner --no-acl -d "${BASE_URL}/${RESTORE_DB}" "$DUMP"
psql "${BASE_URL}/${RESTORE_DB}" -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | grep -Eq '^[1-9][0-9]*$'
echo 'ROLLBACK_VERIFICATION=PASS'
