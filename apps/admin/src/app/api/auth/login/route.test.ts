import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted moves these above vi.mock hoisting
const { mockFindUnique, mockUpdate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminUser: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
  },
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  encryptSession: vi.fn().mockReturnValue('encrypted-token'),
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

// Mock rate-limit
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue(0),
  recordFailedAttempt: vi.fn(),
  clearRateLimit: vi.fn(),
}));

// Mock audit
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

import { POST } from './route';
import bcrypt from 'bcryptjs';
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login', () => {
  const mockUser = {
    id: 'u1',
    email: 'admin@test.com',
    name: 'Admin',
    role: 'ADMIN',
    passwordHash: '$2a$12$hash',
    mustChangePassword: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue(0);
  });

  it('returns 400 when email is missing', async () => {
    const res = await POST(makeRequest({ password: 'pass' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('required');
  });

  it('returns 400 when password is missing', async () => {
    const res = await POST(makeRequest({ email: 'test@test.com' }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValue(600);

    const res = await POST(makeRequest({ email: 'admin@test.com', password: 'pass' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('600');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_RATE_LIMITED' })
    );
  });

  it('returns 401 for unknown email', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ email: 'unknown@test.com', password: 'pass' }));
    expect(res.status).toBe(401);
    expect(recordFailedAttempt).toHaveBeenCalledWith('unknown@test.com');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN_FAILED' }));
  });

  it('returns 401 for wrong password', async () => {
    mockFindUnique.mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const res = await POST(makeRequest({ email: 'admin@test.com', password: 'wrong' }));
    expect(res.status).toBe(401);
    expect(recordFailedAttempt).toHaveBeenCalledWith('admin@test.com');
  });

  it('returns 200 with session cookie on successful login', async () => {
    mockFindUnique.mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    mockUpdate.mockResolvedValue(mockUser);

    const res = await POST(makeRequest({ email: 'admin@test.com', password: 'correct' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe('u1');
    expect(body.user.email).toBe('admin@test.com');
    expect(body.mustChangePassword).toBe(false);
    expect(clearRateLimit).toHaveBeenCalledWith('admin@test.com');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN' }));
  });

  it('normalizes email to lowercase and trims', async () => {
    mockFindUnique.mockResolvedValue(null);

    await POST(makeRequest({ email: '  Admin@Test.COM  ', password: 'pass' }));
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: 'admin@test.com' },
    });
  });

  it('sets mustChangePassword when user flag is true', async () => {
    mockFindUnique.mockResolvedValue({ ...mockUser, mustChangePassword: true });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    mockUpdate.mockResolvedValue(mockUser);

    const res = await POST(makeRequest({ email: 'admin@test.com', password: 'correct' }));
    const body = await res.json();
    expect(body.mustChangePassword).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    mockFindUnique.mockRejectedValue(new Error('DB crashed'));

    const res = await POST(makeRequest({ email: 'admin@test.com', password: 'pass' }));
    expect(res.status).toBe(500);
  });
});
