import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';
import { mockGetJobQueue, mockAddJob } from '@/test/mocks/jobs';
import { createMockJob } from '@/test/factories';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@experience-marketplace/jobs', () => ({
  getJobQueue: mockGetJobQueue,
  addJob: mockAddJob,
}));

import { GET, POST } from './route';

function createRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

describe('GET /api/operations/jobs', () => {
  it('returns paginated jobs with stats', async () => {
    const jobs = [
      {
        ...createMockJob({ id: 'job-1', type: 'CONTENT_GENERATE', status: 'COMPLETED' }),
        site: { name: 'Tourism Site' },
      },
      {
        ...createMockJob({ id: 'job-2', type: 'SEO_ANALYZE', status: 'FAILED', error: 'Timeout' }),
        site: { name: 'Tourism Site' },
      },
    ];

    mockPrisma.job.findMany.mockResolvedValue(jobs);
    mockPrisma.job.count.mockResolvedValue(2);
    mockPrisma.job.groupBy.mockResolvedValue([
      { status: 'COMPLETED', _count: { _all: 1 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ]);

    const response = await GET(createRequest('http://localhost/api/operations/jobs'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jobs).toHaveLength(2);
    expect(data.pagination).toEqual({ page: 1, limit: 25, total: 2, totalPages: 1 });
    expect(data.stats).toEqual({
      pending: 0,
      running: 0,
      completed: 1,
      failed: 1,
      total: 2,
    });
  });

  it('filters by status', async () => {
    mockPrisma.job.findMany.mockResolvedValue([]);
    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.job.groupBy.mockResolvedValue([]);

    await GET(createRequest('http://localhost/api/operations/jobs?status=FAILED'));

    expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'FAILED' }),
      })
    );
  });

  it('supports comma-separated status filter', async () => {
    mockPrisma.job.findMany.mockResolvedValue([]);
    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.job.groupBy.mockResolvedValue([]);

    await GET(createRequest('http://localhost/api/operations/jobs?status=PENDING,RUNNING'));

    expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'RUNNING'] },
        }),
      })
    );
  });

  it('paginates correctly', async () => {
    mockPrisma.job.findMany.mockResolvedValue([]);
    mockPrisma.job.count.mockResolvedValue(50);
    mockPrisma.job.groupBy.mockResolvedValue([]);

    const response = await GET(
      createRequest('http://localhost/api/operations/jobs?page=3&limit=10')
    );
    const data = await response.json();

    expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
    expect(data.pagination).toEqual({ page: 3, limit: 10, total: 50, totalPages: 5 });
  });

  it('caps limit at 100', async () => {
    mockPrisma.job.findMany.mockResolvedValue([]);
    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.job.groupBy.mockResolvedValue([]);

    await GET(createRequest('http://localhost/api/operations/jobs?limit=500'));

    expect(mockPrisma.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it('truncates error messages to 200 chars', async () => {
    const longError = 'A'.repeat(300);
    const job = {
      ...createMockJob({ error: longError, status: 'FAILED' }),
      site: null,
    };
    mockPrisma.job.findMany.mockResolvedValue([job]);
    mockPrisma.job.count.mockResolvedValue(1);
    mockPrisma.job.groupBy.mockResolvedValue([]);

    const response = await GET(createRequest('http://localhost/api/operations/jobs'));
    const data = await response.json();

    expect(data.jobs[0].error.length).toBeLessThanOrEqual(200);
  });

  it('computes duration for completed jobs', async () => {
    const started = new Date('2024-01-20T10:00:00Z');
    const completed = new Date('2024-01-20T10:05:00Z');
    const job = {
      ...createMockJob({ startedAt: started, completedAt: completed, status: 'COMPLETED' }),
      site: null,
    };
    mockPrisma.job.findMany.mockResolvedValue([job]);
    mockPrisma.job.count.mockResolvedValue(1);
    mockPrisma.job.groupBy.mockResolvedValue([]);

    const response = await GET(createRequest('http://localhost/api/operations/jobs'));
    const data = await response.json();

    expect(data.jobs[0].durationMs).toBe(300000); // 5 minutes
  });

  it('returns 500 on database failure', async () => {
    mockPrisma.job.findMany.mockRejectedValue(new Error('DB down'));

    const response = await GET(createRequest('http://localhost/api/operations/jobs'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch jobs');
  });
});

describe('POST /api/operations/jobs', () => {
  it('retrieves job detail with error logs', async () => {
    const job = {
      ...createMockJob({ id: 'job-1', payload: { siteId: 'site-1' }, result: { pages: 3 } }),
      site: { name: 'Test Site' },
      errorLogs: [
        {
          id: 'err-1',
          errorName: 'TimeoutError',
          errorMessage: 'Request timed out',
          errorCategory: 'NETWORK',
          errorSeverity: 'HIGH',
          stackTrace: 'Error: ...',
          context: null,
          attemptNumber: 1,
          createdAt: new Date('2024-01-20'),
        },
      ],
    };
    mockPrisma.job.findUnique.mockResolvedValue(job);

    const response = await POST(
      createRequest('http://localhost/api/operations/jobs', {
        method: 'POST',
        body: JSON.stringify({ action: 'get-detail', jobId: 'job-1' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('job-1');
    expect(data.payload).toEqual({ siteId: 'site-1' });
    expect(data.errorLogs).toHaveLength(1);
    expect(data.errorLogs[0].errorName).toBe('TimeoutError');
  });

  it('returns 404 when job not found for detail', async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const response = await POST(
      createRequest('http://localhost/api/operations/jobs', {
        method: 'POST',
        body: JSON.stringify({ action: 'get-detail', jobId: 'nonexistent' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(response.status).toBe(404);
  });

  it('retries a failed job by re-queuing', async () => {
    const failedJob = createMockJob({
      id: 'job-1',
      type: 'CONTENT_GENERATE',
      status: 'FAILED',
      payload: { siteId: 'site-1' },
      idempotencyKey: null,
    });
    mockPrisma.job.findUnique.mockResolvedValue(failedJob);
    mockAddJob.mockResolvedValue('new-job-id');

    const response = await POST(
      createRequest('http://localhost/api/operations/jobs', {
        method: 'POST',
        body: JSON.stringify({ action: 'retry', jobId: 'job-1' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(mockAddJob).toHaveBeenCalledWith('CONTENT_GENERATE', failedJob.payload);
    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'CANCELLED' },
    });
  });

  it('bulk retries failed jobs with filter', async () => {
    const failedJobs = [
      createMockJob({ id: 'fail-1', type: 'CONTENT_GENERATE', status: 'FAILED' }),
      createMockJob({ id: 'fail-2', type: 'CONTENT_GENERATE', status: 'FAILED' }),
    ];
    mockPrisma.job.findMany.mockResolvedValue(failedJobs);
    mockAddJob.mockResolvedValue('new-id');

    const response = await POST(
      createRequest('http://localhost/api/operations/jobs', {
        method: 'POST',
        body: JSON.stringify({
          action: 'bulk-retry',
          filter: { type: 'CONTENT_GENERATE' },
        }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.retried).toBe(2);
    expect(data.total).toBe(2);
  });

  it('returns 400 for unknown action', async () => {
    const response = await POST(
      createRequest('http://localhost/api/operations/jobs', {
        method: 'POST',
        body: JSON.stringify({ action: 'invalid' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(response.status).toBe(400);
  });
});
