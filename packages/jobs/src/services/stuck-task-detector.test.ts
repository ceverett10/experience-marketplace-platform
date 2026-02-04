import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockRemoveJob, mockErrorTracking } = vi.hoisted(() => {
  const mockPrisma = {
    job: {
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const mockRemoveJob = vi.fn().mockResolvedValue(true);
  const mockErrorTracking = {
    logError: vi.fn().mockResolvedValue(undefined),
  };
  return { mockPrisma, mockRemoveJob, mockErrorTracking };
});

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
}));

vi.mock('../queues/index.js', () => ({
  removeJob: mockRemoveJob,
}));

vi.mock('../errors/tracking', () => ({
  errorTracking: mockErrorTracking,
}));

import { detectStuckTasks, resetStuckCount, clearAllStuckCounts } from './stuck-task-detector';

beforeEach(() => {
  vi.clearAllMocks();
  clearAllStuckCounts();
});

function makeStuckJob(overrides: Partial<{
  id: string;
  type: string;
  siteId: string | null;
  queue: string;
  idempotencyKey: string | null;
  createdAt: Date;
  startedAt: Date;
}> = {}) {
  return {
    id: overrides.id || 'job-1',
    type: overrides.type || 'CONTENT_OPTIMIZE',
    siteId: overrides.siteId ?? 'site-1',
    queue: overrides.queue || 'content',
    idempotencyKey: 'idempotencyKey' in overrides ? overrides.idempotencyKey : 'content:bmq-123',
    createdAt: overrides.createdAt || new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    startedAt: overrides.startedAt || new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
  };
}

describe('detectStuckTasks', () => {
  describe('self-healing for stuck PENDING jobs', () => {
    it('should delete DB record and remove BullMQ entry for stuck PENDING job', async () => {
      const stuckJob = makeStuckJob();

      mockPrisma.job.findMany
        .mockResolvedValueOnce([stuckJob]) // stuck PENDING query
        .mockResolvedValueOnce([]); // stuck RUNNING query

      const result = await detectStuckTasks();

      expect(result.healed).toBe(1);
      expect(result.permanentlyFailed).toBe(0);

      // Should remove BullMQ entry
      expect(mockRemoveJob).toHaveBeenCalledWith('content', 'bmq-123');

      // Should delete the DB record (not update to FAILED)
      expect(mockPrisma.job.delete).toHaveBeenCalledWith({ where: { id: 'job-1' } });
      expect(mockPrisma.job.update).not.toHaveBeenCalled();
    });

    it('should handle jobs without idempotencyKey gracefully', async () => {
      const stuckJob = makeStuckJob({ idempotencyKey: null });

      mockPrisma.job.findMany
        .mockResolvedValueOnce([stuckJob])
        .mockResolvedValueOnce([]);

      const result = await detectStuckTasks();

      expect(result.healed).toBe(1);
      // Should not attempt BullMQ removal
      expect(mockRemoveJob).not.toHaveBeenCalled();
      // Should still delete DB record
      expect(mockPrisma.job.delete).toHaveBeenCalledWith({ where: { id: 'job-1' } });
    });
  });

  describe('self-healing for stuck RUNNING jobs', () => {
    it('should delete DB record and remove BullMQ entry for stuck RUNNING job', async () => {
      const stuckJob = makeStuckJob({ id: 'job-running', idempotencyKey: 'domain:bmq-456' });

      mockPrisma.job.findMany
        .mockResolvedValueOnce([]) // no stuck PENDING
        .mockResolvedValueOnce([stuckJob]); // stuck RUNNING

      const result = await detectStuckTasks();

      expect(result.healed).toBe(1);
      expect(mockRemoveJob).toHaveBeenCalledWith('domain', 'bmq-456');
      expect(mockPrisma.job.delete).toHaveBeenCalledWith({ where: { id: 'job-running' } });
    });
  });

  describe('max retries and permanent failure', () => {
    it('should permanently fail after MAX_STUCK_RETRIES', async () => {
      const stuckJob = makeStuckJob({ siteId: 'site-retry-test', type: 'SSL_PROVISION' });

      // Simulate 3 previous stuck detections (the 4th should permanently fail)
      for (let i = 0; i < 3; i++) {
        mockPrisma.job.findMany
          .mockResolvedValueOnce([stuckJob])
          .mockResolvedValueOnce([]);
        await detectStuckTasks();
      }

      // Reset mocks but not stuck counts
      vi.clearAllMocks();

      // 4th detection — should permanently fail
      mockPrisma.job.findMany
        .mockResolvedValueOnce([stuckJob])
        .mockResolvedValueOnce([]);

      const result = await detectStuckTasks();

      expect(result.healed).toBe(0);
      expect(result.permanentlyFailed).toBe(1);

      // Should UPDATE to FAILED (not delete)
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          error: expect.stringContaining('Exceeded max retries'),
        }),
      });
      // Should NOT delete
      expect(mockPrisma.job.delete).not.toHaveBeenCalled();
    });

    it('should reset stuck count and allow retries after resetStuckCount', async () => {
      const stuckJob = makeStuckJob({ siteId: 'site-reset-test', type: 'GSC_SETUP' });

      // Simulate 3 stuck detections
      for (let i = 0; i < 3; i++) {
        mockPrisma.job.findMany
          .mockResolvedValueOnce([stuckJob])
          .mockResolvedValueOnce([]);
        await detectStuckTasks();
      }

      // Reset the counter (simulates a successful job completion)
      resetStuckCount('site-reset-test', 'GSC_SETUP');

      vi.clearAllMocks();

      // Next detection should heal, not permanently fail
      mockPrisma.job.findMany
        .mockResolvedValueOnce([stuckJob])
        .mockResolvedValueOnce([]);

      const result = await detectStuckTasks();

      expect(result.healed).toBe(1);
      expect(result.permanentlyFailed).toBe(0);
      expect(mockPrisma.job.delete).toHaveBeenCalled();
    });
  });

  describe('mixed results', () => {
    it('should handle mix of PENDING and RUNNING stuck jobs', async () => {
      const pendingJob = makeStuckJob({ id: 'pend-1', type: 'CONTENT_OPTIMIZE', siteId: 'site-a' });
      const runningJob = makeStuckJob({ id: 'run-1', type: 'DOMAIN_VERIFY', siteId: 'site-b', idempotencyKey: 'domain:bmq-789' });

      mockPrisma.job.findMany
        .mockResolvedValueOnce([pendingJob])
        .mockResolvedValueOnce([runningJob]);

      const result = await detectStuckTasks();

      expect(result.healed).toBe(2);
      expect(result.details).toHaveLength(2);
      expect(mockPrisma.job.delete).toHaveBeenCalledTimes(2);
    });

    it('should return empty results when no stuck jobs found', async () => {
      mockPrisma.job.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await detectStuckTasks();

      expect(result.healed).toBe(0);
      expect(result.permanentlyFailed).toBe(0);
      expect(result.details).toHaveLength(0);
    });
  });

  describe('error tracking', () => {
    it('should log healed events with MEDIUM severity on first occurrence', async () => {
      const stuckJob = makeStuckJob({ siteId: 'site-log-test', type: 'CONTENT_GENERATE' });

      mockPrisma.job.findMany
        .mockResolvedValueOnce([stuckJob])
        .mockResolvedValueOnce([]);

      await detectStuckTasks();

      expect(mockErrorTracking.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorName: 'StuckTaskHealed',
          errorSeverity: 'MEDIUM',
          retryable: true,
          context: expect.objectContaining({ stuckCount: 1 }),
        })
      );
    });

    it('should log with HIGH severity on second occurrence', async () => {
      const stuckJob = makeStuckJob({ siteId: 'site-sev-test', type: 'DOMAIN_REGISTER' });

      // First detection
      mockPrisma.job.findMany
        .mockResolvedValueOnce([stuckJob])
        .mockResolvedValueOnce([]);
      await detectStuckTasks();

      vi.clearAllMocks();

      // Second detection
      mockPrisma.job.findMany
        .mockResolvedValueOnce([stuckJob])
        .mockResolvedValueOnce([]);
      await detectStuckTasks();

      expect(mockErrorTracking.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorSeverity: 'HIGH',
          context: expect.objectContaining({ stuckCount: 2 }),
        })
      );
    });

    it('should log permanent failure with CRITICAL severity', async () => {
      const stuckJob = makeStuckJob({ siteId: 'site-crit-test', type: 'SSL_PROVISION' });

      // Trigger 4 detections (3 heals + 1 permanent fail)
      for (let i = 0; i < 4; i++) {
        vi.clearAllMocks();
        mockPrisma.job.findMany
          .mockResolvedValueOnce([stuckJob])
          .mockResolvedValueOnce([]);
        await detectStuckTasks();
      }

      expect(mockErrorTracking.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorName: 'StuckTaskPermanentFailure',
          errorSeverity: 'CRITICAL',
          retryable: false,
        })
      );
    });
  });
});
