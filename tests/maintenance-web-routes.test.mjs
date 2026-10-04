import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const routes=['apps/web/app/work-orders/page.tsx','apps/web/app/work-orders/[id]/page.tsx','apps/web/app/findings/page.tsx','apps/web/app/findings/[id]/page.tsx'];

test('maintenance preview web routes and shared API helper exist',()=>{
 for(const file of routes) assert.equal(fs.existsSync(path.join(root,file)),true,`missing ${file}`);
 assert.equal(fs.existsSync(path.join(root,'apps/web/lib/api.ts')),true,'missing shared API helper');
});

test('maintenance routes use shared API helper and no legacy host',()=>{
 const combined=[...routes.map(read),read('apps/web/lib/api.ts')].join('\n');
 for(const file of routes) assert.match(read(file),/apiFetch/);
 assert.doesNotMatch(combined,/mostaofi-v1-production\.up\.railway\.app/);
 assert.match(read('apps/web/lib/api.ts'),/NEXT_PUBLIC_API_URL/);
 assert.match(read('apps/web/lib/api.ts'),/muqawil_access_token/);
});
test('work orders and findings expose governed navigation and API paths',()=>{
 const workList=read(routes[0]),workDetail=read(routes[1]),findingList=read(routes[2]),findingDetail=read(routes[3]);
 assert.match(workList,/maintenance\/work-orders/);assert.match(workDetail,/maintenance\/work-orders/);
 assert.match(workDetail,/maintenance\/inspections/);assert.match(findingList,/maintenance\/findings/);assert.match(findingDetail,/maintenance\/findings/);
 assert.match(workList,/\/work-orders\//);assert.match(workDetail,/\/findings\//);assert.match(findingList,/\/findings\//);assert.match(findingDetail,/\/work-orders\//);
 const nav=read('apps/web/app/layout.tsx');assert.match(nav,/href="\/work-orders"/);assert.match(nav,/href="\/findings"/);
});

test('shared API helper throws typed errors and never targets legacy production',()=>{
 const helper=read('apps/web/lib/api.ts');
 assert.match(helper,/class ApiError extends Error/);assert.match(helper,/status:\s*number/);assert.match(helper,/throw new ApiError/);
 assert.doesNotMatch(helper,/mostaofi-v1-production/);
});
