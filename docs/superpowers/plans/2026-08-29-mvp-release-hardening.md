# MVP Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make v0.5.0-rc1 operationally ready for a real internet-connected CI runner, enforce a reproducible Test Ready Gate, and automate release/pilot evidence without tagging v1.0.0-mvp before the gate is green.

**Architecture:** Keep the existing modular monolith and application code unchanged. Harden repository-level CI/release automation around the existing PostgreSQL + MinIO + NestJS + Next.js vertical slice. The release workflow must be fail-closed and produce evidence artifacts.

**Tech Stack:** GitHub Actions, Node.js 22, npm, PostgreSQL 18, Docker, MinIO, Prisma, NestJS, Next.js.

**Spec:** `docs/RELEASE_ARCHITECTURE.md`, `evidence/TEST_READY_REPORT.md`, `evidence/PILOT_PLAN.md`

## Global Constraints
- Do not create `v1.0.0-mvp` unless full pipeline, E2E, build, performance smoke and release checks pass.
- `package-lock.json` must be committed before normal CI uses `npm ci`.
- Pilot scope is one project only.
- No Critical/High defects may remain open at release.
- Rollback evidence must be packaged with the release artifact.

---

### Task 1: Runner preflight and lockfile bootstrap
**Files:**
- Create: `scripts/runner-preflight.sh`
- Create: `.github/workflows/bootstrap-lockfile.yml`
- Modify: `scripts/test-ready-check.mjs`

- [ ] Add fail-closed checks for Node, npm, internet DNS/registry, Docker daemon, Docker Compose, disk, and registry image pulls.
- [ ] Add a manual one-time workflow that generates `package-lock.json`, validates `npm ci`, runs local tests, and commits the lockfile back to the selected branch.
- [ ] Make readiness fail, not merely warn, when lockfile is absent in a release context.

### Task 2: Reproducible CI and release gate
**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/release-gate.sh`
- Create: `.github/workflows/release-mvp.yml`

- [ ] Require committed lockfile.
- [ ] Start PostgreSQL and MinIO with health checks.
- [ ] Run npm ci, local tests, Prisma generation/migrations, seed, full HTTP E2E, builds, performance smoke, and SQL verification.
- [ ] Upload logs and evidence on every run.
- [ ] Only after all gates pass, create the exact requested tag and a release evidence archive.

### Task 3: Pilot monitoring and operational evidence
**Files:**
- Create: `scripts/pilot-monitor.mjs`
- Create: `evidence/PILOT_CHECKLIST.md`
- Modify: `evidence/PILOT_PLAN.md`
- Modify: `evidence/ROLLBACK_RUNBOOK.md`

- [ ] Add repeated health/latency checks with non-zero exit on failure/threshold breach.
- [ ] Define pilot KPIs, stop conditions, daily reconciliation, incident severity and rollback trigger.
- [ ] Add explicit secrets and access-control checklist.

### Task 4: Verification and RC2 packaging
**Files:**
- Modify: `evidence/TEST_READY_REPORT.md`
- Modify: `README.md`

- [ ] Run `npm run test:local` fresh.
- [ ] Run shell syntax checks for new scripts.
- [ ] Run repository static checks for required workflow/release steps.
- [ ] Record environmental blockers exactly.
- [ ] Commit and package `v0.5.0-rc2` without creating `v1.0.0-mvp` unless the external full gate has actually passed.
