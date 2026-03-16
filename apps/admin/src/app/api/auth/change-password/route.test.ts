import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted moves these above vi.mock hoisting
const { mockCookieStore, mockFindUnique, mockUpdate } = vi.hoisted(() => ({
  mockCookieStore: { get: vi.fn() },
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminUser: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  decryptSession: vi.fn(),
  encryptSession: vi.fn().mockReturnValue('new-encrypted-token'),
  createSessionPayload: vi.fn().mockReturnValue({
    userId: 'u1',
    email: 'admin@test.com',
    name: 'Admin',
    role: 'ADMIN',
    iat: Date.now(),
    exp: Date.now() + 86400000,
  }),
  SESSION_COOKIE_NAME: 'admin_session',
  SESSION_TTL_MS: 86400000,
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue('$2a$12$newhash'),
  },
}));

// Mock audit
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

import { POST } from './route';
import { decryptSession } from '@/lib/auth';
import bcrypt from 'bcryptjs';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validSession = {
  userId: 'u1',
  email: 'admin@test.com',
  name: 'Admin',
  role: 'ADMIN',
  iat: Date.now(),
  exp: Date.now() + 86400000,
};

describe('POST /api/auth/change-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    vi.mocked(decryptSession).mockReturnValue(validSession);
  });

  it('returns 401 when no session cookie', async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const res = await POST(makeRequest({ currentPassword: 'old', newPassword: 'NewStr0ng!Pass' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session is invalid', async () => {
    vi.mocked(decryptSession).mockReturnValue(null);

    const res = await POST(makeRequest({ currentPassword: 'old', newPassword: 'NewStr0ng!Pass' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when currentPassword is missing', async () => {
    const res = await POST(makeRequest({ newPassword: 'NewStr0ng!Pass' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when newPassword is missing', async () => {
    const res = await POST(makeRequest({ currentPassword: 'old' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when new password is too weak', async () => {
    const res = await POST(makeRequest({ currentPassword: 'old', newPassword: 'weak' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Password requirements');
  });

  it('returns 404 when user not found in DB', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ currentPassword: 'old', newPassword: 'NewStr0ng!Pass' }));
    expect(res.status).toBe(404);
  });

  it('returns 401 when current password is wrong', async () => {
    mockFindUnique.mockResolvedValue({ id: 'u1', passwordHash: '$2a$12$hash' });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const res = await POST(
      makeRequest({ currentPassword: 'wrong', newPassword: 'NewStr0ng!Pass' })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('incorrect');
  });

  it('changes password and returns success', async () => {
    mockFindUnique.mockResolvedValue({ id: 'u1', passwordHash: '$2a$12$hash' });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    mockUpdate.mockResolvedValue({});

    const res = await POST(makeRequest({ currentPassword: 'old', newPassword: 'NewStr0ng!Pass' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mustChangePassword: false,
        }),
      })
    );
  });
});
