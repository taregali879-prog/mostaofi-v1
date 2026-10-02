#!/usr/bin/env bash
set -euo pipefail

REPO="taregali879-prog/mostaofi-v1"
EXPECTED_ORIGIN="https://github.com/${REPO}.git"
MODE="${1:-verify}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
HEAD_SHA="$(git rev-parse HEAD)"
BRANCH="$(git branch --show-current)"

fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass(){ printf 'PASS: %s\n' "$*"; }

[[ "$(git remote get-url origin)" == "$EXPECTED_ORIGIN" ]] || fail "origin must be $EXPECTED_ORIGIN"
[[ -z "$(git status --porcelain)" ]] || fail "working tree must be clean"
if git ls-files --error-unmatch .env >/dev/null 2>&1; then fail ".env must never be tracked"; fi
pass "origin, clean tree, and secret-file guard"

npm audit --audit-level=high
npm run db:generate
npm run test:local
(
  if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then set -a; source ./.env; set +a; fi
  [[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL required for E2E"
  npm run test:e2e
)
(
  unset NODE_ENV
  npm run build
)
pass "audit, Prisma generation, local tests, E2E, and production build"

case "$MODE" in
  verify)
    ;;
  push)
    # Exact Git transfer: preserve the existing commit graph/SHAs.
    git push origin --all
    git push origin --tags
    git push origin HEAD:refs/heads/main
    ;;
  *) fail "usage: $0 [verify|push]" ;;
esac

REMOTE_MAIN="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
if [[ "$MODE" == "push" || -n "$REMOTE_MAIN" ]]; then
  [[ "$REMOTE_MAIN" == "$HEAD_SHA" ]] || fail "remote main ($REMOTE_MAIN) != local HEAD ($HEAD_SHA)"
  pass "GitHub main exactly matches $HEAD_SHA"
else
  printf 'BLOCKED: GitHub main does not exist yet; authentication/write access is still required for exact push.\n' >&2
  exit 2
fi

printf 'SOURCE_OF_TRUTH repo=%s branch=main sha=%s local_branch=%s\n' "$REPO" "$HEAD_SHA" "$BRANCH"
