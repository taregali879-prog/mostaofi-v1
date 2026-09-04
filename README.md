# منصة مقاول الشريك — Execution Repository

هذا المستودع هو بداية التنفيذ الفعلي لأول Vertical Slice:

**Login → Contractor Profile → Project → Project Dashboard → Documents → Audit Trail**

## المعمارية
- Web: Next.js / TypeScript
- API: NestJS / TypeScript
- DB: PostgreSQL
- Cache: Redis
- Object Storage: S3-compatible / MinIO محليًا
- CI: GitHub Actions

## تشغيل البيئة
1. انسخ `.env.example` إلى `.env`.
2. شغّل `docker compose up -d`.
3. نفّذ `npm install` في بيئة لديها اتصال بمستودع npm.
4. طبّق migration من `database/migrations/0001_initial/migration.sql` ثم `database/seed.sql`، أو حوّلها لاحقًا إلى Prisma migrations عند تثبيت Prisma.
5. شغّل API وWeb بأوامر npm.

## تحقق بدون تبعيات خارجية
```bash
npm run test:local
```
هذا يفحص سلامة هيكل المستودع، منطق الصلاحيات/حالات المقاول، وعقد الـVertical Slice.

## Definition of Done لأول Slice
- مصادقة وصلاحيات أساسية.
- ملف مقاول Partner profile.
- إنشاء/قراءة/تعديل مشروع داخل tenant نفسه.
- Dashboard للمشروع.
- Metadata/versioning للمستندات.
- Audit events immutable على العمليات الحساسة.
- CI يمنع الدمج عند فشل الاختبارات الأساسية.

## v0.3.0 execution slice
The API now uses PostgreSQL/Prisma persistence, JWT access/refresh tokens with RBAC, S3-compatible presigned document uploads, and persisted audit events. See `docs/EXECUTION_STATUS.md` for the exact verification status and `apps/api/test/vertical-slice.e2e-spec.ts` for the definitive E2E path.


## v0.3.0
BOQ Versioning & Approval implemented. Test Ready preflight passes for repository/contracts; full HTTP/DB E2E remains gated by dependency installation and CI execution.

## v0.5.0-rc1
Implements the S4–S8 MVP backend baseline (Procurement, PO, Delivery, Inventory and Material KPI), full E2E specification, CI gate, pilot console and verification evidence. The release remains RC/BLOCKED until package-lock generation and full PostgreSQL/MinIO CI pass on a network-enabled runner.

## v0.5.0-rc2 — Test Ready / release hardening
This release candidate adds a one-time lockfile bootstrap workflow, fail-closed runner preflight, reproducible CI/release gates, SQL reconciliation, pilot health monitoring, release evidence packaging, security/access checklist and rollback controls. Do not create `v1.0.0-mvp` outside the green `Release MVP` workflow.
