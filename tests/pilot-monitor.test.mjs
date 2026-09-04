import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSamples } from '../scripts/pilot-monitor-core.mjs';

test('pilot monitor fails when availability is below threshold',()=>{
  const r=evaluateSamples([{ok:true,ms:100},{ok:false,ms:900}],{maxP95Ms:800,minAvailability:1});
  assert.equal(r.pass,false);
  assert.equal(r.availability,0.5);
});

test('pilot monitor passes healthy samples',()=>{
  const r=evaluateSamples([{ok:true,ms:100},{ok:true,ms:120},{ok:true,ms:110}],{maxP95Ms:800,minAvailability:1});
  assert.equal(r.pass,true);
  assert.equal(r.p95,120);
});
