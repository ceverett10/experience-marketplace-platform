import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter, createHolibobRateLimiter, createBulkSyncRateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('allows requests under the limit', () => {
    const limiter = new RateLimiter({ requestsPerWindow: 5, windowMs: 60000 });
    expect(limiter.canRequest()).toBe(true);
    expect(limiter.getRequestCount()).toBe(0);
  });

  it('tracks request count', async () => {
    const limiter = new RateLimiter({ requestsPerWindow: 5, windowMs: 60000, batchDelayMs: 0 });
    await limiter.wait();
    await limiter.wait();
    expect(limiter.getRequestCount()).toBe(2);
  });

  it('reports canRequest as false when limit reached', async () => {
    const limiter = new RateLimiter({ requestsPerWindow: 2, windowMs: 60000, batchDelayMs: 0 });
    await limiter.wait();
    await limiter.wait();
    expect(limiter.canRequest()).toBe(false);
  });

  it('resets request count', async () => {
    const limiter = new RateLimiter({ requestsPerWindow: 2, windowMs: 60000, batchDelayMs: 0 });
    await limiter.wait();
    await limiter.wait();
    expect(limiter.getRequestCount()).toBe(2);
    limiter.reset();
    expect(limiter.getRequestCount()).toBe(0);
    expect(limiter.canRequest()).toBe(true);
  });

  it('expires old requests outside the window', async () => {
    const limiter = new RateLimiter({ requestsPerWindow: 2, windowMs: 1000, batchDelayMs: 0 });
    await limiter.wait();
    await limiter.wait();
    expect(limiter.getRequestCount()).toBe(2);

    // Advance time past the window
    vi.advanceTimersByTime(1100);
    expect(limiter.getRequestCount()).toBe(0);
    expect(limiter.canRequest()).toBe(true);
  });

  it('uses default config values', () => {
    const limiter = new RateLimiter();
    // Default: 60 requests per 60s window
    expect(limiter.canRequest()).toBe(true);
  });
});

describe('factory functions', () => {
  it('createHolibobRateLimiter creates limiter with correct config', () => {
    const limiter = createHolibobRateLimiter();
    expect(limiter).toBeInstanceOf(RateLimiter);
    expect(limiter.canRequest()).toBe(true);
  });

  it('createBulkSyncRateLimiter creates limiter with correct config', () => {
    const limiter = createBulkSyncRateLimiter();
    expect(limiter).toBeInstanceOf(RateLimiter);
    expect(limiter.canRequest()).toBe(true);
  });
});
