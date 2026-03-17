import { describe, it, expect } from 'vitest';
import {
  ErrorCategory,
  ErrorSeverity,
  JobError,
  ExternalApiError,
  DatabaseError,
  ConfigurationError,
  BusinessLogicError,
  NotFoundError,
  RateLimitError,
  NetworkError,
  toJobError,
  calculateRetryDelay,
  shouldMoveToDeadLetter,
} from './index';

// ── Error Classes ────────────────────────────────────────────────────

describe('JobError', () => {
  it('sets properties correctly', () => {
    const err = new JobError('test error', {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.RECOVERABLE,
    });
    expect(err.message).toBe('test error');
    expect(err.category).toBe(ErrorCategory.UNKNOWN);
    expect(err.severity).toBe(ErrorSeverity.RECOVERABLE);
    expect(err.retryable).toBe(true); // RECOVERABLE defaults to retryable
    expect(err.name).toBe('JobError');
  });

  it('defaults retryable to false for PERMANENT severity', () => {
    const err = new JobError('perm', {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.PERMANENT,
    });
    expect(err.retryable).toBe(false);
  });

  it('allows explicit retryable override', () => {
    const err = new JobError('forced', {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.PERMANENT,
      retryable: true,
    });
    expect(err.retryable).toBe(true);
  });

  it('preserves context and originalError', () => {
    const original = new Error('root cause');
    const err = new JobError('wrapped', {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.RECOVERABLE,
      context: { table: 'users' },
      originalError: original,
    });
    expect(err.context).toEqual({ table: 'users' });
    expect(err.originalError).toBe(original);
  });

  it('serializes to JSON correctly', () => {
    const original = new Error('root');
    const err = new JobError('test', {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.TEMPORARY,
      context: { service: 'holibob' },
      originalError: original,
    });
    const json = err.toJSON();
    expect(json.name).toBe('JobError');
    expect(json.message).toBe('test');
    expect(json.category).toBe('EXTERNAL_API');
    expect(json.severity).toBe('TEMPORARY');
    expect(json.retryable).toBe(true);
    expect(json.context).toEqual({ service: 'holibob' });
    expect(json.originalError?.name).toBe('Error');
    expect(json.originalError?.message).toBe('root');
  });

  it('serializes without originalError', () => {
    const err = new JobError('no original', {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.RECOVERABLE,
    });
    const json = err.toJSON();
    expect(json.originalError).toBeUndefined();
  });
});

describe('ExternalApiError', () => {
  it('classifies 429 as RATE_LIMIT + TEMPORARY', () => {
    const err = new ExternalApiError('rate limited', {
      service: 'holibob',
      statusCode: 429,
    });
    expect(err.category).toBe(ErrorCategory.RATE_LIMIT);
    expect(err.severity).toBe(ErrorSeverity.TEMPORARY);
    expect(err.retryable).toBe(true);
    expect(err.name).toBe('ExternalApiError');
  });

  it('classifies 500+ as EXTERNAL_API + RECOVERABLE', () => {
    const err = new ExternalApiError('server error', {
      service: 'holibob',
      statusCode: 503,
    });
    expect(err.category).toBe(ErrorCategory.EXTERNAL_API);
    expect(err.severity).toBe(ErrorSeverity.RECOVERABLE);
    expect(err.retryable).toBe(true);
  });

  it('classifies 4xx (not 429) as PERMANENT', () => {
    const err = new ExternalApiError('bad request', {
      service: 'holibob',
      statusCode: 400,
    });
    expect(err.category).toBe(ErrorCategory.EXTERNAL_API);
    expect(err.severity).toBe(ErrorSeverity.PERMANENT);
    expect(err.retryable).toBe(false);
  });

  it('includes service in context', () => {
    const err = new ExternalApiError('fail', {
      service: 'google-ads',
      statusCode: 500,
    });
    expect(err.context?.['service']).toBe('google-ads');
    expect(err.context?.['statusCode']).toBe(500);
  });
});

describe('DatabaseError', () => {
  it('is always RECOVERABLE + retryable', () => {
    const err = new DatabaseError('connection lost');
    expect(err.category).toBe(ErrorCategory.DATABASE);
    expect(err.severity).toBe(ErrorSeverity.RECOVERABLE);
    expect(err.retryable).toBe(true);
    expect(err.name).toBe('DatabaseError');
  });

  it('includes operation in context', () => {
    const err = new DatabaseError('failed', { operation: 'findMany' });
    expect(err.context?.['operation']).toBe('findMany');
  });
});

describe('ConfigurationError', () => {
  it('is CRITICAL + not retryable', () => {
    const err = new ConfigurationError('missing API key');
    expect(err.category).toBe(ErrorCategory.CONFIGURATION);
    expect(err.severity).toBe(ErrorSeverity.CRITICAL);
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('ConfigurationError');
  });
});

describe('BusinessLogicError', () => {
  it('is PERMANENT + not retryable', () => {
    const err = new BusinessLogicError('invalid state');
    expect(err.category).toBe(ErrorCategory.BUSINESS_LOGIC);
    expect(err.severity).toBe(ErrorSeverity.PERMANENT);
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('BusinessLogicError');
  });
});

describe('NotFoundError', () => {
  it('formats message with resource and identifier', () => {
    const err = new NotFoundError('Site', 'site-123');
    expect(err.message).toBe('Site not found: site-123');
    expect(err.category).toBe(ErrorCategory.NOT_FOUND);
    expect(err.severity).toBe(ErrorSeverity.PERMANENT);
    expect(err.retryable).toBe(false);
    expect(err.context?.['resource']).toBe('Site');
    expect(err.context?.['identifier']).toBe('site-123');
  });
});

describe('RateLimitError', () => {
  it('is TEMPORARY + retryable', () => {
    const err = new RateLimitError('holibob', { retryAfter: 60 });
    expect(err.category).toBe(ErrorCategory.RATE_LIMIT);
    expect(err.severity).toBe(ErrorSeverity.TEMPORARY);
    expect(err.retryable).toBe(true);
    expect(err.context?.['retryAfter']).toBe(60);
    expect(err.context?.['service']).toBe('holibob');
  });

  it('includes rate limit details in context', () => {
    const resetAt = new Date('2026-01-01T12:00:00Z');
    const err = new RateLimitError('google', {
      retryAfter: 30,
      limit: 100,
      remaining: 0,
      resetAt,
    });
    expect(err.context?.['limit']).toBe(100);
    expect(err.context?.['remaining']).toBe(0);
    expect(err.context?.['resetAt']).toBe('2026-01-01T12:00:00.000Z');
  });
});

describe('NetworkError', () => {
  it('is RECOVERABLE + retryable', () => {
    const err = new NetworkError('connection refused', { host: 'api.holibob.com' });
    expect(err.category).toBe(ErrorCategory.NETWORK);
    expect(err.severity).toBe(ErrorSeverity.RECOVERABLE);
    expect(err.retryable).toBe(true);
    expect(err.context?.['host']).toBe('api.holibob.com');
  });
});

// ── toJobError ───────────────────────────────────────────────────────

describe('toJobError', () => {
  it('returns JobError instances unchanged', () => {
    const original = new DatabaseError('db fail');
    expect(toJobError(original)).toBe(original);
  });

  it('classifies rate limit errors', () => {
    const err = toJobError(new Error('Rate limit exceeded'));
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.category).toBe(ErrorCategory.RATE_LIMIT);
  });

  it('classifies "too many requests" as rate limit', () => {
    const err = toJobError(new Error('Too many requests'));
    expect(err).toBeInstanceOf(RateLimitError);
  });

  it('classifies network errors', () => {
    const err = toJobError(new Error('ECONNREFUSED'));
    expect(err).toBeInstanceOf(NetworkError);
  });

  it('classifies timeout as network error', () => {
    const err = toJobError(new Error('Request timeout'));
    expect(err).toBeInstanceOf(NetworkError);
  });

  it('classifies DNS errors as network error', () => {
    const err = toJobError(new Error('DNS lookup failed'));
    expect(err).toBeInstanceOf(NetworkError);
  });

  it('classifies "not found" errors', () => {
    const err = toJobError(new Error('Resource not found'));
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('classifies "does not exist" as not found', () => {
    const err = toJobError(new Error('Record does not exist'));
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('classifies Prisma errors', () => {
    const err = toJobError(new Error('Prisma connection pool exhausted'));
    expect(err).toBeInstanceOf(DatabaseError);
  });

  it('classifies database errors', () => {
    const err = toJobError(new Error('Database connection lost'));
    expect(err).toBeInstanceOf(DatabaseError);
  });

  it('classifies config/env errors', () => {
    const err = toJobError(new Error('Missing API key'));
    expect(err).toBeInstanceOf(ConfigurationError);
  });

  it('classifies env var errors', () => {
    const err = toJobError(new Error('ENV variable not set'));
    expect(err).toBeInstanceOf(ConfigurationError);
  });

  it('defaults unknown Error to UNKNOWN + RECOVERABLE', () => {
    const err = toJobError(new Error('Something weird happened'));
    expect(err.category).toBe(ErrorCategory.UNKNOWN);
    expect(err.severity).toBe(ErrorSeverity.RECOVERABLE);
  });

  it('handles non-Error objects', () => {
    const err = toJobError('string error');
    expect(err.category).toBe(ErrorCategory.UNKNOWN);
    expect(err.message).toBe('string error');
  });

  it('handles null/undefined', () => {
    const err = toJobError(null);
    expect(err).toBeInstanceOf(JobError);
    expect(err.message).toBe('null');
  });
});

// ── calculateRetryDelay ──────────────────────────────────────────────

describe('calculateRetryDelay', () => {
  it('returns 0 for non-retryable errors', () => {
    const err = new ConfigurationError('not retryable');
    expect(calculateRetryDelay(err, 1)).toBe(0);
  });

  it('uses retryAfter for RateLimitError when available', () => {
    const err = new RateLimitError('test', { retryAfter: 30 });
    const delay = calculateRetryDelay(err, 1);
    expect(delay).toBe(30000); // 30s in ms
  });

  it('defaults to 60s for RateLimitError without retryAfter', () => {
    const err = new RateLimitError('test', {});
    expect(calculateRetryDelay(err, 1)).toBe(60000);
  });

  it('uses exponential backoff for TEMPORARY errors', () => {
    const err = new NetworkError('timeout');
    // RECOVERABLE base = 5000ms
    // attempt 0: 5000 * 2^0 = 5000 ± jitter
    const delay0 = calculateRetryDelay(err, 0);
    expect(delay0).toBeGreaterThan(3000); // 5000 - 20% jitter
    expect(delay0).toBeLessThan(7000); // 5000 + 20% jitter
  });

  it('caps at 5 minutes max', () => {
    const err = new DatabaseError('connection lost');
    // attempt 20: would be huge without cap
    const delay = calculateRetryDelay(err, 20);
    expect(delay).toBeLessThanOrEqual(5 * 60 * 1000 * 1.2 + 1); // max + jitter tolerance
  });

  it('increases delay with attempt number', () => {
    const err = new DatabaseError('fail');
    // Due to jitter we test multiple samples
    const delays: number[] = [];
    for (let i = 0; i < 20; i++) {
      delays.push(calculateRetryDelay(err, 0));
    }
    const avgDelay0 = delays.reduce((a, b) => a + b, 0) / delays.length;

    const delays3: number[] = [];
    for (let i = 0; i < 20; i++) {
      delays3.push(calculateRetryDelay(err, 3));
    }
    const avgDelay3 = delays3.reduce((a, b) => a + b, 0) / delays3.length;

    expect(avgDelay3).toBeGreaterThan(avgDelay0);
  });
});

// ── shouldMoveToDeadLetter ───────────────────────────────────────────

describe('shouldMoveToDeadLetter', () => {
  it('immediately sends CRITICAL errors to DLQ', () => {
    const err = new ConfigurationError('missing key');
    expect(shouldMoveToDeadLetter(err, 0)).toBe(true);
  });

  it('immediately sends CONFIGURATION errors to DLQ', () => {
    const err = new ConfigurationError('bad config');
    expect(shouldMoveToDeadLetter(err, 0)).toBe(true);
  });

  it('sends PERMANENT errors to DLQ after 1 attempt', () => {
    const err = new BusinessLogicError('invalid state');
    expect(shouldMoveToDeadLetter(err, 0)).toBe(false);
    expect(shouldMoveToDeadLetter(err, 1)).toBe(true);
  });

  it('sends recoverable errors to DLQ after 5 attempts', () => {
    const err = new DatabaseError('connection lost');
    expect(shouldMoveToDeadLetter(err, 3)).toBe(false);
    expect(shouldMoveToDeadLetter(err, 4)).toBe(false);
    expect(shouldMoveToDeadLetter(err, 5)).toBe(true);
  });

  it('does not send temporary errors to DLQ before 5 attempts', () => {
    const err = new RateLimitError('test', {});
    expect(shouldMoveToDeadLetter(err, 0)).toBe(false);
    expect(shouldMoveToDeadLetter(err, 4)).toBe(false);
    expect(shouldMoveToDeadLetter(err, 5)).toBe(true);
  });
});
