import { randomUUID } from 'crypto';
import { AuthService } from '../src/auth/auth.service';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/database/prisma.service';
import { hashPassword } from '../src/security/password';
import { verifyJwt } from '../src/security/jwt';

describe('Refresh-session security with a PostgreSQL-compatible connection', () => {
  const db = new PrismaService();
  const auth = new AuthService(db, new AuditService(db));
  const password = 'Long-session-test-password';
  const users: string[] = [];
  beforeAll(() => db.$connect());
  afterAll(async () => {
    await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.$disconnect();
  });
  async function session() {
    const userId = randomUUID(), org = randomUUID(), email = userId + '@test.invalid';
    users.push(userId);
    await db.organization.create({ data: { id: org, name: 'Session regression' } });
    await db.user.create({ data: { id: userId, email, displayName: 'Session regression',
      passwordHash: hashPassword(password), memberships: { create: {
        id: randomUUID(), organizationId: org, roles: ['ORG_ADMIN'],
      } } } });
    const tokens = await auth.login(email, password);
    return { ...tokens, userId, org };
  }
  it('allows exactly one winner when two requests rotate the same refresh token', async () => {
    const s = await session();
    const results = await Promise.allSettled([auth.refresh(s.refreshToken), auth.refresh(s.refreshToken)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(await db.authSession.count({ where: { userId: s.userId, revokedAt: null } })).toBe(1);
  });
  it('uses current membership roles rather than roles copied from the refresh token', async () => {
    const s = await session();
    await db.membership.update({ where: { userId_organizationId: { userId: s.userId, organizationId: s.org } }, data: { roles: ['VIEWER'] } });
    const next = await auth.refresh(s.refreshToken);
    expect(verifyJwt(next.accessToken, process.env.JWT_ACCESS_SECRET ?? 'dev-only-change-me', 'access').roles).toEqual(['VIEWER']);
  });
  it('rejects refresh after the tenant membership is removed', async () => {
    const s = await session();
    await db.membership.delete({ where: { userId_organizationId: { userId: s.userId, organizationId: s.org } } });
    await expect(auth.refresh(s.refreshToken)).rejects.toThrow('REFRESH_REVOKED');
  });
  it('enforces expiry stored in the session record', async () => {
    const s = await session();
    const claims = verifyJwt(s.refreshToken, process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-change-me', 'refresh');
    await db.authSession.update({ where: { id: claims.jti }, data: { expiresAt: new Date(0) } });
    await expect(auth.refresh(s.refreshToken)).rejects.toThrow('REFRESH_REVOKED');
  });
});
