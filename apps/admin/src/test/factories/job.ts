/**
 * Test factories for Job and queue stats models.
 */

let jobCounter = 0;

export function createMockJob(overrides: Record<string, unknown> = {}) {
  jobCounter++;
  return {
    id: `job-${jobCounter}`,
    siteId: 'site-1',
    type: 'CONTENT_GENERATE',
    queue: 'content',
    status: 'COMPLETED',
    priority: 0,
    payload: null,
    result: null,
    error: null,
    attempts: 1,
    maxAttempts: 3,
    idempotencyKey: null,
    scheduledFor: null,
    startedAt: new Date('2024-01-20T10:00:00Z'),
    completedAt: new Date('2024-01-20T10:05:00Z'),
    createdAt: new Date('2024-01-20T10:00:00Z'),
    updatedAt: new Date('2024-01-20T10:05:00Z'),
    ...overrides,
  };
}

export function createMockFailedJob(overrides: Record<string, unknown> = {}) {
  return createMockJob({
    status: 'FAILED',
    error: 'Connection timeout',
    attempts: 3,
    completedAt: null,
    site: { name: 'Test Site' },
    ...overrides,
  });
}

export function createMockQueueStats(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    waiting: 0,
    active: 0,
    completed: 10,
    failed: 0,
    delayed: 0,
    paused: false,
    ...overrides,
  };
}

export function createMockJobList(statuses: string[]) {
  return statuses.map((status) =>
    createMockJob({
      status,
      completedAt: status === 'COMPLETED' ? new Date() : null,
      startedAt: ['RUNNING', 'COMPLETED', 'FAILED'].includes(status) ? new Date() : null,
      error: status === 'FAILED' ? 'Test error' : null,
    })
  );
}

export function createMockDurationJobs(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const started = new Date('2024-01-20T10:00:00Z');
    const completed = new Date(started.getTime() + (i + 1) * 60000); // each job takes (i+1) minutes
    return {
      startedAt: started,
      completedAt: completed,
    };
  });
}
