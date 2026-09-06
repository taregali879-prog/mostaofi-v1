# مسار الانتقال إلى أدلة Mostaofi v1.1

هذه حزمة تحقق مرشحة، وليست اعتماد إصدار مستقر. خط الأساس المحلي 0.5.0-rc3؛ نجاح ستة اختبارات MVP لا يثبت مواصفة v1.1.

## مراجعة Git واختيار النسخة

تشمل التغييرات المقبولة: إصلاحات التشغيل المحلي المراجعة (Prisma وAudit وS3 واعتمادات Nest/Jest)، lockfile، إعدادات Next التي ولّدها البناء، مشغل محلي ووثائقه، والمدقق المتخصص المثبت على 1.34.5، ومسار أدلة S1 الجديد واختباراته.

نُقلت نسخة schema الاحتياطية السابقة إلى `.local-launch/backups/` دون حذفها. تبقى .env وnode_modules والسجلات والنسخ الاحتياطية خارج Git. لا تعاد كتابة أدلة evidence/s1 التاريخية؛ كل تشغيل ينتج مجلدًا جديدًا خارج شجرة المصدر.

تثبت هذه التغييرات في commit واحد بعد اجتياز الاختبارات المحلية وdiff --check. SHA الناتج مرشح للتحقق فقط؛ لا يوجد RC مستقر مؤهل لـv1.1 طالما G01 أو أي CT غير ناجح. يحفظ التقرير الخارجي SHA الكامل وبصمة أرشيف المصدر دون إضافة تقرير يشير إلى نفسه داخل commit.

## المسار التنفيذي

1. راجع diff وlockfile وملفات workflow/scripts والاعتمادات وأثر إصلاحات التشغيل. تحقق أن شجرة Git نظيفة وأن ملفات المواصفات/السجل المجمدة لم تتغير.
2. اربط مستودع GitHub المعتمد بعد التحقق من ملكيته وإمكانية الوصول. origin الحالي ملف gitbundle محلي؛ لا يمكن إرسال workflow إلى هذا الملف وتشغيل GitHub Actions منه. احتفظ به كمصدر تاريخي وأضف remote آخر مثل github عند توفير الرابط.
3. ارفع الفرع المراجع. يجب اعتماد workflow في الفرع الافتراضي، ثم تشغيل workflow_dispatch على ref الذي يساوي commit المرشح. مرّر SHA كاملًا في rc_sha. يفرض workflow تطابق HEAD وGITHUB_SHA وGITHUB_WORKFLOW_SHA مع هذا المدخل. أي merge أو تعديل لاحق يولّد SHA جديدًا يتطلب تشغيلًا جديدًا.
4. يثبت Actions أدواته، ويشغل اختبارات المدقق والانحدار المحلي. الإجراءات الخارجية مثبتة بمعرّفات commit كاملة؛ npm يستخدم package-lock، وPyYAML مثبت على 6.0.3. Node 22 وPython 3.12 ضمن بيئة runner.
5. يشغّل G01–G10 وفق ci-manifest-r003.yaml والسجل R002: 34 CT معتمدة (31 حتى ID 071 وثلاثة اختبارات 072–074). الفجوات الرقمية محجوزة وليست CT مفقودة.
6. يتحقق المدقق المستقل من قائمة الملفات والبصمات والأحجام، وهوية النسخة والتشغيل وتغطية البوابات وحالة كل اختبار. سلامة البصمة وحدها لا تعني نجاح الاختبار، ولا يقبل PASS مع NOT_SENT أو دون assertions منفذة.
7. ينشئ source.tar من Git commit، وevidence.tar وverified-decision.json وSHA256SUMS. يرفع الحزمة حتى عند NO-GO؛ يفشل job القرار برمز 42 عند عدم النجاح.
8. مهمة مستقلة تمنح OIDC وattestations:write فقط للتوقيع، ولا تنفذ كود التطبيق. تنشئ GitHub artifact provenance ثم تتحقق بـgh attestation verify مقيدة بالمستودع وworkflow وsource digest. توقيع أدلة فشل لا يحولها إلى أدلة نجاح.
9. عند PASS آلي فقط، تتحقق مهمة review-preflight من وجود environment باسم mostaofi-v11-review، مع required reviewers وprevent_self_review=true وcan_admins_bypass=false. غياب البيئة أو تعذر قراءة إعداداتها يوقف الاعتماد؛ لا يكفي مجرد ذكر environment في YAML.
10. تظهر مرحلة المراجعة البشرية بعد الأدلة والتوقيع. يراجع إنسان مخول SHA وRun ID/attempt وبصمات المصدر والأدلة ونتائج جميع البوابات، ويسجل الموافقة في GitHub. يعاد تحقق التوقيع والبصمة بعد الانتظار. لا يصنع الوكيل موافقة بشرية ولا يستطيع الإنسان تجاوز بوابة غير ناجحة.

## البوابات

| البوابة | موضوع الإثبات |
|---|---|
| G01 | مخطط OpenAPI والبصمات والنسخة النظيفة والتحقق المتخصص |
| G02 | توافق الطلبات والاستجابات |
| G03 | دورة الحالات وعدم تكرار الأثر |
| G04 | سجل الأخطاء القياسي |
| G05 | ETag وIf-Match والتزامن |
| G06 | حماية التعديلات المعتمدة |
| G07 | إسقاط Contract 360 |
| G08 | حتمية تقسيم الصفحات |
| G09 | ربط إصدار سياسة SLA |
| G10 | صحة نطاق التغطية |

## المعوقات المثبتة

- المدقق Redocly 1.34.5 أبلغ 23 خطأ فعليًا في OpenAPI المجمد. يلزم Amendment معتمد وتحديث بصمات الأساس وفق الحوكمة قبل إعادة الاختبار؛ لا تُعطل قواعد المدقق للوصول إلى PASS.
- run-s1-evidence.py لا يحتوي تنفيذ HTTP للاختبارات؛ يخرج NOT_SENT/BLOCKED. يلزم تطوير runtime الصيانة والاختبارات الفعلية بمعطياتها وأدوارها وإثباتات idempotency/concurrency وغيرها. تعيين S1_BASE_URL وحده لا يكفي.
- لا يوجد GitHub remote معتمد حتى إعداد هذه الوثيقة؛ لذلك لا Live Run ID أو توقيع حي أو Human Approval فعلي.
- لم تتغير وثائق قبول S0 التاريخية؛ شهادتها تخص نسختها الأصلية ولا تعني تحقق invariants على commit جديد تلقائيًا.

## قرار القبول

S1_PASS يتطلب نجاح G01–G10 وكل CT معتمد، وتطابق النسخة والتحقق من سلامة الأدلة. قبول S1 لا يساوي إثبات كامل v1.1 أو تفويض النشر. لا تنشئ هذه العملية tag ولا نشرًا؛ يجب إكمال جميع مراحل v1.1 ومتطلبات الأمان والاستعادة وتفويض الإصدار في مسار الإصدار الحاكم.

القرار الحالي: NO-GO. Human Approval=PENDING، Live Attestation=NOT_EXECUTED. لا يمكن تسميته PASS بسبب نجاح التشغيل المحلي.

## متطلبات GitHub قبل التشغيل

يؤكد مسؤول المستودع دعم artifact attestations وخاصية required reviewers في خطة المستودع، ويضبط البيئة بأسماء المراجعين الحقيقيين وحماية الفروع ومنع تجاوزها. لا تُنشأ هوية أو صلاحية أو موافقة وهمية. صلاحية قراءة إعدادات environment مطلوبة لمهمة preflight؛ إذا كانت سياسات المؤسسة تمنعها يجب توفير آلية قراءة مخولة بأقل صلاحية قبل التشغيل.

بعد توفير رابط المستودع والرفع، مثال التشغيل من GitHub CLI:

```bash
gh workflow run mostaofi-v11-evidence.yml --repo OWNER/REPO --ref REVIEWED_BRANCH -f rc_sha=FULL_SHA
gh run list --repo OWNER/REPO --workflow mostaofi-v11-evidence.yml
gh run watch RUN_ID --repo OWNER/REPO --exit-status
gh run download RUN_ID --repo OWNER/REPO --name v11-evidence-RUN_ID-ATTEMPT
gh attestation verify evidence.tar --repo OWNER/REPO --signer-workflow OWNER/REPO/.github/workflows/mostaofi-v11-evidence.yml --source-digest FULL_SHA
sha256sum --check SHA256SUMS
```

لا تُنفذ أمثلة OWNER/REPO حرفيًا؛ تُستبدل بالقيم الموثقة. احفظ هوية المراجع وتوقيت الموافقة وRun ID وattempt ورابطه في سجل إصدار منفصل بعد حدوث الموافقة الفعلية.

المراجع الرسمية:
- https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- https://cli.github.com/manual/gh_attestation_verify