import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
export function hashPassword(password: string): string {
  const salt = randomBytes(16); const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(password: string, encoded: string): boolean {
  const [alg,saltHex,hashHex] = encoded.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const actual = scryptSync(password, Buffer.from(saltHex,'hex'), 64);
  const expected = Buffer.from(hashHex,'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
