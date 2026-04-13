import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
const mockCreate = vi.fn().mockResolvedValue({ id: 'error-1' });
vi.mock('@/lib/prisma', () => ({
  prisma: {
    errorLog: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

// Mock tenant
vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn().mockResolvedValue({ id: 'site-1', name: 'Test Site' }),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(
    new Map([
      ['host', 'localhost:3000'],
      ['x-forwarded-host', 'test-site.com'],
    ])
  ),
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(body: Record<string, unknown>, contentLength?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (contentLength) headers['content-length'] = contentLength;
  return new NextRequest('http://localhost:3000/api/errors/report', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/errors/report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs a client error to the database', async () => {
    const response = await POST(
      makeRequest({
        errorName: 'TypeError',
        errorMessage: "Cannot read properties of null (reading 'optionList')",
        stackTrace: 'at AvailabilityModal.tsx:153',
        context: { component: 'AvailabilityModal', action: 'loadOptions' },
      })
    );

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledOnce();

    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.data.jobType).toBe('CLIENT_ERROR');
    expect(createArgs.data.errorName).toBe('TypeError');
    expect(createArgs.data.errorCategory).toBe('CLIENT');
    expect(createArgs.data.errorSeverity).toBe('LOW');
    expect(createArgs.data.siteId).toBe('site-1');
    expect(createArgs.data.retryable).toBe(false);
  });

  it('returns ok even for invalid payloads', async () => {
    const response = await POST(makeRequest({ invalid: true }));
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects oversized payloads silently', async () => {
    const response = await POST(
      makeRequest(
        { errorName: 'Test', errorMessage: 'msg' },
        '20000' // > 10KB
      )
    );
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns ok even when database write fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB connection failed'));

    const response = await POST(
      makeRequest({
        errorName: 'Error',
        errorMessage: 'Something broke',
      })
    );

    const data = await response.json();
    expect(data.ok).toBe(true);
  });
});
