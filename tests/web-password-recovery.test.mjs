import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const {consumeRecoveryToken, requestRecovery, resetRecoveryPassword, recoveryAvailable} = await import(pathToFileURL(path.resolve('apps/web/lib/recovery.ts')).href);
const originalFetch = global.fetch;
const json = (payload, status=200) => new Response(JSON.stringify(payload), {status, headers:{'content-type':'application/json'}});
afterEach(() => { global.fetch = originalFetch; });

test('a reset secret is consumed once and removed from browser history without moving it into a query', () => {
  const token = 't'.repeat(43);
  const location = {hash:'#reset='+token, pathname:'/', search:'?lang=ar'};
  const history = {replaceState(_state, _title, next) { assert.equal(next, '/?lang=ar'); location.hash=''; }};
  assert.equal(consumeRecoveryToken(location, history), token);
  assert.equal(consumeRecoveryToken(location, history), null);
});

test('malformed reset secrets are scrubbed and unrelated anchors are preserved', () => {
  let count=0;
  const history={replaceState(){count++;}};
  assert.equal(consumeRecoveryToken({hash:'#reset=bad%0Atoken',pathname:'/login',search:''}, history),null);
  assert.equal(count,1);
  assert.equal(consumeRecoveryToken({hash:'#projects',pathname:'/',search:''},history),null);
  assert.equal(count,1);
});

test('recovery calls use anonymous no-store requests and keep tokens and passwords out of URLs', async () => {
  const calls=[];
  global.fetch=async(url,options)=>{calls.push({url,options});return json(url.endsWith('forgot-password')?{accepted:true}:{reset:true});};
  await requestRecovery(' owner@mostaofi.sa ');
  await resetRecoveryPassword('t'.repeat(43),'a-secure-password','a-secure-password');
  assert.equal(calls[0].url.endsWith('/auth/forgot-password'),true);
  assert.deepEqual(JSON.parse(calls[0].options.body),{email:'owner@mostaofi.sa'});
  assert.equal(calls[1].url.endsWith('/auth/reset-password'),true);
  for(const {url,options} of calls){
    assert.equal(options.credentials,'omit'); assert.equal(options.cache,'no-store');
    assert.equal(new Headers(options.headers).has('authorization'),false);
    assert.equal(url.includes('t'.repeat(43)),false); assert.equal(url.includes('a-secure-password'),false);
  }
});

test('configuration availability is observed rather than inferred from a successful HTTP status', async () => {
  global.fetch=async()=>json({available:false});assert.equal(await recoveryAvailable(),false);
  global.fetch=async()=>json({available:true});assert.equal(await recoveryAvailable(),true);
  global.fetch=async()=>json({});await assert.rejects(recoveryAvailable(),/تعذر التحقق/);
});

test('a non-acceptance payload cannot be displayed as a successful reset or recovery request', async () => {
  global.fetch=async()=>json({});
  await assert.rejects(requestRecovery('owner@mostaofi.sa'),/تعذر إكمال/);
  await assert.rejects(resetRecoveryPassword('t'.repeat(43),'long-password','long-password'),/تعذر إكمال/);
});

test('expired and throttled requests have useful messages while arbitrary server details stay hidden', async () => {
  global.fetch=async()=>json({message:'INVALID_RECOVERY_TOKEN'},400);
  await assert.rejects(resetRecoveryPassword('t'.repeat(43),'long-password','long-password'),/انتهت صلاحيته/);
  global.fetch=async()=>json({message:'RECOVERY_TRY_LATER'},429);
  await assert.rejects(requestRecovery('owner@mostaofi.sa'),/15 دقيقة/);
  global.fetch=async()=>json({message:'SMTP password = internal-test-only'},503);
  await assert.rejects(requestRecovery('owner@mostaofi.sa'),e=>!e.message.includes('SMTP')&&e.message.includes('تعذر'));
});
