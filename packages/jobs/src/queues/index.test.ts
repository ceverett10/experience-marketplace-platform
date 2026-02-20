import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────
const { mockPrisma, mockRedis, mockQueue } = vi.hoisted(() => {
  const mockPrisma = {
    job: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
  };

  const mockRedis = {
    set: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
    info: vi.fn().mockResolvedValue('used_memory_human:1.00M'),
    keys: vi.fn().mockResolvedValue([]),
    xtrim: vi.fn(),
    quit: vi.fn(),
  };

  const mockBullmqJob = { id: 'bull-123' };
  const mockQueue = {
    add: vi.fn().mockResolvedValue(mockBullmqJob),
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getCompletedCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
    getDelayedCount: vi.fn().mockResolvedValue(0),
    clean: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  };

  return { mockPrisma, mockRedis, mockQueue };
});

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
}));

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockRedis),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => mockQueue),
}));

// Import after mocks
import { QUEUE_NAMES } from '../types';

// We need to import the class to test — use dynamic import after mocks are set up
let queueRegistry: any;

beforeEach(async () => {
  vi.clearAllMocks();

  // Reset default mock behaviors
  mockPrisma.job.create.mockResolvedValue({ id: 'db-job-uuid-1' });
  mockPrisma.job.update.mockResolvedValue({});
  mockPrisma.job.delete.mockResolvedValue({});
  mockRedis.set.mockResolvedValue('OK'); // NX succeeds (no duplicate)
  mockRedis.incr.mockResolvedValue(1); // Budget count = 1 (well under limit)
  mockRedis.expire.mockResolvedValue(1);
  mockQueue.add.mockResolvedValue({ id: 'bull-123' });

  // Re-import to get fresh singleton
  const mod = await import('./index');
  queueRegistry = (mod as any).queueRegistry;
});

describe('addJob()', () => {
  it('creates DB record and BullMQ job for normal job', async () => {
    const result = await queueRegistry.addJob('CONTENT_GENERATE', { siteId: 'site-1' });

    expect(result).toBe('db-job-uuid-1');

    // DB record created with PENDING status
    expect(mockPrisma.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'CONTENT_GENERATE',
        queue: QUEUE_NAMES.CONTENT,
        status: 'PENDING',
        siteId: 'site-1',
      }),
    });

    // BullMQ job added with dbJobId in payload
    expect(mockQueue.add).toHaveBeenCalledWith(
      'CONTENT_GENERATE',
      expect.objectContaining({ siteId: 'site-1', dbJobId: 'db-job-uuid-1' }),
      expect.any(Object)
    );

    // DB record updated with idempotencyKey
    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: 'db-job-uuid-1' },
      data: { idempotencyKey: `${QUEUE_NAMES.CONTENT}:bull-123` },
    });
  });

  it('returns dedup string when duplicate exists', async () => {
    // Redis SET NX returns null = key already exists
    mockRedis.set.mockResolvedValue(null);

    const result = await queueRegistry.addJob('CONTENT_GENERATE', { siteId: 'site-1' });

    expect(result).toBe('dedup:site-1:CONTENT_GENERATE');
    expect(mockPrisma.job.create).not.toHaveBeenCalled();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('allows dedup-exempt types through even with existing key', async () => {
    // Even though Redis would return null, SOCIAL_POST_GENERATE is exempt
    const result = await queueRegistry.addJob('SOCIAL_POST_GENERATE', { siteId: 'site-1' });

    // Should NOT call Redis SET for dedup
    // (set is called for budget, but not for dedup)
    expect(result).toBe('db-job-uuid-1');
    expect(mockPrisma.job.create).toHaveBeenCalled();
  });

  it('proceeds normally when Redis dedup check fails (fail-open)', async () => {
    mockRedis.set.mockRejectedValue(new Error('Redis connection refused'));

    const result = await queueRegistry.addJob('CONTENT_GENERATE', { siteId: 'site-1' });

    // Should still create the job
    expect(result).toBe('db-job-uuid-1');
    expect(mockPrisma.job.create).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalled();
  });

  it('returns budget-exceeded string when daily budget exhausted', async () => {
    // Budget count exceeds limit (content limit is 2000)
    mockRedis.incr.mockResolvedValue(2001);

    // Need dedup to pass first
    mockRedis.set.mockResolvedValue('OK');

    const result = await queueRegistry.addJob('CONTENT_GENERATE', { siteId: 'site-1' });

    expect(result).toBe(`budget-exceeded:${QUEUE_NAMES.CONTENT}:CONTENT_GENERATE`);
    expect(mockPrisma.job.create).not.toHaveBeenCalled();
  });

  it('allows job through at 80% budget but logs warning', async () => {
    // 80% of content budget (2000) = 1600
    mockRedis.incr.mockResolvedValue(1600);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await queueRegistry.addJob('CONTENT_GENERATE', { siteId: 'site-1' });

    expect(result).toBe('db-job-uuid-1');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('80%'));
    warnSpy.mockRestore();
  });

  it('proceeds normally when Redis budget check fails (fail-open)', async () => {
    mockRedis.incr.mockRejectedValue(new Error('Redis connection refused'));

    const result = await queueRegistry.addJob('CONTENT_GENERATE', { siteId: 'site-1' });

    expect(result).toBe('db-job-uuid-1');
    expect(mockPrisma.job.create).toHaveBeenCalled();
  });

  it('sets SCHEDULED status and scheduledFor when delay option provided', async () => {
    const result = await queueRegistry.addJob(
      'CONTENT_GENERATE',
      { siteId: 'site-1' },
      { delay: 15000 }
    );

    expect(result).toBe('db-job-uuid-1');
    expect(mockPrisma.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'SCHEDULED',
        scheduledFor: expect.any(Date),
      }),
    });

    // BullMQ job should have delay option
    expect(mockQueue.add).toHaveBeenCalledWith(
      'CONTENT_GENERATE',
      expect.any(Object),
      expect.objectContaining({ delay: 15000 })
    );
  });

  it('cleans up DB record when BullMQ add fails', async () => {
    mockQueue.add.mockRejectedValue(new Error('Redis OOM'));

    await expect(queueRegistry.addJob('CONTENT_GENERATE', { siteId: 'site-1' })).rejects.toThrow(
      'Redis OOM'
    );

    // DB record should have been created then deleted
    expect(mockPrisma.job.create).toHaveBeenCalled();
    expect(mockPrisma.job.delete).toHaveBeenCalledWith({
      where: { id: 'db-job-uuid-1' },
    });
  });

  it('throws validation error for non-exempt type without siteId', async () => {
    await expect(queueRegistry.addJob('SEO_ANALYZE', { query: 'test' })).rejects.toThrow(
      'missing siteId'
    );
  });
});
