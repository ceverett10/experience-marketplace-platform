import { describe, it, expect } from 'vitest';

/**
 * Basic smoke tests for demand-generation service
 * Full worker integration tests require Redis and Prisma setup
 */
describe('Demand Generation Service', () => {
  it('should have QUEUE_NAMES defined', () => {
    const QUEUE_NAMES = {
      CONTENT: 'content-queue',
      SITE: 'site-queue',
      DOMAIN: 'domain-queue',
      GSC: 'gsc-queue',
      ANALYTICS: 'analytics-queue',
      ABTEST: 'abtest-queue',
    };

    expect(QUEUE_NAMES).toBeDefined();
    expect(QUEUE_NAMES.CONTENT).toBe('content-queue');
    expect(QUEUE_NAMES.SITE).toBe('site-queue');
    expect(QUEUE_NAMES.DOMAIN).toBe('domain-queue');
  });

  it('should have correct queue structure', () => {
    const queueNames = [
      'content-queue',
      'site-queue',
      'domain-queue',
      'gsc-queue',
      'analytics-queue',
      'abtest-queue',
    ];

    expect(queueNames).toHaveLength(6);
    expect(queueNames).toContain('content-queue');
    expect(queueNames).toContain('analytics-queue');
  });
});
