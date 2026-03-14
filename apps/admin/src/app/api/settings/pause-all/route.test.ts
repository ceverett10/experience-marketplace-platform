import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
}));

// Mock RBAC — simulate SUPER_ADMIN session
vi.mock('@/lib/require-role', () => ({
  requireSuperAdmin: vi.fn().mockResolvedValue({
    session: { userId: 'user-1', email: 'admin@test.com', role: 'SUPER_ADMIN' },
  }),
}));

// Mock audit logging
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

import { POST } from './route';

function createRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/settings/pause-all', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/settings/pause-all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pauses all autonomous processes with provided reason', async () => {
    mockPrisma.platformSettings.update.mockResolvedValue({});

    const response = await POST(createRequest({ pauseReason: 'Deploying new version' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('All autonomous processes have been paused');
    expect(mockPrisma.platformSettings.update).toHaveBeenCalledWith({
      where: { id: 'platform_settings_singleton' },
      data: expect.objectContaining({
        allAutonomousProcessesPaused: true,
        pausedBy: 'admin@test.com',
        pauseReason: 'Deploying new version',
      }),
    });
  });

  it('uses default reason when pauseReason not provided', async () => {
    mockPrisma.platformSettings.update.mockResolvedValue({});

    const response = await POST(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.platformSettings.update).toHaveBeenCalledWith({
      where: { id: 'platform_settings_singleton' },
      data: expect.objectContaining({
        pausedBy: 'admin@test.com',
        pauseReason: 'Manual pause from admin dashboard',
      }),
    });
  });

  it('returns 500 when database update fails', async () => {
    mockPrisma.platformSettings.update.mockRejectedValue(new Error('DB error'));

    const response = await POST(createRequest({ pauseReason: 'test' }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to pause processes');
  });
});
