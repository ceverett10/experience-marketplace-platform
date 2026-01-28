import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the modules
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({
    get: vi.fn().mockReturnValue('localhost:3000'),
  })),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn().mockReturnValue({
    id: 'test-site',
    name: 'Test Site',
    holibobPartnerId: 'partner-123',
    brand: { primaryColor: '#6366f1' },
  }),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    getAvailability: vi.fn().mockResolvedValue({
      productId: 'product-1',
      options: [
        {
          id: 'option-1',
          name: 'Morning Tour',
          date: '2025-02-01',
          startTime: '09:00',
          price: 3500,
          currency: 'GBP',
          remainingCapacity: 10,
        },
      ],
    }),
  }),
}));

// Import after mocks
import { GET } from './route';
import { NextRequest } from 'next/server';

describe('Availability API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when productId is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/availability');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('productId is required');
  });

  it('returns 400 when dates are missing', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/availability?productId=test-product'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('dateFrom and dateTo are required');
  });

  it('returns 400 when date format is invalid', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/availability?productId=test-product&dateFrom=invalid&dateTo=2025-02-10'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Dates must be in YYYY-MM-DD format');
  });

  it('returns 400 when dateFrom is in the past', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const request = new NextRequest(
      `http://localhost:3000/api/availability?productId=test-product&dateFrom=${pastDate}&dateTo=${futureDate}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('dateFrom cannot be in the past');
  });

  it('returns 400 when dateTo is before dateFrom', async () => {
    const futureDate1 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const futureDate2 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const request = new NextRequest(
      `http://localhost:3000/api/availability?productId=test-product&dateFrom=${futureDate1}&dateTo=${futureDate2}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('dateTo must be after dateFrom');
  });

  it('returns availability data for valid request', async () => {
    const futureDate1 = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const futureDate2 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const request = new NextRequest(
      `http://localhost:3000/api/availability?productId=test-product&dateFrom=${futureDate1}&dateTo=${futureDate2}&adults=2&children=1`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.options).toBeDefined();
    expect(data.data.options.length).toBeGreaterThan(0);
  });

  it('uses default guest counts when not provided', async () => {
    const futureDate1 = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const futureDate2 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const request = new NextRequest(
      `http://localhost:3000/api/availability?productId=test-product&dateFrom=${futureDate1}&dateTo=${futureDate2}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
