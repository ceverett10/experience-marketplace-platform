import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';
import { mockGetScheduledJobs, mockAddJob } from '@/test/mocks/jobs';

// Use vi.hoisted so the mock is available when vi.mock factory runs (hoisted above imports)
const { mockGetNextCronRun } = vi.hoisted(() => ({
  mockGetNextCronRun: vi.fn().mockReturnValue(new Date('2024-01-21T03:00:00Z')),
}));

// Mock modules before importing the route
vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@experience-marketplace/jobs', () => ({
  getScheduledJobs: mockGetScheduledJobs,
  getNextCronRun: mockGetNextCronRun,
  addJob: mockAddJob,
}));

// Import after mocks are set up
import { GET, POST } from './route';

function createRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

describe('GET /api/operations/schedules', () => {
  beforeEach(() => {
    mockPrisma.job.findMany.mockResolvedValue([]);
    mockGetNextCronRun.mockReturnValue(new Date('2024-01-21T03:00:00Z'));
  });

  it('returns all scheduled jobs with next run times', async () => {
    mockGetScheduledJobs.mockReturnValue([
      { jobType: 'SEO_ANALYZE', schedule: '0 3 * * *', description: 'Daily SEO analysis' },
      { jobType: 'GSC_SYNC', schedule: '0 */6 * * *', description: 'Sync GSC data' },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.schedules).toHaveLength(2);
    expect(data.schedules[0].jobType).toBe('SEO_ANALYZE');
    expect(data.schedules[0].nextRun).toBe('2024-01-21T03:00:00.000Z');
    expect(data.schedules[1].jobType).toBe('GSC_SYNC');
  });

  it('queries DB for AUTONOMOUS_ROADMAP', async () => {
    mockGetScheduledJobs.mockReturnValue([
      { jobType: 'AUTONOMOUS_ROADMAP', schedule: '*/5 * * * *', description: 'Process roadmaps' },
      { jobType: 'SEO_ANALYZE', schedule: '0 3 * * *', description: 'Daily SEO analysis' },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.schedules).toHaveLength(2);

    // Both types now query the DB
    expect(mockPrisma.job.findMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: 'AUTONOMOUS_ROADMAP' },
      })
    );
    expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: 'SEO_ANALYZE' },
      })
    );
  });

  it('resolves WEEKLY_BLOG_GENERATE via TYPE_ALIASES to CONTENT_GENERATE', async () => {
    mockGetScheduledJobs.mockReturnValue([
      {
        jobType: 'WEEKLY_BLOG_GENERATE',
        schedule: '0 4 * * 1,4',
        description: 'Generate blogs',
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // WEEKLY_BLOG_GENERATE is aliased to CONTENT_GENERATE for DB queries
    expect(mockPrisma.job.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: 'CONTENT_GENERATE' },
      })
    );
    // The schedule should still show the original jobType
    expect(data.schedules[0].jobType).toBe('WEEKLY_BLOG_GENERATE');
  });

  it('handles SEO_ANALYZE (deep) job type correctly', async () => {
    mockGetScheduledJobs.mockReturnValue([
      { jobType: 'SEO_ANALYZE (deep)', schedule: '0 5 * * 0', description: 'Deep audit' },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // Should query with "SEO_ANALYZE" (deep suffix stripped)
    expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: 'SEO_ANALYZE' },
      })
    );
    expect(data.schedules[0].jobType).toBe('SEO_ANALYZE (deep)');
  });

  it('returns execution history with duration calculations', async () => {
    mockGetScheduledJobs.mockReturnValue([
      { jobType: 'SEO_ANALYZE', schedule: '0 3 * * *', description: 'Daily SEO analysis' },
    ]);

    mockPrisma.job.findMany.mockResolvedValue([
      {
        id: 'job-1',
        status: 'COMPLETED',
        error: null,
        attempts: 1,
        createdAt: new Date('2024-01-20T03:00:00Z'),
        startedAt: new Date('2024-01-20T03:00:05Z'),
        completedAt: new Date('2024-01-20T03:05:00Z'),
        site: { name: 'Tourism Site' },
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(data.schedules[0].lastExecution).toEqual({
      id: 'job-1',
      status: 'COMPLETED',
      error: null,
      createdAt: '2024-01-20T03:00:00.000Z',
      startedAt: '2024-01-20T03:00:05.000Z',
      completedAt: '2024-01-20T03:05:00.000Z',
      durationMs: 295000, // ~4min 55sec
    });

    expect(data.schedules[0].recentHistory).toHaveLength(1);
    expect(data.schedules[0].recentHistory[0].siteName).toBe('Tourism Site');
  });

  it('gracefully handles Prisma errors for individual job types', async () => {
    mockGetScheduledJobs.mockReturnValue([
      { jobType: 'SEO_ANALYZE', schedule: '0 3 * * *', description: 'Daily SEO analysis' },
      {
        jobType: 'LINK_OPPORTUNITY_SCAN',
        schedule: '0 2 * * 2',
        description: 'Scan link opportunities',
      },
    ]);

    mockPrisma.job.findMany
      .mockResolvedValueOnce([
        {
          id: 'job-1',
          status: 'COMPLETED',
          error: null,
          attempts: 1,
          createdAt: new Date('2024-01-20T03:00:00Z'),
          startedAt: new Date('2024-01-20T03:00:05Z'),
          completedAt: new Date('2024-01-20T03:05:00Z'),
          site: { name: 'Test Site' },
        },
      ])
      .mockRejectedValueOnce(new Error('Invalid enum value'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // First job has history
    expect(data.schedules[0].lastExecution).not.toBeNull();
    // Second job gracefully degraded
    expect(data.schedules[1].lastExecution).toBeNull();
    expect(data.schedules[1].recentHistory).toEqual([]);
  });

  it('returns 500 when getScheduledJobs throws', async () => {
    mockGetScheduledJobs.mockImplementation(() => {
      throw new Error('Module initialization error');
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch schedules');
  });

  it('truncates long error messages in execution history', async () => {
    mockGetScheduledJobs.mockReturnValue([
      { jobType: 'SEO_ANALYZE', schedule: '0 3 * * *', description: 'Daily SEO analysis' },
    ]);

    const longError = 'A'.repeat(500);
    mockPrisma.job.findMany.mockResolvedValue([
      {
        id: 'job-1',
        status: 'FAILED',
        error: longError,
        attempts: 3,
        createdAt: new Date('2024-01-20T03:00:00Z'),
        startedAt: new Date('2024-01-20T03:00:05Z'),
        completedAt: null,
        site: null,
      },
    ]);

    const response = await GET();
    const data = await response.json();

    // lastExecution error truncated to 200 chars
    expect(data.schedules[0].lastExecution.error.length).toBeLessThanOrEqual(200);
    // recentHistory error truncated to 100 chars
    expect(data.schedules[0].recentHistory[0].error.length).toBeLessThanOrEqual(100);
  });
});

describe('POST /api/operations/schedules', () => {
  beforeEach(() => {
    mockAddJob.mockResolvedValue('new-job-id');
  });

  it('triggers a valid job type', async () => {
    const request = createRequest('http://localhost/api/operations/schedules', {
      method: 'POST',
      body: JSON.stringify({ action: 'trigger', jobType: 'GSC_SYNC' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Triggered GSC_SYNC manually');
    expect(data.jobId).toBe('new-job-id');
    expect(mockAddJob).toHaveBeenCalledWith('GSC_SYNC', {
      siteId: 'all',
      dimensions: ['query', 'page', 'country', 'device'],
    });
  });

  it('rejects AUTONOMOUS_ROADMAP as non-triggerable', async () => {
    const request = createRequest('http://localhost/api/operations/schedules', {
      method: 'POST',
      body: JSON.stringify({ action: 'trigger', jobType: 'AUTONOMOUS_ROADMAP' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('cannot be manually triggered');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('rejects WEEKLY_BLOG_GENERATE as non-triggerable', async () => {
    const request = createRequest('http://localhost/api/operations/schedules', {
      method: 'POST',
      body: JSON.stringify({ action: 'trigger', jobType: 'WEEKLY_BLOG_GENERATE' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('cannot be manually triggered');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('returns 400 for missing action', async () => {
    const request = createRequest('http://localhost/api/operations/schedules', {
      method: 'POST',
      body: JSON.stringify({ jobType: 'GSC_SYNC' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 for unknown job type', async () => {
    const request = createRequest('http://localhost/api/operations/schedules', {
      method: 'POST',
      body: JSON.stringify({ action: 'trigger', jobType: 'NONEXISTENT_JOB' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Cannot trigger job type');
  });

  it('adds deep audit flags for SEO_ANALYZE (deep)', async () => {
    const request = createRequest('http://localhost/api/operations/schedules', {
      method: 'POST',
      body: JSON.stringify({ action: 'trigger', jobType: 'SEO_ANALYZE (deep)' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockAddJob).toHaveBeenCalledWith('SEO_ANALYZE', {
      siteId: 'all',
      fullSiteAudit: true,
      triggerOptimizations: true,
      forceAudit: true,
    });
  });

  it('triggers LINK_OPPORTUNITY_SCAN with correct payload', async () => {
    const request = createRequest('http://localhost/api/operations/schedules', {
      method: 'POST',
      body: JSON.stringify({ action: 'trigger', jobType: 'LINK_OPPORTUNITY_SCAN' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockAddJob).toHaveBeenCalledWith('LINK_OPPORTUNITY_SCAN', { siteId: 'all' });
  });

  it('triggers LINK_BACKLINK_MONITOR with correct payload', async () => {
    const request = createRequest('http://localhost/api/operations/schedules', {
      method: 'POST',
      body: JSON.stringify({ action: 'trigger', jobType: 'LINK_BACKLINK_MONITOR' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockAddJob).toHaveBeenCalledWith('LINK_BACKLINK_MONITOR', { siteId: 'all' });
  });

  it('returns 500 when addJob throws', async () => {
    mockAddJob.mockRejectedValue(new Error('Redis connection refused'));

    const request = createRequest('http://localhost/api/operations/schedules', {
      method: 'POST',
      body: JSON.stringify({ action: 'trigger', jobType: 'GSC_SYNC' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to trigger job');
  });
});
