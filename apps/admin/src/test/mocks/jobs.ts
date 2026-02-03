import { vi } from 'vitest';

/**
 * Mock for @experience-marketplace/jobs package.
 *
 * Provides mock implementations for all job-related functions
 * used across admin API routes.
 */

// Mock BullMQ queue instance
function createMockQueue() {
  return {
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getCompletedCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
    getDelayedCount: vi.fn().mockResolvedValue(0),
    isPaused: vi.fn().mockResolvedValue(false),
    add: vi.fn(),
    close: vi.fn(),
  };
}

const mockQueues: Record<string, ReturnType<typeof createMockQueue>> = {};

export const mockGetJobQueue = vi.fn((name: string) => {
  if (!mockQueues[name]) {
    mockQueues[name] = createMockQueue();
  }
  return mockQueues[name];
});

export const mockAddJob = vi.fn().mockResolvedValue({ id: 'mock-job-id' });

export const mockCircuitBreakers = {
  getAllStatus: vi.fn().mockResolvedValue({}),
  getBreaker: vi.fn().mockReturnValue({
    fire: vi.fn(),
    reset: vi.fn(),
    state: 'CLOSED',
  }),
  resetAll: vi.fn(),
};

export const mockErrorTracking = {
  getErrorLog: vi.fn().mockResolvedValue(null),
  getErrorLogs: vi.fn().mockResolvedValue({ errors: [], total: 0 }),
  getErrorStats: vi.fn().mockResolvedValue({
    total: 0,
    byCategory: {},
    bySeverity: {},
    byService: {},
  }),
  cleanupOldErrors: vi.fn().mockResolvedValue(0),
};

export const mockGetScheduledJobs = vi.fn().mockReturnValue([
  { jobType: 'SEO_ANALYZE', schedule: '0 3 * * *', description: 'Daily SEO analysis' },
  { jobType: 'CONTENT_OPTIMIZE', schedule: '0 4 * * 0', description: 'Weekly content optimization' },
]);

export const mockGetSiteRoadmap = vi.fn().mockResolvedValue([]);
export const mockInitializeSiteRoadmap = vi.fn().mockResolvedValue({ success: true });
export const mockExecuteNextTasks = vi.fn().mockResolvedValue({ executed: 0 });
export const mockProcessAllSiteRoadmaps = vi.fn().mockResolvedValue({ processed: 0 });
export const mockGenerateHomepageConfig = vi.fn().mockResolvedValue({
  hero: { title: 'Test Hero', subtitle: 'Test Subtitle' },
});

export const mockTaskDescriptions: Record<string, string> = {
  CONTENT_GENERATE: 'Generate content',
  SEO_ANALYZE: 'Analyze SEO',
  SITE_CREATE: 'Create site',
};

/**
 * Get a specific mock queue to configure its behavior in tests.
 */
export function getMockQueue(name: string) {
  return mockGetJobQueue(name);
}

/**
 * Reset all job mocks. Call in beforeEach().
 */
export function resetMockJobs() {
  // Clear all tracked queues
  for (const key of Object.keys(mockQueues)) {
    delete mockQueues[key];
  }

  mockGetJobQueue.mockClear();
  mockGetJobQueue.mockImplementation((name: string) => {
    if (!mockQueues[name]) {
      mockQueues[name] = createMockQueue();
    }
    return mockQueues[name];
  });

  mockAddJob.mockClear().mockResolvedValue({ id: 'mock-job-id' });
  mockCircuitBreakers.getAllStatus.mockClear().mockResolvedValue({});
  mockCircuitBreakers.getBreaker.mockClear();
  mockCircuitBreakers.resetAll.mockClear();
  mockErrorTracking.getErrorLog.mockClear().mockResolvedValue(null);
  mockErrorTracking.getErrorLogs.mockClear().mockResolvedValue({ errors: [], total: 0 });
  mockErrorTracking.getErrorStats.mockClear().mockResolvedValue({
    total: 0,
    byCategory: {},
    bySeverity: {},
    byService: {},
  });
  mockErrorTracking.cleanupOldErrors.mockClear().mockResolvedValue(0);
  mockGetScheduledJobs.mockClear().mockReturnValue([
    { jobType: 'SEO_ANALYZE', schedule: '0 3 * * *', description: 'Daily SEO analysis' },
    { jobType: 'CONTENT_OPTIMIZE', schedule: '0 4 * * 0', description: 'Weekly content optimization' },
  ]);
  mockGetSiteRoadmap.mockClear().mockResolvedValue([]);
  mockInitializeSiteRoadmap.mockClear().mockResolvedValue({ success: true });
  mockExecuteNextTasks.mockClear().mockResolvedValue({ executed: 0 });
  mockProcessAllSiteRoadmaps.mockClear().mockResolvedValue({ processed: 0 });
  mockGenerateHomepageConfig.mockClear().mockResolvedValue({
    hero: { title: 'Test Hero', subtitle: 'Test Subtitle' },
  });
}
