#!/usr/bin/env bash
set -Eeuo pipefail

fail(){ echo "FAIL $*" >&2; exit 1; }
pass(){ echo "PASS $*"; }
need(){ command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"; }

need node; need npm; need curl; need docker; need git; need psql
node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( node_major >= 22 )) || fail "Node >=22 required, found $(node -v)"
pass "Node $(node -v)"
pass "npm $(npm -v)"

docker info >/dev/null 2>&1 || fail "Docker daemon unavailable or runner lacks permission"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 unavailable"
pass "Docker $(docker --version)"
pass "$(docker compose version)"

free_kb="$(df -Pk . | awk 'NR==2{print $4}')"
(( free_kb >= 8*1024*1024 )) || fail "at least 8 GiB free disk required"
pass "free disk >= 8 GiB"

curl -fsS --connect-timeout 5 --max-time 10 https://registry.npmjs.org/-/ping >/dev/null || fail "npm registry unreachable"
pass "npm registry reachable"

for image in postgres:18 semgrep/semgrep:latest; do
  docker pull "$image" >/dev/null || fail "cannot pull $image"
  digest="$(docker inspect --format='{{index .RepoDigests 0}}' "$image" 2>/dev/null || true)"
  echo "PASS image $image ${digest:-digest-unavailable}"
done

echo "RUNNER_PREFLIGHT=PASS"
