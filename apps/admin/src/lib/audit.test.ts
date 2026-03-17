import { describe, it, expect, vi } from 'vitest';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { logAudit, getClientIp } from './audit';
import { prisma } from '@/lib/prisma';

describe('logAudit', () => {
  it('creates an audit log entry', async () => {
    await logAudit({
      userId: 'user-1',
      userEmail: 'admin@test.com',
      action: 'LOGIN',
      details: { ip: '127.0.0.1' },
      ipAddress: '127.0.0.1',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma as any).adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        userEmail: 'admin@test.com',
        action: 'LOGIN',
        details: JSON.stringify({ ip: '127.0.0.1' }),
        ipAddress: '127.0.0.1',
      },
    });
  });

  it('handles missing optional fields with null', async () => {
    await logAudit({ action: 'LOGOUT' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma as any).adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        userEmail: null,
        action: 'LOGOUT',
        details: null,
        ipAddress: null,
      },
    });
  });

  it('does not throw on Prisma error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).adminAuditLog.create.mockRejectedValueOnce(new Error('DB down'));

    // Should not throw
    await expect(logAudit({ action: 'LOGIN_FAILED' })).resolves.toBeUndefined();
  });
});

describe('getClientIp', () => {
  it('extracts IP from X-Forwarded-For header', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(getClientIp(request)).toBe('1.2.3.4');
  });

  it('falls back to X-Real-IP header', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-real-ip': '10.0.0.1' },
    });
    expect(getClientIp(request)).toBe('10.0.0.1');
  });

  it('returns undefined when no IP headers present', () => {
    const request = new Request('http://localhost');
    expect(getClientIp(request)).toBeUndefined();
  });

  it('handles single IP in X-Forwarded-For', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    expect(getClientIp(request)).toBe('1.2.3.4');
  });

  it('trims whitespace from X-Forwarded-For', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8' },
    });
    expect(getClientIp(request)).toBe('1.2.3.4');
  });
});
