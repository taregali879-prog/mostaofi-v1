# تشغيل التدقيق الآلي لمستوفي

المستودع يجمع منصة مستوفي ومنصة مقاول الشريك في npm Workspaces. راجع `package-lock.json` للإصدارات الفعلية، و`.nvmrc` لإصدار Node المختبر. الإصدار الافتراضي Node 24.19.0، وnpm 12.2.1؛ يدعم تعريف engines أيضًا Node 22.22.2 وما بعده ضمن 22.

## إعداد محلي قابل للتكرار

```bash
nvm use
npx --yes npm@12.2.1 run setup:audit
python3 -m venv .audit-tools
.audit-tools/bin/python -m pip install -r requirements-audit.txt
export PATH="$PWD/.audit-tools/bin:$PATH"
npx --yes npm@12.2.1 run audit:local
```

`setup:audit` ينفذ `npm ci --ignore-scripts` ثم يشغّل Prisma generate صراحة. لا يشغّل migration أو seed، ولا يقرأ أسرار الإنتاج أو يغيّرها. npm مثبت لأن مشكلة Workspaces/overrides قد تعرض شجرة غير متسقة عند استخدام إصدارات أو lockfiles قديمة. يتحقق `deps:check` من محتوى تقرير npm المتداخل ومن exit code معًا.

`audit:local` ينفذ dependency tree وSCA وESLint وTypeScript وNode/S0 وPython integrity وSemgrep والبناء واختبارات API المعزولة. استمرار الفحوص بعد فشل إحداها مقصود لجمع الأدلة؛ النتيجة النهائية تفشل إذا فشلت أي بوابة. إذا لم يوجد Semgrep تظهر بوابة فاشلة، ولا تعد متجاوزة أو ناجحة.

تظهر نتائج كل تشغيل في `.audit-output/<timestamp>/summary.json` مع السجلات. لا تعني نتيجة الفحص المحلي اجتياز اختبارات PostgreSQL/S3 أو حوكمة S1 أو اعتماد نشر.

## اختبار معزول باستخدام الحاوية

```bash
docker compose -f docker-compose.audit.yml up --build --abort-on-container-exit --exit-code-from audit
docker compose -f docker-compose.audit.yml down
```

الحاوية تنشئ PostgreSQL وS3 في شبكة خاصة دون نشر منافذهما. أسماء الحسابات والأسرار داخل هذا الملف بيانات اختبار مؤقتة. يرفض سكربت التهيئة العمل دون `NODE_ENV=test` أو إذا لم يكن اسم قاعدة البيانات `mostaofi_audit_test`. يطبق جميع الترحيلات وseed على هذه القاعدة ثم ينفذ `audit:full` مع التغطية. لا تستخدم هذه البيانات في الإنتاج.

يمكن تنفيذ `audit:full` مباشرة بعد توفير قاعدة اختبار مرَحّلة ومهيأة وخدمة S3 وإعداد `DATABASE_URL` و`S3_*` و`JWT_*` و`NODE_ENV=test`. ينفذ Jest جميع اختبارات API ويجمع التغطية. حدود التغطية المضافة تمنع التراجع تحت 80% statements و75% functions و60% branches و90% lines؛ لا تعني هذه الحدود اكتمال تغطية المخاطر.

## الفحوص المنفردة

```bash
npx --yes npm@12.2.1 run deps:check
npx --yes npm@12.2.1 audit --json
npm run lint
npm run typecheck
npm run test:local
npm run test:coverage
python3 -m unittest discover -s tests -p 'test_*.py'
semgrep scan --config .semgrep.yml --metrics=off --disable-version-check --error
npm run build
```

ESLint يطبق القواعد الموصى بها لـJavaScript وTypeScript مع منع warnings. أبقيت `no-explicit-any` معطلًا صراحة في الشيفرة الموروثة؛ إزالة any من جميع DTOs والخدمات مشروع تقوية مستقل، ولا يصح الادعاء بأن الشيفرة أصبحت خالية منه.

قواعد Semgrep المحلية تمنع eval وunsafe Prisma SQL وshell داخل التطبيق وتعطيل التحقق من TLS وHTML الخام والمفاتيح الخاصة. يمكن توسيع الفحص باستعمال `--config p/typescript --config p/nodejs --config p/secrets`؛ هذه المجموعات الخارجية قابلة للتغير وتحتاج اتصالًا لتنزيل القواعد، ولا ترفع الشيفرة إلى خدمة تحليل سحابية في هذا المسار.

## التشغيل المحلي

`npm run launch:local` يتطلب `.env` مكتملًا وخدمات Docker. شُغّل API بوضع development على loopback لتجنب تعارض إعداد localhost مع حارس الإنتاج، وWeb بوضع production. تبقى `validateProductionConfig` مفروضة على تشغيل الإنتاج الحقيقي. يتوقف السكربت إذا كان المنفذ 3000 أو 4000 مشغولًا.

## الإصدار وCI

يتحقق CI من التبعيات وSCA وlint والأنواع وSAST واختبارات سلامة الأدلة وجميع HTTP/DB/S3 E2E والتغطية والبناء واختبارات الأداء والمراقبة. ترفق الأدلة حتى عند الفشل. لا تنشر هذه التعديلات تلقائيًا ولا تنشئ وسم إصدار.

بوابات S1 والمرجعيات المجمدة لا تتغير بهذا المسار. فشل strict OpenAPI أو عدم وجود دليل HTTP معتمد يبقي اعتماد الإصدار محجوبًا. تبقى إعدادات SMTP الفعلية وتطابق commit المنشور وتجربة rollback على بيئة staging متطلبات تشغيل مستقلة.
