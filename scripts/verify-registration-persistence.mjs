import {createHash} from 'node:crypto';
const {createInterface}=await import('node:readline');const rl=createInterface({input:process.stdin});const raw=await new Promise(resolve=>rl.once('line',resolve));rl.close();const secrets=JSON.parse(raw);
const base='https://mostaofi-p0-preview-production.up.railway.app/api/v1';
const evidence={at:new Date().toISOString(),checks:[]};
async function call(path,method='GET',body,token,expected=200,extra={}){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});const data=await r.json();if(!(Array.isArray(expected)?expected:[expected]).includes(r.status))throw Error(`${method} ${path}: ${r.status}, expected ${expected}; ${data.message}`);return data;}
const users=[{email:'release-check-20261009@mostaofi.sa',password:secrets.password},{email:'release-isolation-20261009@mostaofi.sa',password:secrets.password2}];
await call('/auth/register','POST',{...users[0],displayName:'Release Check',organizationName:'Release Verification 20261009'},null,401);evidence.checks.push('registration without server authorization rejected');
for(const [i,u]of users.entries()){await call('/auth/register','POST',{...u,displayName:'Release Check '+i,organizationName:'Release Verification 20261009 '+i},null,[201,409],{'x-registration-key':secrets.key});}
evidence.checks.push('two users and separate organizations created');
await call('/auth/register','POST',{...users[0],displayName:'Release Check',organizationName:'Release Verification 20261009'},null,409,{'x-registration-key':secrets.key});evidence.checks.push('duplicate registration rejected');
const a=await call('/auth/login','POST',users[0],null,201),b=await call('/auth/login','POST',users[1],null,201);
if(a.user.organizationId===b.user.organizationId)throw Error('organization isolation failed');
const existing=await call('/projects','GET',undefined,a.accessToken);
const p=existing.find(p=>p.name==='اختبار الحفظ الفعلي — 2026-10-09')||await call('/projects','POST',{name:'اختبار الحفظ الفعلي — 2026-10-09',clientName:'حساب تحقق تقني',city:'أبوعريش',scope:'سجل تحقق تقني وليس مشروعًا تجاريًا'},a.accessToken,201);
const fresh=await call('/auth/login','POST',users[0],null,201);const saved=await call('/projects/'+p.id,'GET',undefined,fresh.accessToken);if(saved.name!==p.name)throw Error('project reread mismatch');evidence.checks.push('project saved and reread from independent login session');
await call('/projects/'+p.id,'GET',undefined,b.accessToken,404);const other=await call('/projects','GET',undefined,b.accessToken);if(other.some(x=>x.id===p.id))throw Error('cross-tenant project leak');evidence.checks.push('other organization cannot read or list project');
const bytes=new TextEncoder().encode('Mostaofi actual persistence verification 2026-10-09\n');const sha256=createHash('sha256').update(bytes).digest('hex');
const intent=await call('/projects/'+p.id+'/documents/upload-intent','POST',{fileName:'persistence-check.txt',mimeType:'text/plain',sizeBytes:bytes.length,type:'OTHER',title:'مستند اختبار الحفظ'},fresh.accessToken,201);
const put=await fetch(intent.uploadUrl||intent.url,{method:'PUT',headers:{'content-type':'text/plain'},body:bytes});if(!put.ok)throw Error('object upload failed '+put.status);
await call('/documents/'+intent.documentId+'/complete','POST',{version:1,sha256},fresh.accessToken,201);const doc=await call('/documents/'+intent.documentId,'GET',undefined,fresh.accessToken);if(doc.status!=='UPLOADED'||doc.versions[0].sha256!==sha256)throw Error('document metadata mismatch');await call('/documents/'+intent.documentId,'GET',undefined,b.accessToken,404);evidence.checks.push('real object uploaded and document hash reread; cross-tenant document blocked');
evidence.projectId=p.id;evidence.documentId=intent.documentId;evidence.release=await call('/health/release');
console.log(JSON.stringify(evidence,null,2));
