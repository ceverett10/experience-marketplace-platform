/**
 * Custom Error Types for Job Processing
 * Enables intelligent retry strategies based on error classification
 */

export enum ErrorCategory {
  /** External API errors (rate limits, timeouts, server errors) */
  EXTERNAL_API = 'EXTERNAL_API',
  /** Database errors (connection, queries, constraints) */
  DATABASE = 'DATABASE',
  /** Configuration errors (missing env vars, invalid config) */
  CONFIGURATION = 'CONFIGURATION',
  /** Business logic errors (invalid state, validation failures) */
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  /** Resource not found errors */
  NOT_FOUND = 'NOT_FOUND',
  /** Rate limiting errors */
  RATE_LIMIT = 'RATE_LIMIT',
  /** Authentication/authorization errors */
  AUTH = 'AUTH',
  /** Network errors (DNS, connection refused) */
  NETWORK = 'NETWORK',
  /** Unknown or unexpected errors */
  UNKNOWN = 'UNKNOWN',
}

export enum ErrorSeverity {
  /** Temporary error, likely to succeed on retry */
  TEMPORARY = 'TEMPORARY',
  /** May succeed on retry with backoff */
  RECOVERABLE = 'RECOVERABLE',
  /** Unlikely to succeed without intervention */
  PERMANENT = 'PERMANENT',
  /** Critical error requiring immediate attention */
  CRITICAL = 'CRITICAL',
}

/**
 * Base job error class with categorization
 */
export class JobError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;
  public readonly context?: Record<string, any>;
  public readonly originalError?: Error;

  constructor(
    message: string,
    options: {
      category: ErrorCategory;
      severity: ErrorSeverity;
      retryable?: boolean;
      context?: Record<string, any>;
      originalError?: Error;
    }
  ) {
    super(message);
    this.name = 'JobError';
    this.category = options.category;
    this.severity = options.severity;
    this.retryable =
      options.retryable !== undefined ? options.retryable : this.severity !== ErrorSeverity.PERMANENT;
    this.context = options.context;
    this.originalError = options.originalError;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      retryable: this.retryable,
      context: this.context,
      stack: this.stack,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : undefined,
    };
  }
}

/**
 * External API error (DataForSEO, Holibob, Namecheap, Cloudflare)
 */
export class ExternalApiError extends JobError {
  constructor(
    message: string,
    options: {
      service: string;
      statusCode?: number;
      context?: Record<string, any>;
      originalError?: Error;
    }
  ) {
    const isRateLimit = options.statusCode === 429;
    const isServerError = options.statusCode && options.statusCode >= 500;

    super(message, {
      category: isRateLimit ? ErrorCategory.RATE_LIMIT : ErrorCategory.EXTERNAL_API,
      severity: isRateLimit
        ? ErrorSeverity.TEMPORARY
        : isServerError
          ? ErrorSeverity.RECOVERABLE
          : ErrorSeverity.PERMANENT,
      retryable: Boolean(isRateLimit || isServerError),
      context: {
        ...options.context,
        service: options.service,
        statusCode: options.statusCode,
      },
      originalError: options.originalError,
    });
    this.name = 'ExternalApiError';
  }
}

/**
 * Database error
 */
export class DatabaseError extends JobError {
  constructor(
    message: string,
    options?: {
      operation?: string;
      context?: Record<string, any>;
      originalError?: Error;
    }
  ) {
    super(message, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.RECOVERABLE,
      retryable: true,
      context: {
        ...options?.context,
        operation: options?.operation,
      },
      originalError: options?.originalError,
    });
    this.name = 'DatabaseError';
  }
}

/**
 * Configuration error (missing env vars, invalid config)
 */
export class ConfigurationError extends JobError {
  constructor(
    message: string,
    options?: {
      configKey?: string;
      context?: Record<string, any>;
      originalError?: Error;
    }
  ) {
    super(message, {
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.CRITICAL,
      retryable: false,
      context: {
        ...options?.context,
        configKey: options?.configKey,
      },
      originalError: options?.originalError,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Business logic error (validation, invalid state)
 */
export class BusinessLogicError extends JobError {
  constructor(
    message: string,
    options?: {
      context?: Record<string, any>;
      originalError?: Error;
    }
  ) {
    super(message, {
      category: ErrorCategory.BUSINESS_LOGIC,
      severity: ErrorSeverity.PERMANENT,
      retryable: false,
      context: options?.context,
      originalError: options?.originalError,
    });
    this.name = 'BusinessLogicError';
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends JobError {
  constructor(
    resource: string,
    identifier: string,
    options?: {
      context?: Record<string, any>;
    }
  ) {
    super(`${resource} not found: ${identifier}`, {
      category: ErrorCategory.NOT_FOUND,
      severity: ErrorSeverity.PERMANENT,
      retryable: false,
      context: {
        ...options?.context,
        resource,
        identifier,
      },
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends JobError {
  constructor(
    service: string,
    options: {
      retryAfter?: number;
      limit?: number;
      remaining?: number;
      resetAt?: Date;
      context?: Record<string, any>;
      originalError?: Error;
    }
  ) {
    super(`Rate limit exceeded for ${service}`, {
      category: ErrorCategory.RATE_LIMIT,
      severity: ErrorSeverity.TEMPORARY,
      retryable: true,
      context: {
        ...options.context,
        service,
        retryAfter: options.retryAfter,
        limit: options.limit,
        remaining: options.remaining,
        resetAt: options.resetAt?.toISOString(),
      },
      originalError: options.originalError,
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Network error (DNS, connection)
 */
export class NetworkError extends JobError {
  constructor(
    message: string,
    options?: {
      host?: string;
      context?: Record<string, any>;
      originalError?: Error;
    }
  ) {
    super(message, {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.RECOVERABLE,
      retryable: true,
      context: {
        ...options?.context,
        host: options?.host,
      },
      originalError: options?.originalError,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Convert unknown error to JobError
 */
export function toJobError(error: unknown): JobError {
  if (error instanceof JobError) {
    return error;
  }

  if (error instanceof Error) {
    // Try to categorize by error message/type
    const message = error.message.toLowerCase();

    if (message.includes('rate limit') || message.includes('too many requests')) {
      return new RateLimitError('Unknown', {
        originalError: error,
      });
    }

    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('timeout') ||
      message.includes('dns')
    ) {
      return new NetworkError(error.message, {
        originalError: error,
      });
    }

    if (message.includes('not found') || message.includes('does not exist')) {
      return new NotFoundError('Resource', error.message, {});
    }

    if (message.includes('prisma') || message.includes('database')) {
      return new DatabaseError(error.message, {
        originalError: error,
      });
    }

    if (
      message.includes('env') ||
      message.includes('config') ||
      message.includes('api key') ||
      message.includes('api secret')
    ) {
      return new ConfigurationError(error.message, {
        originalError: error,
      });
    }

    // Default to unknown category
    return new JobError(error.message, {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.RECOVERABLE,
      originalError: error,
    });
  }

  // Non-Error object
  return new JobError(String(error), {
    category: ErrorCategory.UNKNOWN,
    severity: ErrorSeverity.RECOVERABLE,
  });
}

/**
 * Calculate retry delay based on error type and attempt number
 */
export function calculateRetryDelay(error: JobError, attemptsMade: number): number {
  // Non-retryable errors should not have retry delay
  if (!error.retryable) {
    return 0;
  }

  // Rate limit errors - use retryAfter if available
  if (error instanceof RateLimitError) {
    const retryAfter = error.context?.['retryAfter'];
    if (retryAfter && typeof retryAfter === 'number') {
      return retryAfter * 1000; // Convert to milliseconds
    }
    // Default: 60 seconds for rate limits
    return 60000;
  }

  // Exponential backoff for other retryable errors
  const baseDelay = error.severity === ErrorSeverity.TEMPORARY ? 2000 : 5000;
  const maxDelay = 5 * 60 * 1000; // 5 minutes max

  const delay = Math.min(baseDelay * Math.pow(2, attemptsMade), maxDelay);

  // Add jitter (±20%) to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);

  return Math.floor(delay + jitter);
}

/**
 * Determine if error should go to dead letter queue
 */
export function shouldMoveToDeadLetter(error: JobError, attemptsMade: number): boolean {
  // Configuration and critical errors go to DLQ immediately
  if (
    error.severity === ErrorSeverity.CRITICAL ||
    error.category === ErrorCategory.CONFIGURATION
  ) {
    return true;
  }

  // Permanent errors go to DLQ after 1 attempt
  if (error.severity === ErrorSeverity.PERMANENT && attemptsMade >= 1) {
    return true;
  }

  // All other errors go to DLQ after max attempts (5)
  return attemptsMade >= 5;
}
