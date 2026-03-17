import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted moves these above vi.mock hoisting
const { mockCookieStore, mockUpdate } = vi.hoisted(() => ({
  mockCookieStore: { get: vi.fn() },
  mockUpdate: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminUser: {
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  decryptSession: vi.fn(),
  SESSION_COOKIE_NAME: 'admin_session',
}));

// Mock audit
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

import { POST } from './route';
import { decryptSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

function makeRequest() {
  return new Request('http://localhost/api/auth/logout', { method: 'POST' });
}

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears session cookie even without token', async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('invalidates session server-side on logout', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    vi.mocked(decryptSession).mockReturnValue({
      userId: 'u1',
      email: 'admin@test.com',
      name: 'Admin',
      role: 'ADMIN',
      iat: Date.now(),
      exp: Date.now() + 86400000,
    });
    mockUpdate.mockResolvedValue({});

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          sessionInvalidatedAt: expect.any(Date),
        }),
      })
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGOUT', userId: 'u1' })
    );
  });

  it('succeeds even if DB update fails (best-effort)', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    vi.mocked(decryptSession).mockReturnValue({
      userId: 'u1',
      email: 'admin@test.com',
      name: 'Admin',
      role: 'ADMIN',
      iat: Date.now(),
      exp: Date.now() + 86400000,
    });
    mockUpdate.mockRejectedValue(new Error('DB down'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('skips invalidation when token is invalid', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'bad-token' });
    vi.mocked(decryptSession).mockReturnValue(null);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
