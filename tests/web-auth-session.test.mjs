import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const api = await import(pathToFileURL(path.resolve('apps/web/lib/api.ts')).href);
let db;
const json = (obj, status=200) => new Response(JSON.stringify(obj), {status, headers:{'content-type':'application/json'}});
function setup(fetcher, access='expired-access', refresh='active-refresh') {
  db=new Map([['muqawil_access_token', access],['muqawil_refresh_token', refresh]]);
  global.window={};
  global.localStorage={getItem:k=>db.get(k)??null,setItem:(k,v)=>db.set(k,v),removeItem:k=>db.delete(k)};
  global.fetch=fetcher;
}
afterEach(()=>{delete global.window;delete global.localStorage;delete global.fetch;});

test('expired access token renews once, stores rotated refresh, and retries authorized request',async()=>{
  const events=[];
  setup(async(url,opts)=>{
    events.push({url,auth:opts.headers.get?.('authorization'),payload:opts.body});
    if(url.endsWith('/auth/refresh'))return json({accessToken:'fresh-access',refreshToken:'new-refresh'});
    if(events.length===1)return json({message:'Expired'},401);
    return json({rows:[42]});
  });
  assert.deepEqual(await api.apiFetch('/projects'),{rows:[42]});
  assert.equal(events.length,3);
  assert.equal(events[0].auth,'Bearer expired-access');
  assert.equal(events[2].auth,'Bearer fresh-access');
  assert.equal(db.get('muqawil_refresh_token'),'new-refresh');
});

test('failed renewal clears both old tokens and rejects with SESSION_EXPIRED',async()=>{
  setup(async url=>url.endsWith('/auth/refresh')?json({message:'revoked'},401):json({message:'expired'},401));
  await assert.rejects(api.apiFetch('/projects'),err=>err.status===401 && err.message==='SESSION_EXPIRED');
  assert.equal(db.has('muqawil_access_token'),false);
  assert.equal(db.has('muqawil_refresh_token'),false);
});

test('concurrent expired requests share one refresh call',async()=>{
  let renewals=0;
  setup(async(url,opts)=>{
    if(url.endsWith('/auth/refresh')){renewals++;await new Promise(resolve=>setTimeout(resolve,10));return json({accessToken:'fresh-access',refreshToken:'new-refresh'});}
    return opts.headers.get('authorization')==='Bearer fresh-access'?json({ok:true}):json({message:'expired'},401);
  });
  const result=await Promise.all([api.apiFetch('/projects'),api.apiFetch('/projects')]);
  assert.deepEqual(result,[{ok:true},{ok:true}]);
  assert.equal(renewals,1);
});

test('403 errors do not trigger token refresh',async()=>{
  let renewals=0;
  setup(async(url)=>{if(url.endsWith('/auth/refresh'))renewals++;return json({message:'forbidden'},403)});
  await assert.rejects(api.apiFetch('/projects'),err=>err.status===403);
  assert.equal(renewals,0);
});

test('a newer login is not erased by a delayed, rejected refresh from an old session',async()=>{
  let unblock;
  let started;
  const blocked=new Promise(resolve=>{unblock=resolve});
  const refreshStarted=new Promise(resolve=>{started=resolve});
  setup(async(url)=>{
    if(url.endsWith('/auth/refresh')){
      started();
      await blocked;
      return json({accessToken:'old-refresh-access',refreshToken:'old-rotated-refresh'});
    }
    return json({message:'expired'},401);
  });
  const pending=api.apiFetch('/projects');
  await refreshStarted;
  db.set('muqawil_access_token','brand-new-login');
  db.set('muqawil_refresh_token','brand-new-refresh');
  unblock();
  await assert.rejects(pending,err=>err.status===401);
  assert.equal(db.get('muqawil_access_token'),'brand-new-login');
  assert.equal(db.get('muqawil_refresh_token'),'brand-new-refresh');
});

test('login form does not prefill demo email or password in a public deployment',async()=>{
  const { readFileSync }=await import('node:fs');
  const src=readFileSync('apps/web/app/login/page.tsx','utf8');
  assert.doesNotMatch(src,/defaultValue=(?:"admin@partner\.local"|"ChangeMe123!")/);
});
