# CI / Pilot Infrastructure

## Preferred CI runner
Use GitHub-hosted `ubuntu-latest` for the MVP release gate unless policy requires self-hosting. It has outbound Internet access and Docker available, while each job is ephemeral. If a self-hosted runner is used, isolate it in a CI subnet, allow outbound HTTPS only to required package/container/GitHub endpoints, deny inbound public access, and use short-lived GitHub runner registration credentials.

## One-time sequence
1. Push this repository to the protected remote branch.
2. Run **Bootstrap npm lockfile** once. It generates and validates `package-lock.json`, then commits it.
3. Require the normal **CI** workflow on branch protection.
4. When CI is green and `evidence/PILOT_CHECKLIST.md` is reviewed, manually run **Release MVP** with `version=v1.0.0-mvp` and confirmation `RELEASE`.
5. The release workflow creates the tag only after the fail-closed gate succeeds and uploads release evidence.

## Docker requirements for self-hosted runners
- Docker Engine + Compose v2.
- Runner account permitted to access Docker without interactive sudo.
- At least 8 GiB free disk before each job.
- Outbound HTTPS/DNS to npm registry, GitHub, and configured container registry.
- Cache may be enabled for npm and container layers, but release correctness must never depend on cache.

## Pilot deployment secrets
Use `.env.pilot.example` only as a template. Store real DB/MinIO/JWT values in the deployment secret manager. Do not reuse CI credentials. Bind Postgres/Redis/MinIO to private interfaces and expose only the application through the controlled ingress/TLS endpoint.
