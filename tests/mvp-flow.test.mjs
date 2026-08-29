import test from 'node:test';
import assert from 'node:assert/strict';
const start=b=>{if(b.status!=='APPROVED')throw Error('BOQ_NOT_APPROVED');return {required:b.qty,ordered:0,accepted:0,rejected:0}};
const po=(s,q)=>({...s,ordered:s.ordered+q});
const receive=(s,a,ok,bad)=>{if(ok+bad>a)throw Error('INVALID_INSPECTION_TOTAL');return {...s,arrived:a,accepted:s.accepted+ok,rejected:s.rejected+bad}};
test('unapproved BOQ is blocked',()=>assert.throws(()=>start({status:'DRAFT',qty:10}),/BOQ_NOT_APPROVED/));
test('accepted quantity drives project material truth',()=>{let s=start({status:'APPROVED',qty:10});s=po(s,10);s=receive(s,8,7,1);assert.deepEqual({required:s.required,ordered:s.ordered,arrived:s.arrived,accepted:s.accepted,rejected:s.rejected,remainingReceive:s.ordered-s.accepted,remainingNeed:s.required-s.accepted},{required:10,ordered:10,arrived:8,accepted:7,rejected:1,remainingReceive:3,remainingNeed:3})});
