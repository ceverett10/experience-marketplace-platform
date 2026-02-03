/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by temporarily blocking requests to failing services
 * Persists state to Redis for cross-dyno visibility
 */

import IORedis from 'ioredis';

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Blocking requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerConfig {
  /** Failure threshold before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Success threshold to close circuit from half-open (default: 2) */
  successThreshold?: number;
  /** Time in ms to wait before attempting recovery (default: 60000) */
  timeout?: number;
  /** Time window in ms for failure counting (default: 60000) */
  timeWindow?: number;
}

interface CircuitMetrics {
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  recentFailures: number[]; // Timestamps of recent failures
}

interface CircuitBreakerState {
  state: CircuitState;
  metrics: CircuitMetrics;
  nextAttemptTime: number;
  config: Required<CircuitBreakerConfig>;
  updatedAt: number;
}

const REDIS_KEY_PREFIX = 'circuit-breaker:';
const STATE_TTL_SECONDS = 3600; // 1 hour TTL for circuit breaker state

/**
 * Circuit breaker for external services
 * Persists state to Redis for cross-process visibility
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private metrics: CircuitMetrics = {
    failures: 0,
    successes: 0,
    lastFailureTime: 0,
    lastSuccessTime: 0,
    recentFailures: [],
  };
  private nextAttemptTime: number = 0;
  private redis: IORedis | null = null;

  constructor(
    private readonly serviceName: string,
    private readonly config: Required<CircuitBreakerConfig> = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
      timeWindow: 60000, // 1 minute
    }
  ) {}

  /**
   * Set Redis client for state persistence
   */
  setRedis(redis: IORedis): void {
    this.redis = redis;
  }

  /**
   * Get Redis key for this circuit breaker
   */
  private getRedisKey(): string {
    return `${REDIS_KEY_PREFIX}${this.serviceName}`;
  }

  /**
   * Persist state to Redis
   */
  private async persistState(): Promise<void> {
    if (!this.redis) return;

    try {
      const stateData: CircuitBreakerState = {
        state: this.state,
        metrics: this.metrics,
        nextAttemptTime: this.nextAttemptTime,
        config: this.config,
        updatedAt: Date.now(),
      };

      await this.redis.setex(this.getRedisKey(), STATE_TTL_SECONDS, JSON.stringify(stateData));
    } catch (error) {
      console.error(`[Circuit Breaker] Failed to persist state for ${this.serviceName}:`, error);
    }
  }

  /**
   * Load state from Redis
   */
  private async loadState(): Promise<void> {
    if (!this.redis) return;

    try {
      const data = await this.redis.get(this.getRedisKey());
      if (data) {
        const stateData: CircuitBreakerState = JSON.parse(data);
        this.state = stateData.state;
        this.metrics = stateData.metrics;
        this.nextAttemptTime = stateData.nextAttemptTime;
      }
    } catch (error) {
      console.error(`[Circuit Breaker] Failed to load state for ${this.serviceName}:`, error);
    }
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Load latest state from Redis
    await this.loadState();

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          `Circuit breaker is OPEN for ${this.serviceName}. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }

      // Transition to half-open for recovery test
      this.state = CircuitState.HALF_OPEN;
      await this.persistState();
      console.log(`[Circuit Breaker] ${this.serviceName} transitioning to HALF_OPEN`);
    }

    try {
      const result = await fn();
      await this.recordSuccess();
      return result;
    } catch (error) {
      await this.recordFailure();
      throw error;
    }
  }

  /**
   * Record successful call
   */
  private async recordSuccess(): Promise<void> {
    this.metrics.successes++;
    this.metrics.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.metrics.successes >= this.config.successThreshold) {
        await this.close();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.metrics.failures = 0;
      this.metrics.recentFailures = [];
    }

    await this.persistState();
  }

  /**
   * Record failed call
   */
  private async recordFailure(): Promise<void> {
    const now = Date.now();
    this.metrics.failures++;
    this.metrics.lastFailureTime = now;

    // Add to recent failures
    this.metrics.recentFailures.push(now);

    // Clean up old failures outside time window
    this.metrics.recentFailures = this.metrics.recentFailures.filter(
      (time) => now - time < this.config.timeWindow
    );

    // Check if we should open the circuit
    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state opens the circuit again
      await this.open();
    } else if (this.state === CircuitState.CLOSED) {
      // Check failure threshold
      if (this.metrics.recentFailures.length >= this.config.failureThreshold) {
        await this.open();
      }
    }

    await this.persistState();
  }

  /**
   * Open the circuit
   */
  private async open(): Promise<void> {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.timeout;
    this.metrics.successes = 0;

    console.warn(
      `[Circuit Breaker] ${this.serviceName} OPENED after ${this.metrics.recentFailures.length} failures. Will retry at ${new Date(this.nextAttemptTime).toISOString()}`
    );

    await this.persistState();
  }

  /**
   * Close the circuit
   */
  private async close(): Promise<void> {
    this.state = CircuitState.CLOSED;
    this.metrics.failures = 0;
    this.metrics.successes = 0;
    this.metrics.recentFailures = [];

    console.log(`[Circuit Breaker] ${this.serviceName} CLOSED - service recovered`);

    await this.persistState();
  }

  /**
   * Get current state and metrics
   */
  getStatus(): {
    state: CircuitState;
    metrics: CircuitMetrics;
    nextAttemptTime: number;
  } {
    return {
      state: this.state,
      metrics: { ...this.metrics },
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Manually reset circuit breaker
   */
  async reset(): Promise<void> {
    this.state = CircuitState.CLOSED;
    this.metrics = {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      recentFailures: [],
    };
    this.nextAttemptTime = 0;

    console.log(`[Circuit Breaker] ${this.serviceName} manually reset`);

    await this.persistState();
  }
}

/**
 * Circuit breaker registry for managing multiple services
 * Uses Redis for cross-dyno state persistence
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private redis: IORedis | null = null;

  /**
   * Initialize Redis connection for state persistence
   */
  initRedis(redis: IORedis): void {
    this.redis = redis;
    // Update existing breakers with Redis client
    for (const breaker of this.breakers.values()) {
      breaker.setRedis(redis);
    }
  }

  /**
   * Create Redis connection if not initialized
   */
  private ensureRedis(): void {
    if (!this.redis) {
      const redisUrl =
        process.env['REDIS_URL'] || process.env['REDIS_TLS_URL'] || 'redis://localhost:6379';
      const usesTls = redisUrl.includes('rediss://');

      this.redis = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        tls: usesTls ? { rejectUnauthorized: false } : undefined,
        lazyConnect: true,
      });
    }
  }

  /**
   * Get or create circuit breaker for service
   */
  getBreaker(serviceName: string, config?: CircuitBreakerConfig): CircuitBreaker {
    this.ensureRedis();

    if (!this.breakers.has(serviceName)) {
      const breaker = new CircuitBreaker(serviceName, {
        failureThreshold: config?.failureThreshold ?? 5,
        successThreshold: config?.successThreshold ?? 2,
        timeout: config?.timeout ?? 60000,
        timeWindow: config?.timeWindow ?? 60000,
      });

      if (this.redis) {
        breaker.setRedis(this.redis);
      }

      this.breakers.set(serviceName, breaker);
    }

    return this.breakers.get(serviceName)!;
  }

  /**
   * Get status of all circuit breakers from Redis
   */
  async getAllStatus(): Promise<Record<string, ReturnType<CircuitBreaker['getStatus']>>> {
    this.ensureRedis();

    const status: Record<string, ReturnType<CircuitBreaker['getStatus']>> = {};

    if (!this.redis) {
      return status;
    }

    try {
      // Get all circuit breaker keys from Redis
      const keys = await this.redis.keys(`${REDIS_KEY_PREFIX}*`);

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const stateData: CircuitBreakerState = JSON.parse(data);
          const serviceName = key.replace(REDIS_KEY_PREFIX, '');
          status[serviceName] = {
            state: stateData.state,
            metrics: stateData.metrics,
            nextAttemptTime: stateData.nextAttemptTime,
          };
        }
      }
    } catch (error) {
      console.error('[Circuit Breaker] Failed to get all status from Redis:', error);
    }

    return status;
  }

  /**
   * Reset all circuit breakers
   */
  async resetAll(): Promise<void> {
    this.ensureRedis();

    if (!this.redis) {
      return;
    }

    try {
      // Get all circuit breaker keys from Redis
      const keys = await this.redis.keys(`${REDIS_KEY_PREFIX}*`);

      for (const key of keys) {
        await this.redis.del(key);
      }

      // Reset local breakers too
      for (const breaker of this.breakers.values()) {
        await breaker.reset();
      }

      console.log('[Circuit Breaker] All circuit breakers reset');
    } catch (error) {
      console.error('[Circuit Breaker] Failed to reset all circuit breakers:', error);
    }
  }
}

// Export singleton registry
export const circuitBreakers = new CircuitBreakerRegistry();
