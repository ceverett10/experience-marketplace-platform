import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
}));

import { GET, PATCH } from './route';

function createPatchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/settings/autonomous', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const mockSettings = {
  id: 'platform_settings_singleton',
  allAutonomousProcessesPaused: false,
  pausedAt: null,
  pausedBy: null,
  pauseReason: null,
  enableSiteCreation: true,
  enableContentGeneration: true,
  enableGSCVerification: false,
  enableContentOptimization: true,
  enableABTesting: false,
  maxTotalSites: 100,
  maxSitesPerHour: 5,
  maxContentPagesPerHour: 20,
  maxGSCRequestsPerHour: 50,
  maxOpportunityScansPerDay: 200,
};

describe('GET /api/settings/autonomous', () => {
  it('returns autonomous settings', async () => {
    mockPrisma.platformSettings.findUnique.mockResolvedValue(mockSettings);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.settings.allProcessesPaused).toBe(false);
    expect(data.settings.enableSiteCreation).toBe(true);
    expect(data.settings.enableGSCVerification).toBe(false);
    expect(data.settings.maxTotalSites).toBe(100);
    expect(data.settings.maxContentPagesPerHour).toBe(20);
  });

  it('returns 404 when platform settings not found', async () => {
    mockPrisma.platformSettings.findUnique.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Platform settings not found');
  });

  it('returns 500 when database query fails', async () => {
    mockPrisma.platformSettings.findUnique.mockRejectedValue(new Error('DB error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch settings');
  });
});

describe('PATCH /api/settings/autonomous', () => {
  it('updates allowed fields', async () => {
    mockPrisma.platformSettings.update.mockResolvedValue({
      ...mockSettings,
      enableSiteCreation: false,
      maxTotalSites: 50,
    });

    const response = await PATCH(
      createPatchRequest({ enableSiteCreation: false, maxTotalSites: 50 })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Autonomous settings updated successfully');
    expect(mockPrisma.platformSettings.update).toHaveBeenCalledWith({
      where: { id: 'platform_settings_singleton' },
      data: { enableSiteCreation: false, maxTotalSites: 50 },
    });
  });

  it('filters out disallowed fields', async () => {
    mockPrisma.platformSettings.update.mockResolvedValue(mockSettings);

    await PATCH(
      createPatchRequest({
        enableSiteCreation: true,
        dangerousField: 'should-be-filtered',
        id: 'should-be-filtered',
      })
    );

    expect(mockPrisma.platformSettings.update).toHaveBeenCalledWith({
      where: { id: 'platform_settings_singleton' },
      data: { enableSiteCreation: true },
    });
  });

  it('returns 500 when update fails', async () => {
    mockPrisma.platformSettings.update.mockRejectedValue(new Error('Update failed'));

    const response = await PATCH(createPatchRequest({ enableSiteCreation: false }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to update settings');
  });
});
