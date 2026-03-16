import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted moves these above vi.mock hoisting
const { mockSession, mockFindMany, mockFindUnique, mockCreate, mockDelete } = vi.hoisted(() => ({
  mockSession: {
    userId: 'admin-1',
    email: 'superadmin@test.com',
    name: 'Super Admin',
    role: 'SUPER_ADMIN',
    iat: Date.now(),
    exp: Date.now() + 86400000,
  },
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@/lib/require-role', () => ({
  requireSuperAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminUser: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$12$hashed'),
  },
}));

vi.mock('crypto', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('crypto');
  return {
    ...actual,
    randomBytes: vi.fn().mockReturnValue({
      toString: () => 'random-password-1234',
    }),
  };
});

// Mock audit
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

import { GET, POST, DELETE } from './route';
import { requireSuperAdmin } from '@/lib/require-role';

function makeRequest(body?: Record<string, unknown>, url?: string) {
  return new Request(url || 'http://localhost/api/auth/users', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/auth/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      error: new (await import('next/server')).NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401 }
      ),
    });

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns list of users for SUPER_ADMIN', async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({ session: mockSession });
    mockFindMany.mockResolvedValue([
      { id: 'u1', email: 'admin@test.com', name: 'Admin', role: 'ADMIN', createdAt: new Date() },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].email).toBe('admin@test.com');
  });
});

describe('POST /api/auth/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue({ session: mockSession });
  });

  it('returns 400 when email is missing', async () => {
    const res = await POST(makeRequest({ name: 'Test' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest({ email: 'test@test.com' }));
    expect(res.status).toBe(400);
  });

  it('returns 409 when email already exists', async () => {
    mockFindUnique.mockResolvedValue({ id: 'existing' });

    const res = await POST(makeRequest({ email: 'existing@test.com', name: 'Test' }));
    expect(res.status).toBe(409);
  });

  it('creates user with ADMIN role by default', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: 'new-1',
      email: 'new@test.com',
      name: 'New User',
      role: 'ADMIN',
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ email: 'new@test.com', name: 'New User' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe('new@test.com');
    expect(body.tempPassword).toBeDefined();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'ADMIN',
          mustChangePassword: true,
        }),
      })
    );
  });

  it('creates SUPER_ADMIN when role is specified', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: 'new-1',
      email: 'super@test.com',
      name: 'Super',
      role: 'SUPER_ADMIN',
      createdAt: new Date(),
    });

    await POST(makeRequest({ email: 'super@test.com', name: 'Super', role: 'SUPER_ADMIN' }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'SUPER_ADMIN' }),
      })
    );
  });

  it('normalizes email to lowercase', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: 'new-1',
      email: 'test@test.com',
      name: 'Test',
      role: 'ADMIN',
      createdAt: new Date(),
    });

    await POST(makeRequest({ email: ' Test@Test.COM ', name: 'Test' }));
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: 'test@test.com' },
    });
  });
});

describe('DELETE /api/auth/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue({ session: mockSession });
  });

  it('returns 400 when user ID is missing', async () => {
    const req = new Request('http://localhost/api/auth/users', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when trying to delete own account', async () => {
    const req = new Request('http://localhost/api/auth/users?id=admin-1', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('cannot delete your own');
  });

  it('deletes user successfully', async () => {
    mockFindUnique.mockResolvedValue({ email: 'victim@test.com', name: 'Victim', role: 'ADMIN' });
    mockDelete.mockResolvedValue({});

    const req = new Request('http://localhost/api/auth/users?id=other-user', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'other-user' } });
  });
});
