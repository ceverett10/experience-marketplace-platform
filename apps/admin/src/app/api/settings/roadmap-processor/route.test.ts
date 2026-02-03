import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';
import { mockProcessAllSiteRoadmaps } from '@/test/mocks/jobs';

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
}));

vi.mock('@experience-marketplace/jobs', () => ({
  processAllSiteRoadmaps: mockProcessAllSiteRoadmaps,
}));

import { GET, POST } from './route';

describe('GET /api/settings/roadmap-processor', () => {
  it('returns processor status with site counts and job stats', async () => {
    mockPrisma.site.count
      .mockResolvedValueOnce(10)  // totalSites
      .mockResolvedValueOnce(2)   // pausedSites
      .mockResolvedValueOnce(8);  // activeSites

    mockPrisma.job.groupBy.mockResolvedValue([
      { status: 'COMPLETED', _count: 15 },
      { status: 'FAILED', _count: 3 },
      { status: 'RUNNING', _count: 1 },
    ]);

    mockPrisma.platformSettings.findUnique.mockResolvedValue({
      allAutonomousProcessesPaused: false,
      pausedAt: null,
      pauseReason: null,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sites.total).toBe(10);
    expect(data.sites.active).toBe(8);
    expect(data.sites.paused).toBe(2);
    expect(data.processor.isGloballyPaused).toBe(false);
    expect(data.recentActivity.completed).toBe(15);
    expect(data.recentActivity.failed).toBe(3);
    expect(data.recentActivity.running).toBe(1);
    expect(data.recentActivity.total).toBe(19);
  });

  it('returns globally paused state', async () => {
    mockPrisma.site.count.mockResolvedValue(0);
    mockPrisma.job.groupBy.mockResolvedValue([]);
    mockPrisma.platformSettings.findUnique.mockResolvedValue({
      allAutonomousProcessesPaused: true,
      pausedAt: '2024-01-01T00:00:00Z',
      pauseReason: 'Maintenance',
    });

    const response = await GET();
    const data = await response.json();

    expect(data.processor.isGloballyPaused).toBe(true);
    expect(data.processor.pauseReason).toBe('Maintenance');
  });

  it('returns 500 when database query fails', async () => {
    mockPrisma.site.count.mockRejectedValue(new Error('DB error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch processor status');
  });
});

describe('POST /api/settings/roadmap-processor', () => {
  it('runs roadmap processor and returns results', async () => {
    mockPrisma.platformSettings.findUnique.mockResolvedValue({
      allAutonomousProcessesPaused: false,
    });
    mockProcessAllSiteRoadmaps.mockResolvedValue({
      sitesProcessed: 5,
      tasksQueued: 12,
      errors: [],
    });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Processed 5 sites, queued 12 tasks');
    expect(data.result.sitesProcessed).toBe(5);
    expect(data.result.tasksQueued).toBe(12);
  });

  it('returns 400 when all processes are paused', async () => {
    mockPrisma.platformSettings.findUnique.mockResolvedValue({
      allAutonomousProcessesPaused: true,
    });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Cannot run processor while all autonomous processes are paused');
  });

  it('returns 500 when processor execution fails', async () => {
    mockPrisma.platformSettings.findUnique.mockResolvedValue({
      allAutonomousProcessesPaused: false,
    });
    mockProcessAllSiteRoadmaps.mockRejectedValue(new Error('Processing failed'));

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to run processor');
  });
});
