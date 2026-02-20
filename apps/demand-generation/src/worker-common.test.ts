import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────
const { mockPrisma, mockRedis } = vi.hoisted(() => {
  const mockPrisma = {
    job: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockRedis = {
    del: vi.fn().mockResolvedValue(1),
    info: vi.fn().mockResolvedValue('used_memory_human:1.00M\nmaxmemory_human:25.00M'),
    quit: vi.fn(),
  };

  return { mockPrisma, mockRedis };
});

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
}));

vi.mock('@experience-marketplace/jobs', () => ({
  createRedisConnection: vi.fn(() => mockRedis),
  getQueueTimeout: vi.fn(() => 300_000),
  resetStuckCount: vi.fn(),
  getAllQueueMetrics: vi.fn().mockResolvedValue([]),
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn(),
}));

import { updateJobStatus, setupWorkerEvents, logJobEvent } from './worker-common';
import type { Job, Worker } from 'bullmq';

function createMockJob(overrides: Record<string, unknown> = {}): Job {
  return {
    id: 'bull-job-1',
    name: 'CONTENT_GENERATE',
    data: { siteId: 'site-1', dbJobId: 'db-job-1' },
    attemptsMade: 1,
    opts: { attempts: 3 },
    updateData: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Job;
}

function createMockWorker(): Worker & {
  handlers: Record<string, (...args: any[]) => any>;
} {
  const handlers: Record<string, (...args: any[]) => any> = {};
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => any) => {
      handlers[event] = handler;
    }),
    handlers,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.job.create.mockResolvedValue({ id: 'new-db-job-1' });
  mockPrisma.job.update.mockResolvedValue({});
  mockRedis.del.mockResolvedValue(1);
});

describe('updateJobStatus()', () => {
  it('creates DB record for repeatable jobs without dbJobId on RUNNING', async () => {
    const job = createMockJob({
      data: { somePayload: true }, // No dbJobId
    });

    await updateJobStatus(job, 'RUNNING');

    expect(mockPrisma.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'CONTENT_GENERATE',
        queue: 'scheduled',
        status: 'RUNNING',
        startedAt: expect.any(Date),
      }),
    });

    // Should persist the new dbJobId to the BullMQ job
    expect(job.updateData).toHaveBeenCalledWith(
      expect.objectContaining({ dbJobId: 'new-db-job-1' })
    );
  });

  it('updates existing DB record for normal jobs', async () => {
    const job = createMockJob(); // Has dbJobId: 'db-job-1'

    await updateJobStatus(job, 'RUNNING');

    expect(mockPrisma.job.create).not.toHaveBeenCalled();
    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: 'db-job-1' },
      data: expect.objectContaining({
        status: 'RUNNING',
        startedAt: expect.any(Date),
        attempts: 1,
      }),
    });
  });

  it('sets completedAt for COMPLETED status', async () => {
    const job = createMockJob();

    await updateJobStatus(job, 'COMPLETED', { result: 'ok' });

    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: 'db-job-1' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        completedAt: expect.any(Date),
        result: { result: 'ok' },
      }),
    });
  });

  it('sets error for FAILED status', async () => {
    const job = createMockJob();

    await updateJobStatus(job, 'FAILED', undefined, 'Connection timeout');

    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: 'db-job-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        completedAt: expect.any(Date),
        error: 'Connection timeout',
      }),
    });
  });

  it('silently skips when no dbJobId and status is not RUNNING', async () => {
    const job = createMockJob({
      data: { somePayload: true }, // No dbJobId
    });

    await updateJobStatus(job, 'COMPLETED');

    expect(mockPrisma.job.create).not.toHaveBeenCalled();
    expect(mockPrisma.job.update).not.toHaveBeenCalled();
  });
});

describe('setupWorkerEvents()', () => {
  it('clears dedup key on job completion', async () => {
    const worker = createMockWorker();
    setupWorkerEvents([worker as any], mockRedis as any);

    const job = createMockJob();
    await worker.handlers['completed'](job, { pages: 3 });

    expect(mockRedis.del).toHaveBeenCalledWith('dedup:site-1:CONTENT_GENERATE');
  });

  it('clears dedup key on final failure (attempts exhausted)', async () => {
    const worker = createMockWorker();
    setupWorkerEvents([worker as any], mockRedis as any);

    // 3 attempts made, max 3 → final failure
    const job = createMockJob({ attemptsMade: 3, opts: { attempts: 3 } });
    await worker.handlers['failed'](job, new Error('Timeout'));

    expect(mockRedis.del).toHaveBeenCalledWith('dedup:site-1:CONTENT_GENERATE');
  });

  it('does NOT clear dedup key on retryable failure', async () => {
    const worker = createMockWorker();
    setupWorkerEvents([worker as any], mockRedis as any);

    // 1 attempt made, max 3 → will retry
    const job = createMockJob({ attemptsMade: 1, opts: { attempts: 3 } });
    await worker.handlers['failed'](job, new Error('Timeout'));

    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('skips dedup key clear for jobs without siteId', async () => {
    const worker = createMockWorker();
    setupWorkerEvents([worker as any], mockRedis as any);

    const job = createMockJob({ data: { dbJobId: 'db-1' } }); // No siteId
    await worker.handlers['completed'](job, null);

    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('skips dedup key clear for jobs with siteId="all"', async () => {
    const worker = createMockWorker();
    setupWorkerEvents([worker as any], mockRedis as any);

    const job = createMockJob({ data: { siteId: 'all', dbJobId: 'db-1' } });
    await worker.handlers['completed'](job, null);

    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});

describe('logJobEvent()', () => {
  it('emits structured JSON with job metadata', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const job = createMockJob();

    logJobEvent('job_completed', job);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.event).toBe('job_completed');
    expect(parsed.jobId).toBe('bull-job-1');
    expect(parsed.jobType).toBe('CONTENT_GENERATE');
    expect(parsed.dbJobId).toBe('db-job-1');
    expect(parsed.siteId).toBe('site-1');
    expect(parsed.timestamp).toBeDefined();

    logSpy.mockRestore();
  });

  it('includes extra fields when provided', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const job = createMockJob();

    logJobEvent('job_failed', job, { error: 'Timeout', willRetry: true });

    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.error).toBe('Timeout');
    expect(parsed.willRetry).toBe(true);

    logSpy.mockRestore();
  });
});
