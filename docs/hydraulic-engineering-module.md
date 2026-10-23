# Hydraulic Engineering — Mostaofi integration

## Scope (preliminary / not approved for construction)
Navigation: Projects → Project → Engineering & Design → Hydraulic calculations.

Components:
- Next.js project UI: `apps/web/app/projects/[id]/engineering/hydraulics/page.tsx`
- NestJS API: `apps/api/src/hydraulics/`
- Postgres/Prisma: `hydraulic_calculations` and immutable `hydraulic_calculation_versions`
- Drawing reference: existing `documents` / `document_versions`, SHA-256 and organization/project checked by API.
- DXF: browser-side ASCII DXF geometric takeoff for 2D LINE and LWPOLYLINE, with bulge arc lengths. No DWG support; no automatic connectivity or critical-path selection.

## API (JWT + tenant RBAC)
- `GET /api/v1/projects/:projectId/hydraulics`
- `POST /api/v1/projects/:projectId/hydraulics`
- `GET /api/v1/hydraulics/:id`
- `POST /api/v1/hydraulics/:id/versions`

New calculation example:

```json
{
  "title": "Hydraulic path A",
  "documentVersionId": "<verified document version UUID>",
  "sourceSha256": "<64 hex SHA-256>",
  "input": {
    "residualPressurePsi": 12,
    "elevationRiseM": 3,
    "designFlowGpm": 500,
    "segments": [
      {"id":"S-1","lengthM":25,"equivalentLengthM":0,"flowGpm":500,
       "insideDiameterMm":150,"cFactor":120}
    ]
  }
}
```

Authorization: read = authenticated tenant project membership; write = ENGINEER, PROJECT_MANAGER, CONTRACTOR_ADMIN, ORG_ADMIN. A document version must have completed upload and belong to the SAME tenant and project. Updates are append-only snapshot versions; concurrent revision conflicts return HTTP 409.

## Limits and engineering disclaimers
- Hazen–Williams pipe friction in PSI for manually selected linear path; **not** a full network hydraulic solver.
- Required residual pressure is user input; no hardcoded '65 PSI for all sprinklers'.
- Manufacturer curve interpolation uses three user-supplied points only; not a tested/certified NFPA 20 pump curve.
- DXF header missing/unsupported units causes explicit error without assumed metric scale; user can choose units.
- No automatic sprinkler demand area, K-factor network balance, fitting manufacturer K, 3D routes, DWG/PDF pipe takeoff, or definitive NFPA/SBC conformity.
- Uploaded-document SHA-256 is supplied via the current client upload workflow; S3 server-side checksum verification should be added before recognizing drawings as authoritative.

## Release / rollback
1. Keep PR draft and main/Railway production untouched.
2. Fix existing CI security gate and validate schema migration on disposable PostgreSQL.
3. Test tenant isolation, stored calculations/versions, DXF file hash match, real drawing dimensions, S3 CORS/PUT and login session.
4. Backup and rehearse database restore prior to migration; apply additive schema in PREVIEW only.
5. Release behind `HYDRAULICS_ENABLED` feature flag (not yet wired). No production rollout until approved.
6. Rollback application to previous deployment; retain additive migration tables (do not drop customer data).
