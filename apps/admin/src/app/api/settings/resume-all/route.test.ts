import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
}));

import { POST } from './route';

describe('POST /api/settings/resume-all', () => {
  it('resumes all autonomous processes', async () => {
    mockPrisma.platformSettings.update.mockResolvedValue({});

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('All autonomous processes have been resumed');
    expect(mockPrisma.platformSettings.update).toHaveBeenCalledWith({
      where: { id: 'platform_settings_singleton' },
      data: {
        allAutonomousProcessesPaused: false,
        pausedAt: null,
        pausedBy: null,
        pauseReason: null,
      },
    });
  });

  it('returns 500 when database update fails', async () => {
    mockPrisma.platformSettings.update.mockRejectedValue(new Error('DB error'));

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to resume processes');
  });
});
