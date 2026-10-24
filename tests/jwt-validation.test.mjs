import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signJwt, verifyJwt } from '../apps/api/src/security/jwt.ts';

const secret = 'jwt-regression-secret-with-at-least-32-characters';
const now = Math.floor(Date.now() / 1000);
const claims = { sub: 'user-1', org: 'org-1', roles: ['VIEWER'], email: 'user@test.invalid',
  typ: 'access', jti: 'session-1', ver: 0, iat: now, exp: now + 900 };
function signed(payload, header = { alg: 'HS256', typ: 'JWT' }) {
  const input = [header, payload].map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  return input + '.' + createHmac('sha256', secret).update(input).digest('base64url');
}

test('accepts valid issued access and refresh tokens', () => {
  assert.equal(verifyJwt(signJwt({ ...claims, typ: 'access' }, secret, 900), secret, 'access').sub, 'user-1');
  assert.equal(verifyJwt(signJwt({ ...claims, typ: 'refresh' }, secret, 900), secret, 'refresh').typ, 'refresh');
});
for (const [name, payload, header] of [
  ['missing expiry', { ...claims, exp: undefined }],
  ['non-numeric expiry', { ...claims, exp: 'tomorrow' }],
  ['fractional expiry', { ...claims, exp: now + 900.5 }],
  ['expiry before issue', { ...claims, iat: now + 10, exp: now + 5 }],
  ['future issue date', { ...claims, iat: now + 3600, exp: now + 4500 }],
  ['invalid roles', { ...claims, roles: 'ORG_ADMIN' }],
  ['empty tenant', { ...claims, org: '' }],
  ['negative credential version', { ...claims, ver: -1 }],
  ['unexpected algorithm', claims, { alg: 'none', typ: 'JWT' }],
]) {
  test('rejects signed JWT with ' + name, () => {
    assert.throws(() => verifyJwt(signed(payload, header), secret, 'access'));
  });
}
test('rejects extra JWT segments instead of ignoring them', () => {
  assert.throws(() => verifyJwt(signed(claims) + '.ignored', secret, 'access'));
});
test('rejects expired, tampered and wrong-type tokens', () => {
  assert.throws(() => verifyJwt(signed({ ...claims, exp: now - 1 }), secret, 'access'));
  assert.throws(() => verifyJwt(signed(claims), secret + '-wrong', 'access'));
  assert.throws(() => verifyJwt(signed(claims), secret, 'refresh'));
});
