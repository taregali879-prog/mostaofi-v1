# P0 — Git Source of Truth and Railway Cutover

## Objective

Retire the Railway Function/Bun embedded `startCommand` deployment and make `taregali879-prog/mostaofi-v1` the exclusive deployable source of truth. Every deploy must resolve to a Git commit SHA and pass the existing release gates.

## Current legacy production

The current `Mostaofi V1` Railway service is a legacy Function/Bun deployment. It must stay live only until the Git-backed replacement passes smoke/E2E/health checks and a controlled cutover is approved. Do not clear its `startCommand` in place before the replacement is healthy.

## Target topology

One Git repository, one commit lineage, two Railway services:

1. **Mostaofi API Git** — NestJS + Prisma.
2. **Mostaofi Web Git** — Next.js.

The exact service settings are versioned in `/deploy/railway/p0-service-settings.json`. They are applied through Railway service settings/API after each service is created from the GitHub source. This deliberately avoids legacy `railway.toml` Config-as-Code, which is deprecated for new services.

Both services must be created from the official GitHub repository and pinned to the same release branch/commit lineage. The API runs `prisma migrate deploy` as a pre-deploy command. Railway health checks are `/api/v1/health/ready` for API and `/login` for Web. Git-triggered deployments must expose `RAILWAY_GIT_COMMIT_SHA`; `/api/v1/health/release` surfaces non-secret source provenance for release evidence.

## Required service variables

API requires `NODE_ENV=production`, `DATABASE_URL`, `WEB_URL`, both JWT signing secrets, and the production S3 endpoint/bucket/access credentials. The current Nest source does not consume Redis. `PORT` is injected by Railway. Production startup fails closed if runtime controls or Git provenance are invalid.

Web requires `NODE_ENV=production` and `NEXT_PUBLIC_API_URL=https://<api-domain>/api/v1` at build time. `PORT` is injected by Railway.

Never commit `.env` or secret values.

## Exact Git migration

The original local Git graph must be pushed normally rather than recreated via API, so commit identities/parents/SHAs remain intact.

Run:

```bash
cd /home/mostaofi/mostaofi
./scripts/p0-git-source-cutover.sh push
```

The script fails closed unless audit, Prisma generation, local tests, E2E, build, clean-tree, secret guard, and final remote SHA verification all pass.

## Railway cutover sequence

1. Create Git-backed API and Web services from `taregali879-prog/mostaofi-v1`.
2. Point each service to its Config-as-Code file.
3. Attach production variables without copying secrets into Git.
4. Give the API a temporary public domain; build Web with that API URL.
5. Run API readiness, login/project/procurement/inventory E2E, Web smoke, tenant/RBAC checks, and database reconciliation.
6. Confirm both Railway deployment records identify the intended Git commit.
7. Move production traffic/domain only after automated gates pass.
8. Keep the Function/Bun service available for rollback during the controlled observation window.
9. After stable observation and rollback evidence, retire the Function/Bun service and prohibit non-Git production sources.

## Fail-closed rules

A missing Git SHA, mismatch between Web/API release lineage, failed migration, failed healthcheck, failed tenant isolation/RBAC, failed audit, or missing release evidence is a **NO-GO**. Do not replace the live service in those states.
