import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock require-role
vi.mock('@/lib/require-role', () => ({
  getSession: vi.fn(),
}));

import { GET } from './route';
import { getSession } from '@/lib/require-role';

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  it('returns user info when authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'u1',
      email: 'admin@test.com',
      name: 'Admin User',
      role: 'SUPER_ADMIN',
      iat: Date.now(),
      exp: Date.now() + 86400000,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.email).toBe('admin@test.com');
    expect(body.user.name).toBe('Admin User');
    expect(body.user.role).toBe('SUPER_ADMIN');
  });

  it('does not expose userId in response', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'u1',
      email: 'admin@test.com',
      name: 'Admin',
      role: 'ADMIN',
      iat: Date.now(),
      exp: Date.now() + 86400000,
    });

    const res = await GET();
    const body = await res.json();
    expect(body.user.userId).toBeUndefined();
  });
});
