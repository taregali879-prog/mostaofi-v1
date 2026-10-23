import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyRecoveryMail } from '../scripts/verify-recovery-mail.mjs';
const env = Object.fromEntries(['MOSTAOFI_RECOVERY_ORIGIN','MOSTAOFI_MAIL_FROM','MOSTAOFI_SMTP_HOST','MOSTAOFI_SMTP_USER','MOSTAOFI_SMTP_PASSWORD','JWT_REFRESH_SECRET'].map(name=>[name,'test-only']));

test('missing SMTP configuration blocks before loading a transport and reports variable names only', async () => {
  const result = await verifyRecoveryMail({env:{},loadConfig(){throw Error('must not load');}});
  assert.equal(result.status,'BLOCKED'); assert.equal(result.deliveryTest,'NOT_PERFORMED');
  assert.ok(result.missingVariables.includes('MOSTAOFI_SMTP_PASSWORD'));
});
test('SMTP verification closes its transport without sending mail or claiming delivery', async () => {
  let closed=false;
  const result=await verifyRecoveryMail({env,loadConfig:()=>({options:{requireTLS:true}}),createTransport:options=>{
    assert.equal(options.requireTLS,true); return {verify:async()=>true,close(){closed=true;}};
  }});
  assert.equal(result.status,'SMTP_VERIFIED'); assert.equal(result.deliveryTest,'NOT_PERFORMED'); assert.equal(closed,true);
});
test('provider failures never echo credentials, server replies or recipient data', async () => {
  const result=await verifyRecoveryMail({env,loadConfig:()=>({options:{}}),createTransport:()=>({verify:async()=>{throw Object.assign(Error('secret from provider'),{code:'EAUTH'});},close(){}})});
  assert.deepEqual(result,{status:'BLOCKED',reason:'EAUTH',deliveryTest:'NOT_PERFORMED'});
});
