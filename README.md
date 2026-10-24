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

## التشغيل والتدقيق الآلي

اتبع [دليل التشغيل والتدقيق](docs/AUTOMATED_REVIEW_AR.md). البداية:

```bash
nvm use
npx --yes npm@12.2.1 run setup:audit
```

للاختبار الكامل على خدمات مؤقتة ومعزولة:

```bash
docker compose -f docker-compose.audit.yml up --build --abort-on-container-exit --exit-code-from audit
```

تظهر السجلات والتغطية في `.audit-output/`. إعداد الحاوية ليس اعتمادًا للإنتاج؛ تبقى بوابات S1 والإصدار والتشغيل منفصلة.

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


## تشغيل محلي متحقق — 2026-09-06

من Ubuntu تحت المستخدم `mostaofi`:

```bash
cd /home/mostaofi/mostaofi
npm run launch:local
```

يقرأ الأمر `.env` دون طباعته، ويشغّل خدمات Docker، ويولّد Prisma Client،
ويطبّق الترحيلات ثم يبني API وWeb ويشغّلهما في الخلفية على loopback.
يتوقف إذا كان المنفذ 3000 أو 4000 مستخدمًا حتى لا ينشئ نسخة مكررة.
تحتاج قاعدة جديدة إلى تنفيذ seed.sql وتهيئة bucket؛ تم تنفيذهما على هذا الجهاز.

الواجهة: http://localhost:3000/login
فحص الجاهزية: http://localhost:4000/api/v1/health/ready
السجلات: `.local-launch/logs/` ومعرّفات العمليات: `.local-launch/processes.json`.
التشغيل يستمر بعد إغلاق الطرفية، ويتوقف عند إيقاف WSL أو الجهاز؛ أعد الأمر للتشغيل.
هذا تشغيل محلي للتحقق، ولا يمنح اعتماد الإصدار الرسمي أو توقيع CI.
