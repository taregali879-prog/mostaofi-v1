import { createHmac, timingSafeEqual } from 'crypto';

export interface JwtClaims {
  sub: string;
  org: string;
  roles: string[];
  email: string;
  typ: 'access' | 'refresh';
  jti: string;
  iat: number;
  exp: number;
}

const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const sig = (input: string, secret: string) => createHmac('sha256', secret).update(input).digest('base64url');

export function signJwt(payload: Omit<JwtClaims, 'iat'|'exp'>, secret: string, ttlSeconds: number): string {
  const now = Math.floor(Date.now()/1000);
  const header = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc({ ...payload, iat: now, exp: now + ttlSeconds });
  return `${header}.${body}.${sig(`${header}.${body}`, secret)}`;
}

export function verifyJwt(token: string, secret: string, expectedType: JwtClaims['typ']): JwtClaims {
  const [h,b,s] = token.split('.');
  if (!h || !b || !s) throw new Error('INVALID_TOKEN');
  const expected = sig(`${h}.${b}`, secret);
  const a = Buffer.from(s); const e = Buffer.from(expected);
  if (a.length !== e.length || !timingSafeEqual(a,e)) throw new Error('INVALID_SIGNATURE');
  const claims = JSON.parse(Buffer.from(b,'base64url').toString('utf8')) as JwtClaims;
  if (claims.typ !== expectedType || claims.exp <= Math.floor(Date.now()/1000)) throw new Error('TOKEN_EXPIRED_OR_WRONG_TYPE');
  return claims;
}
