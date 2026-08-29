# Vertical Slice 01

## النطاق
Login → Contractor Profile → Project → Dashboard → Documents → Audit Trail.

## Acceptance Gate
1. Login صحيح يعيد هوية وصلاحيات المستخدم، والخطأ يرفض الطلب.
2. Contractor Profile يمكن قراءته وتحديثه وإرساله للمراجعة.
3. Project يتم إنشاؤه وربطه بالمنظمة، ولا يقرأ عبر منظمة أخرى.
4. Dashboard يعرض Overview/Documents/Activity، بينما BOQ وProcurement مؤجلان.
5. Document يدعم metadata وإصدارات متعددة وSHA-256 وStorage Key.
6. Audit يسجل إنشاء/تعديل المشروع وعمليات المستندات ولا يوفر Update/Delete.

## ما هو Prototype وما هو Production Gap
- AuthService الحالي يحتوي credentials تطويرية ثابتة لإثبات الـSlice فقط؛ يجب استبداله بمزود هوية/JWT حقيقي قبل Staging.
- Services الحالية تستخدم in-memory storage في Adapter الأولي؛ Schema/Migration PostgreSQL مرفقة، ويجب توصيل Repository layer بقاعدة البيانات في المهمة التالية.
- Document module يولد storageKey وhash ولكنه لا يرفع bytes إلى S3 بعد؛ Signed URL adapter هو المهمة التالية.
