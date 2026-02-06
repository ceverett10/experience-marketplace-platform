/**
 * Rate Limiter Utility
 * Simple rate limiter for controlling API request frequency
 */

export interface RateLimiterConfig {
  /** Maximum requests per time window */
  requestsPerWindow?: number;
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
  /** Delay between batches in milliseconds (default: 1000 = 1 second) */
  batchDelayMs?: number;
}

/**
 * Simple rate limiter class for controlling API request frequency
 * Tracks requests within a sliding window and enforces limits
 */
export class RateLimiter {
  private requestsPerWindow: number;
  private windowMs: number;
  private batchDelayMs: number;
  private requestTimestamps: number[] = [];

  constructor(config: RateLimiterConfig = {}) {
    this.requestsPerWindow = config.requestsPerWindow ?? 60; // 60 requests per minute default
    this.windowMs = config.windowMs ?? 60000; // 1 minute default
    this.batchDelayMs = config.batchDelayMs ?? 1000; // 1 second default
  }

  /**
   * Wait if necessary to respect rate limits
   * Call this before making an API request
   */
  async wait(): Promise<void> {
    const now = Date.now();

    // Remove timestamps outside the current window
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    // If we've hit the rate limit, wait until the oldest request expires
    if (this.requestTimestamps.length >= this.requestsPerWindow) {
      const oldestTimestamp = this.requestTimestamps[0];
      if (oldestTimestamp) {
        const waitTime = this.windowMs - (now - oldestTimestamp) + 100; // +100ms buffer
        if (waitTime > 0) {
          console.log(`[RateLimiter] Rate limit reached, waiting ${waitTime}ms`);
          await this.delay(waitTime);
        }
      }
    }

    // Record this request
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Wait for the configured batch delay
   * Useful between processing batches of items
   */
  async waitBetweenBatches(): Promise<void> {
    if (this.batchDelayMs > 0) {
      await this.delay(this.batchDelayMs);
    }
  }

  /**
   * Get current request count in the window
   */
  getRequestCount(): number {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < this.windowMs
    );
    return this.requestTimestamps.length;
  }

  /**
   * Check if we can make a request without waiting
   */
  canRequest(): boolean {
    const now = Date.now();
    const activeRequests = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < this.windowMs
    );
    return activeRequests.length < this.requestsPerWindow;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requestTimestamps = [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a rate limiter with Holibob API defaults
 * Holibob allows ~60 requests per minute
 */
export function createHolibobRateLimiter(): RateLimiter {
  return new RateLimiter({
    requestsPerWindow: 60,
    windowMs: 60000,
    batchDelayMs: 1000,
  });
}

/**
 * Create a conservative rate limiter for bulk operations
 * Uses lower limits to avoid hitting rate limits during large syncs
 */
export function createBulkSyncRateLimiter(): RateLimiter {
  return new RateLimiter({
    requestsPerWindow: 30, // Half the normal rate
    windowMs: 60000,
    batchDelayMs: 2000, // 2 second delay between batches
  });
}

export default RateLimiter;
