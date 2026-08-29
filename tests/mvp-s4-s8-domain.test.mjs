import test from 'node:test';import assert from 'node:assert/strict';
const requirement=(boq)=>{if(boq.status!=='APPROVED')throw Error('BOQ_NOT_APPROVED');return {required:boq.qty}};
const inspect=(arrived,accepted,rejected,damaged=0)=>{if(accepted+rejected+damaged>arrived)throw Error('INVALID_INSPECTION_TOTAL');return {arrived,accepted,rejected,damaged}};
const kpi=({required,ordered,arrived,accepted,rejected,unitCost,budgetUnitPrice,allocated})=>({required,ordered,arrived,accepted,rejected,remainingReceive:ordered-accepted,remainingNeed:required-accepted,allocated,budget:required*budgetUnitPrice,committed:ordered*unitCost,actual:accepted*unitCost,weightedAveragePurchaseCost:unitCost});
test('S4 blocks procurement before BOQ approval',()=>assert.throws(()=>requirement({status:'DRAFT',qty:10}),/BOQ_NOT_APPROVED/));
test('S6 blocks over-inspection',()=>assert.throws(()=>inspect(8,7,2),/INVALID_INSPECTION_TOTAL/));
test('S8 KPI agrees with accepted inventory truth',()=>{const r=requirement({status:'APPROVED',qty:10});const d=inspect(8,7,1);assert.deepEqual(kpi({...r,ordered:10,...d,unitCost:20,budgetUnitPrice:25,allocated:5}),{required:10,ordered:10,arrived:8,accepted:7,rejected:1,remainingReceive:3,remainingNeed:3,allocated:5,budget:250,committed:200,actual:140,weightedAveragePurchaseCost:20})});
