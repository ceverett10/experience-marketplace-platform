import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted moves these above vi.mock hoisting
const { mockCookieStore } = vi.hoisted(() => ({
  mockCookieStore: { get: vi.fn() },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}));

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminUser: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  decryptSession: vi.fn(),
  SESSION_COOKIE_NAME: 'admin_session',
}));

import { getSession, requireSuperAdmin } from './require-role';
import { prisma } from '@/lib/prisma';
import { decryptSession } from '@/lib/auth';

describe('getSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no session cookie exists', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
  });

  it('returns null when token decryption fails', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'invalid-token' });
    vi.mocked(decryptSession).mockReturnValue(null);
    expect(await getSession()).toBeNull();
  });

  it('returns session when valid and no invalidation', async () => {
    const session = {
      userId: 'u1',
      email: 'a@b.com',
      name: 'Test',
      role: 'ADMIN',
      iat: Date.now(),
      exp: Date.now() + 86400000,
    };
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    vi.mocked(decryptSession).mockReturnValue(session);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked((prisma as any).adminUser.findUnique).mockResolvedValue({
      sessionInvalidatedAt: null,
    });

    const result = await getSession();
    expect(result).toEqual(session);
  });

  it('returns null when session was invalidated (issued before logout)', async () => {
    const issuedAt = Date.now() - 60000; // 1 min ago
    const invalidatedAt = Date.now() - 30000; // 30 sec ago (after issue)
    const session = {
      userId: 'u1',
      email: 'a@b.com',
      name: 'Test',
      role: 'ADMIN',
      iat: issuedAt,
      exp: Date.now() + 86400000,
    };

    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    vi.mocked(decryptSession).mockReturnValue(session);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked((prisma as any).adminUser.findUnique).mockResolvedValue({
      sessionInvalidatedAt: new Date(invalidatedAt),
    });

    expect(await getSession()).toBeNull();
  });

  it('returns session when issued after invalidation (re-login)', async () => {
    const invalidatedAt = Date.now() - 60000; // 1 min ago
    const issuedAt = Date.now() - 30000; // 30 sec ago (after invalidation)
    const session = {
      userId: 'u1',
      email: 'a@b.com',
      name: 'Test',
      role: 'ADMIN',
      iat: issuedAt,
      exp: Date.now() + 86400000,
    };

    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    vi.mocked(decryptSession).mockReturnValue(session);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked((prisma as any).adminUser.findUnique).mockResolvedValue({
      sessionInvalidatedAt: new Date(invalidatedAt),
    });

    const result = await getSession();
    expect(result).toEqual(session);
  });

  it('returns null (fail-closed) when DB is unreachable', async () => {
    const session = {
      userId: 'u1',
      email: 'a@b.com',
      name: 'Test',
      role: 'ADMIN',
      iat: Date.now(),
      exp: Date.now() + 86400000,
    };
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    vi.mocked(decryptSession).mockReturnValue(session);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked((prisma as any).adminUser.findUnique).mockRejectedValue(new Error('DB down'));

    expect(await getSession()).toBeNull();
  });

  it('skips invalidation check when session has no iat', async () => {
    const session = {
      userId: 'u1',
      email: 'a@b.com',
      name: 'Test',
      role: 'ADMIN',
      iat: 0,
      exp: Date.now() + 86400000,
    };
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    vi.mocked(decryptSession).mockReturnValue(session);

    const result = await getSession();
    expect(result).toEqual(session);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma as any).adminUser.findUnique).not.toHaveBeenCalled();
  });
});

describe('requireSuperAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns session for SUPER_ADMIN user', async () => {
    const session = {
      userId: 'u1',
      email: 'a@b.com',
      name: 'Test',
      role: 'SUPER_ADMIN',
      iat: Date.now(),
      exp: Date.now() + 86400000,
    };
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    vi.mocked(decryptSession).mockReturnValue(session);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked((prisma as any).adminUser.findUnique).mockResolvedValue({
      sessionInvalidatedAt: null,
    });

    const result = await requireSuperAdmin();
    expect('session' in result).toBe(true);
    if ('session' in result) {
      expect(result.session.role).toBe('SUPER_ADMIN');
    }
  });

  it('returns 401 error when not authenticated', async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const result = await requireSuperAdmin();
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(401);
    }
  });

  it('returns 403 error for non-SUPER_ADMIN role', async () => {
    const session = {
      userId: 'u1',
      email: 'a@b.com',
      name: 'Test',
      role: 'ADMIN',
      iat: Date.now(),
      exp: Date.now() + 86400000,
    };
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    vi.mocked(decryptSession).mockReturnValue(session);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked((prisma as any).adminUser.findUnique).mockResolvedValue({
      sessionInvalidatedAt: null,
    });

    const result = await requireSuperAdmin();
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(403);
    }
  });
});
