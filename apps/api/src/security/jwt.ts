import { createHmac, timingSafeEqual } from 'crypto';

export interface JwtClaims {
  sub: string;
  org: string;
  roles: string[];
  email: string;
  typ: 'access' | 'refresh';
  jti: string;
  ver?: number;
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
  if (typeof token !== 'string' || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error('INVALID_TOKEN');
  }
  const [h,b,s] = token.split('.');
  const expected = sig(`${h}.${b}`, secret);
  const a = Buffer.from(s); const e = Buffer.from(expected);
  if (a.length !== e.length || !timingSafeEqual(a,e)) throw new Error('INVALID_SIGNATURE');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  if (header?.alg !== 'HS256' || header?.typ !== 'JWT') throw new Error('INVALID_TOKEN_HEADER');
  const claims = JSON.parse(Buffer.from(b,'base64url').toString('utf8')) as JwtClaims;
  const now = Math.floor(Date.now() / 1000);
  if (!claims || typeof claims !== 'object' ||
      !['sub', 'org', 'email', 'jti'].every(key => typeof claims[key as keyof JwtClaims] === 'string' && String(claims[key as keyof JwtClaims]).trim().length > 0) ||
      !Array.isArray(claims.roles) || !claims.roles.every(role => typeof role === 'string' && role.length > 0) ||
      !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
      claims.iat < 0 || claims.iat > now + 60 || claims.exp <= claims.iat ||
      (claims.ver !== undefined && (!Number.isSafeInteger(claims.ver) || claims.ver < 0))) {
    throw new Error('INVALID_TOKEN_CLAIMS');
  }
  if (claims.typ !== expectedType || claims.exp <= now) throw new Error('TOKEN_EXPIRED_OR_WRONG_TYPE');
  return claims;
}
