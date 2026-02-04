import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';
import {
  mockGetJobQueue,
  mockCircuitBreakers,
  mockGetScheduledJobs,
} from '@/test/mocks/jobs';
import { createMockFailedJob, createMockDurationJobs } from '@/test/factories';

// Mock modules before importing the route
vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@experience-marketplace/jobs', () => ({
  getJobQueue: mockGetJobQueue,
  circuitBreakers: mockCircuitBreakers,
  getScheduledJobs: mockGetScheduledJobs,
}));

// Import after mocks are set up
import { GET } from './route';

describe('GET /api/operations/dashboard', () => {
  beforeEach(() => {
    // Default: all DB counts return 0
    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.job.findMany.mockResolvedValue([]);
    mockPrisma.job.findFirst.mockResolvedValue(null);
  });

  it('returns dashboard data when all services are healthy', async () => {
    // DB stats: 2 active, 15 completed today, 1 failed today
    mockPrisma.job.count
      .mockResolvedValueOnce(2)   // RUNNING count
      .mockResolvedValueOnce(15)  // completed today
      .mockResolvedValueOnce(1)   // failed today
      .mockResolvedValueOnce(50)  // completed 24h
      .mockResolvedValueOnce(2)   // failed 24h
      .mockResolvedValueOnce(8);  // completed last hour (throughput)

    // Duration jobs
    mockPrisma.job.findMany
      .mockResolvedValueOnce(createMockDurationJobs(3)) // duration data
      .mockResolvedValueOnce([]);                        // recent failures

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.health).toBe('healthy');
    expect(data.metrics).toEqual({
      activeNow: 2,
      completedToday: 15,
      failedToday: 1,
      successRate: 96, // 50/(50+2) = 96%
      avgDurationMs: expect.any(Number),
      throughputPerHour: 8,
    });
    expect(data.queues).toBeInstanceOf(Array);
    expect(data.queueTotals).toEqual({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    });
    expect(data.recentFailures).toEqual([]);
    expect(data.scheduledJobs).toBeInstanceOf(Array);
    expect(data.circuitBreakers).toEqual({});
  });

  it('returns partial data when Redis is unavailable', async () => {
    // Make queue stats fail (Redis down)
    mockGetJobQueue.mockImplementation(() => {
      throw new Error('Redis connection refused');
    });

    // Circuit breakers also fail
    mockCircuitBreakers.getAllStatus.mockRejectedValue(new Error('Redis down'));

    // DB stats still work
    mockPrisma.job.count
      .mockResolvedValueOnce(0)  // RUNNING
      .mockResolvedValueOnce(5)  // completed today
      .mockResolvedValueOnce(0)  // failed today
      .mockResolvedValueOnce(5)  // completed 24h
      .mockResolvedValueOnce(0)  // failed 24h
      .mockResolvedValueOnce(2); // throughput

    mockPrisma.job.findMany
      .mockResolvedValueOnce([]) // duration data
      .mockResolvedValueOnce([]); // recent failures

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // Dashboard still returns data — degraded gracefully
    expect(data.health).toBe('healthy');
    expect(data.metrics.completedToday).toBe(5);
    // Queue stats are zeroed out
    expect(data.queues.every((q: { waiting: number }) => q.waiting === 0)).toBe(true);
    // Circuit breakers are empty
    expect(data.circuitBreakers).toEqual({});
  });

  it('returns 500 when database fails', async () => {
    mockPrisma.job.count.mockRejectedValue(new Error('Database connection lost'));
    mockPrisma.job.findMany.mockRejectedValue(new Error('Database connection lost'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch operations dashboard');
  });

  it('reports degraded health when failures exceed threshold', async () => {
    // 15 failures today — should trigger degraded
    mockPrisma.job.count
      .mockResolvedValueOnce(0)   // RUNNING
      .mockResolvedValueOnce(100) // completed today
      .mockResolvedValueOnce(15)  // failed today (>10 = degraded)
      .mockResolvedValueOnce(100) // completed 24h
      .mockResolvedValueOnce(15)  // failed 24h
      .mockResolvedValueOnce(10); // throughput

    mockPrisma.job.findMany
      .mockResolvedValueOnce([]) // duration data
      .mockResolvedValueOnce([]); // recent failures

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.health).toBe('degraded');
  });

  it('reports critical health when failures are extreme', async () => {
    // 55 failures today — should trigger critical
    mockPrisma.job.count
      .mockResolvedValueOnce(0)   // RUNNING
      .mockResolvedValueOnce(100) // completed today
      .mockResolvedValueOnce(55)  // failed today (>50 = critical)
      .mockResolvedValueOnce(100) // completed 24h
      .mockResolvedValueOnce(55)  // failed 24h
      .mockResolvedValueOnce(5);  // throughput

    mockPrisma.job.findMany
      .mockResolvedValueOnce([]) // duration data
      .mockResolvedValueOnce([]); // recent failures

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.health).toBe('critical');
  });

  it('reports critical health when multiple circuit breakers are open', async () => {
    mockCircuitBreakers.getAllStatus.mockResolvedValue({
      holibob: { state: 'OPEN', metrics: { failures: 10, successes: 0 } },
      cloudflare: { state: 'OPEN', metrics: { failures: 5, successes: 0 } },
    });

    mockPrisma.job.count
      .mockResolvedValueOnce(0)  // RUNNING
      .mockResolvedValueOnce(0)  // completed today
      .mockResolvedValueOnce(0)  // failed today
      .mockResolvedValueOnce(0)  // completed 24h
      .mockResolvedValueOnce(0)  // failed 24h
      .mockResolvedValueOnce(0); // throughput

    mockPrisma.job.findMany
      .mockResolvedValueOnce([]) // duration data
      .mockResolvedValueOnce([]); // recent failures

    const response = await GET();
    const data = await response.json();

    expect(data.health).toBe('critical');
  });

  it('formats recent failures correctly', async () => {
    const failedJobs = [
      createMockFailedJob({
        id: 'fail-1',
        type: 'CONTENT_GENERATE',
        error: 'API timeout after 30000ms - this is a very long error message that should be truncated',
        attempts: 3,
        updatedAt: new Date('2024-01-20T10:30:00Z'),
        site: { name: 'My Tourism Site' },
      }),
    ];

    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.job.findMany
      .mockResolvedValueOnce([])         // duration data
      .mockResolvedValueOnce(failedJobs); // recent failures

    const response = await GET();
    const data = await response.json();

    expect(data.recentFailures).toHaveLength(1);
    expect(data.recentFailures[0]).toEqual({
      id: 'fail-1',
      type: 'CONTENT_GENERATE',
      error: expect.any(String),
      attempts: 3,
      siteName: 'My Tourism Site',
      failedAt: '2024-01-20T10:30:00.000Z',
    });
    // Error should be truncated to 200 chars
    expect(data.recentFailures[0].error.length).toBeLessThanOrEqual(200);
  });

  it('computes average job duration correctly', async () => {
    // 3 jobs: 1min, 2min, 3min → avg = 2min = 120000ms
    const durationJobs = createMockDurationJobs(3);

    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.job.findMany
      .mockResolvedValueOnce(durationJobs) // duration data
      .mockResolvedValueOnce([]);          // recent failures

    const response = await GET();
    const data = await response.json();

    // Jobs: 1min, 2min, 3min → total=6min → avg=2min=120000ms
    expect(data.metrics.avgDurationMs).toBe(120000);
  });

  it('assigns correct health status to individual queues', async () => {
    // Configure specific queue stats
    const contentQueue = mockGetJobQueue('content');
    contentQueue.getWaitingCount.mockResolvedValue(0);
    contentQueue.getFailedCount.mockResolvedValue(15); // >10 = critical
    contentQueue.isPaused.mockResolvedValue(false);

    const seoQueue = mockGetJobQueue('seo');
    seoQueue.getWaitingCount.mockResolvedValue(150); // >100 = warning
    seoQueue.getFailedCount.mockResolvedValue(0);
    seoQueue.isPaused.mockResolvedValue(false);

    const gscQueue = mockGetJobQueue('gsc');
    gscQueue.isPaused.mockResolvedValue(true); // paused

    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.job.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    const contentQueueData = data.queues.find((q: { name: string }) => q.name === 'content');
    const seoQueueData = data.queues.find((q: { name: string }) => q.name === 'seo');
    const gscQueueData = data.queues.find((q: { name: string }) => q.name === 'gsc');

    expect(contentQueueData?.health).toBe('critical');
    expect(seoQueueData?.health).toBe('warning');
    expect(gscQueueData?.health).toBe('paused');
  });

  it('returns 100% success rate when no jobs in last 24h', async () => {
    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.job.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(data.metrics.successRate).toBe(100);
  });

  describe('scheduled jobs with non-DB types', () => {
    it('skips Prisma queries for AUTONOMOUS_ROADMAP and WEEKLY_BLOG_GENERATE', async () => {
      // Return scheduled jobs that include non-DB types
      mockGetScheduledJobs.mockReturnValue([
        { jobType: 'SEO_ANALYZE', schedule: '0 3 * * *', description: 'Daily SEO analysis' },
        { jobType: 'AUTONOMOUS_ROADMAP', schedule: '*/5 * * * *', description: 'Process roadmaps' },
        { jobType: 'WEEKLY_BLOG_GENERATE', schedule: '0 4 * * 1,4', description: 'Generate blogs' },
        { jobType: 'GSC_SYNC', schedule: '0 */6 * * *', description: 'Sync GSC data' },
      ]);

      mockPrisma.job.count.mockResolvedValue(0);
      mockPrisma.job.findMany.mockResolvedValue([]);
      // Return null for valid DB types (no last run found)
      mockPrisma.job.findFirst.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);

      // Non-DB types should have lastRun: null without querying Prisma
      const roadmap = data.scheduledJobs.find(
        (sj: { jobType: string }) => sj.jobType === 'AUTONOMOUS_ROADMAP'
      );
      const blog = data.scheduledJobs.find(
        (sj: { jobType: string }) => sj.jobType === 'WEEKLY_BLOG_GENERATE'
      );
      expect(roadmap.lastRun).toBeNull();
      expect(blog.lastRun).toBeNull();

      // Only 2 DB types should have triggered findFirst calls (SEO_ANALYZE and GSC_SYNC)
      expect(mockPrisma.job.findFirst).toHaveBeenCalledTimes(2);
    });

    it('does not crash when Prisma throws for a scheduled job type', async () => {
      mockGetScheduledJobs.mockReturnValue([
        { jobType: 'SEO_ANALYZE', schedule: '0 3 * * *', description: 'Daily SEO analysis' },
        { jobType: 'LINK_OPPORTUNITY_SCAN', schedule: '0 2 * * 2', description: 'Scan links' },
      ]);

      mockPrisma.job.count.mockResolvedValue(0);
      mockPrisma.job.findMany.mockResolvedValue([]);
      // First call succeeds, second throws (simulating Prisma validation error)
      mockPrisma.job.findFirst
        .mockResolvedValueOnce({
          status: 'COMPLETED',
          createdAt: new Date('2024-01-20T03:00:00Z'),
          startedAt: new Date('2024-01-20T03:00:05Z'),
          completedAt: new Date('2024-01-20T03:05:00Z'),
        })
        .mockRejectedValueOnce(new Error('Invalid enum value'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);

      // First job should have last run data
      const seo = data.scheduledJobs.find(
        (sj: { jobType: string }) => sj.jobType === 'SEO_ANALYZE'
      );
      expect(seo.lastRun).not.toBeNull();
      expect(seo.lastRun.status).toBe('COMPLETED');

      // Second job should gracefully degrade to null
      const links = data.scheduledJobs.find(
        (sj: { jobType: string }) => sj.jobType === 'LINK_OPPORTUNITY_SCAN'
      );
      expect(links.lastRun).toBeNull();
    });

    it('returns all scheduled jobs including non-DB types in response', async () => {
      mockGetScheduledJobs.mockReturnValue([
        { jobType: 'SEO_ANALYZE', schedule: '0 3 * * *', description: 'Daily SEO analysis' },
        { jobType: 'AUTONOMOUS_ROADMAP', schedule: '*/5 * * * *', description: 'Process roadmaps' },
        { jobType: 'WEEKLY_BLOG_GENERATE', schedule: '0 4 * * 1,4', description: 'Generate blogs' },
      ]);

      mockPrisma.job.count.mockResolvedValue(0);
      mockPrisma.job.findMany.mockResolvedValue([]);
      mockPrisma.job.findFirst.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // All 3 scheduled jobs should be in the response
      expect(data.scheduledJobs).toHaveLength(3);
      expect(data.scheduledJobs.map((sj: { jobType: string }) => sj.jobType)).toEqual([
        'SEO_ANALYZE',
        'AUTONOMOUS_ROADMAP',
        'WEEKLY_BLOG_GENERATE',
      ]);
    });
  });
});
