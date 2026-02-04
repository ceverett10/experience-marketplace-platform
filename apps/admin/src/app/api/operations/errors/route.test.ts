import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCircuitBreakers, mockErrorTracking } from '@/test/mocks/jobs';

vi.mock('@experience-marketplace/jobs', () => ({
  errorTracking: mockErrorTracking,
  circuitBreakers: mockCircuitBreakers,
}));

import { GET, POST } from './route';

function createRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

describe('GET /api/operations/errors', () => {
  it('returns paginated error logs with health status', async () => {
    mockErrorTracking.getErrorLogs.mockResolvedValue({
      entries: [{ id: 'err-1', errorMessage: 'Timeout', errorCategory: 'NETWORK' }],
      page: 1,
      limit: 25,
      total: 1,
    });
    mockErrorTracking.getErrorStats.mockResolvedValue({
      total: 5,
      criticalCount: 0,
      retryableCount: 3,
      byCategory: { NETWORK: 3, VALIDATION: 2 },
      byType: { CONTENT_GENERATE: 5 },
    });
    mockCircuitBreakers.getAllStatus.mockResolvedValue({});

    const response = await GET(createRequest('http://localhost/api/operations/errors'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.health).toBe('healthy');
    expect(data.errors).toHaveLength(1);
    expect(data.summary.totalErrors).toBe(5);
    expect(data.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 });
  });

  it('returns single error by id', async () => {
    const errorEntry = {
      id: 'err-1',
      errorMessage: 'Connection refused',
      errorCategory: 'NETWORK',
      stackTrace: 'Error: ...',
    };
    mockErrorTracking.getErrorLog.mockResolvedValue(errorEntry);

    const response = await GET(createRequest('http://localhost/api/operations/errors?id=err-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('err-1');
  });

  it('returns 404 when error id not found', async () => {
    mockErrorTracking.getErrorLog.mockResolvedValue(null);

    const response = await GET(
      createRequest('http://localhost/api/operations/errors?id=nonexistent')
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Error log not found');
  });

  it('reports critical health when critical errors exist', async () => {
    mockErrorTracking.getErrorLogs.mockResolvedValue({
      entries: [],
      page: 1,
      limit: 25,
      total: 0,
    });
    mockErrorTracking.getErrorStats.mockResolvedValue({
      total: 10,
      criticalCount: 2,
      retryableCount: 5,
      byCategory: {},
      byType: {},
    });
    mockCircuitBreakers.getAllStatus.mockResolvedValue({});

    const response = await GET(createRequest('http://localhost/api/operations/errors'));
    const data = await response.json();

    expect(data.health).toBe('critical');
  });

  it('reports degraded health when circuit breakers are open', async () => {
    mockErrorTracking.getErrorLogs.mockResolvedValue({
      entries: [],
      page: 1,
      limit: 25,
      total: 0,
    });
    mockErrorTracking.getErrorStats.mockResolvedValue({
      total: 3,
      criticalCount: 0,
      retryableCount: 3,
      byCategory: {},
      byType: {},
    });
    mockCircuitBreakers.getAllStatus.mockResolvedValue({
      holibob: { state: 'OPEN', metrics: { failures: 5, successes: 0 } },
    });

    const response = await GET(createRequest('http://localhost/api/operations/errors'));
    const data = await response.json();

    expect(data.health).toBe('degraded');
  });

  it('passes filter parameters correctly', async () => {
    mockErrorTracking.getErrorLogs.mockResolvedValue({
      entries: [],
      page: 1,
      limit: 25,
      total: 0,
    });
    mockErrorTracking.getErrorStats.mockResolvedValue({
      total: 0,
      criticalCount: 0,
      retryableCount: 0,
      byCategory: {},
      byType: {},
    });
    mockCircuitBreakers.getAllStatus.mockResolvedValue({});

    await GET(
      createRequest(
        'http://localhost/api/operations/errors?jobType=CONTENT_GENERATE&severity=HIGH&page=2&limit=10'
      )
    );

    expect(mockErrorTracking.getErrorLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'CONTENT_GENERATE',
        severity: 'HIGH',
        page: 2,
        limit: 10,
      })
    );
  });

  it('returns 500 when error tracking fails', async () => {
    mockErrorTracking.getErrorLogs.mockRejectedValue(new Error('Redis down'));

    const response = await GET(createRequest('http://localhost/api/operations/errors'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch error logs');
  });
});

describe('POST /api/operations/errors', () => {
  it('resets a specific circuit breaker', async () => {
    const mockBreaker = { reset: vi.fn().mockResolvedValue(undefined) };
    mockCircuitBreakers.getBreaker.mockReturnValue(mockBreaker);

    const response = await POST(
      createRequest('http://localhost/api/operations/errors', {
        method: 'POST',
        body: JSON.stringify({ action: 'reset-circuit-breaker', service: 'holibob' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockCircuitBreakers.getBreaker).toHaveBeenCalledWith('holibob');
    expect(mockBreaker.reset).toHaveBeenCalled();
  });

  it('resets all circuit breakers', async () => {
    mockCircuitBreakers.resetAll.mockResolvedValue(undefined);

    const response = await POST(
      createRequest('http://localhost/api/operations/errors', {
        method: 'POST',
        body: JSON.stringify({ action: 'reset-all-circuit-breakers' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(mockCircuitBreakers.resetAll).toHaveBeenCalled();
  });

  it('cleans up old errors', async () => {
    mockErrorTracking.cleanupOldErrors.mockResolvedValue(42);

    const response = await POST(
      createRequest('http://localhost/api/operations/errors', {
        method: 'POST',
        body: JSON.stringify({ action: 'cleanup-old-errors', retentionDays: 14 }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.deletedCount).toBe(42);
    expect(mockErrorTracking.cleanupOldErrors).toHaveBeenCalledWith(14);
  });

  it('uses default retention of 30 days', async () => {
    mockErrorTracking.cleanupOldErrors.mockResolvedValue(0);

    await POST(
      createRequest('http://localhost/api/operations/errors', {
        method: 'POST',
        body: JSON.stringify({ action: 'cleanup-old-errors' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(mockErrorTracking.cleanupOldErrors).toHaveBeenCalledWith(30);
  });

  it('returns 400 for invalid action', async () => {
    const response = await POST(
      createRequest('http://localhost/api/operations/errors', {
        method: 'POST',
        body: JSON.stringify({ action: 'invalid' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid action');
  });
});
