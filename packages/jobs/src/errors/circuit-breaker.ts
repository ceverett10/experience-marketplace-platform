/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by temporarily blocking requests to failing services
 */

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

/**
 * Circuit breaker for external services
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
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          `Circuit breaker is OPEN for ${this.serviceName}. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }

      // Transition to half-open for recovery test
      this.state = CircuitState.HALF_OPEN;
      console.log(`[Circuit Breaker] ${this.serviceName} transitioning to HALF_OPEN`);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record successful call
   */
  private recordSuccess(): void {
    this.metrics.successes++;
    this.metrics.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.metrics.successes >= this.config.successThreshold) {
        this.close();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.metrics.failures = 0;
      this.metrics.recentFailures = [];
    }
  }

  /**
   * Record failed call
   */
  private recordFailure(): void {
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
      this.open();
    } else if (this.state === CircuitState.CLOSED) {
      // Check failure threshold
      if (this.metrics.recentFailures.length >= this.config.failureThreshold) {
        this.open();
      }
    }
  }

  /**
   * Open the circuit
   */
  private open(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.timeout;
    this.metrics.successes = 0;

    console.warn(
      `[Circuit Breaker] ${this.serviceName} OPENED after ${this.metrics.recentFailures.length} failures. Will retry at ${new Date(this.nextAttemptTime).toISOString()}`
    );
  }

  /**
   * Close the circuit
   */
  private close(): void {
    this.state = CircuitState.CLOSED;
    this.metrics.failures = 0;
    this.metrics.successes = 0;
    this.metrics.recentFailures = [];

    console.log(`[Circuit Breaker] ${this.serviceName} CLOSED - service recovered`);
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
  reset(): void {
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
  }
}

/**
 * Circuit breaker registry for managing multiple services
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create circuit breaker for service
   */
  getBreaker(serviceName: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(
        serviceName,
        new CircuitBreaker(serviceName, {
          failureThreshold: config?.failureThreshold ?? 5,
          successThreshold: config?.successThreshold ?? 2,
          timeout: config?.timeout ?? 60000,
          timeWindow: config?.timeWindow ?? 60000,
        })
      );
    }

    return this.breakers.get(serviceName)!;
  }

  /**
   * Get status of all circuit breakers
   */
  getAllStatus(): Record<string, ReturnType<CircuitBreaker['getStatus']>> {
    const status: Record<string, ReturnType<CircuitBreaker['getStatus']>> = {};

    for (const [name, breaker] of this.breakers.entries()) {
      status[name] = breaker.getStatus();
    }

    return status;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Export singleton registry
export const circuitBreakers = new CircuitBreakerRegistry();
