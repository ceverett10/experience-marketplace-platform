import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the modules first before any imports
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({
    get: vi.fn().mockReturnValue('localhost:3000'),
  })),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn().mockResolvedValue({
    id: 'test-site',
    name: 'Test Site',
    holibobPartnerId: 'partner-123',
    brand: { primaryColor: '#6366f1' },
  }),
}));

// Use vi.hoisted to define mocks that can be used in vi.mock factory
const { mockDiscoverAvailability, mockGetAvailabilityList } = vi.hoisted(() => ({
  mockDiscoverAvailability: vi.fn(),
  mockGetAvailabilityList: vi.fn(),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    discoverAvailability: mockDiscoverAvailability,
    getAvailabilityList: mockGetAvailabilityList,
  }),
}));

// Import after mocks
import { GET } from './route';

describe('Availability API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock responses
    mockDiscoverAvailability.mockResolvedValue({
      sessionId: 'session-123',
      nodes: [
        {
          id: 'avail-1',
          date: '2025-02-01',
          guidePriceFormattedText: '£35.00',
          soldOut: false,
        },
      ],
      optionList: {
        nodes: [],
      },
    });
    mockGetAvailabilityList.mockResolvedValue({
      sessionId: 'session-123',
      nodes: [],
      optionList: {
        nodes: [],
      },
    });
  });

  it('returns 400 when productId is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/availability');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('productId is required');
  });

  it('returns availability data when dates are provided', async () => {
    const futureDate1 = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';
    const futureDate2 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';

    const request = new NextRequest(
      `http://localhost:3000/api/availability?productId=test-product&dateFrom=${futureDate1}&dateTo=${futureDate2}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.sessionId).toBeDefined();
    expect(mockDiscoverAvailability).toHaveBeenCalledWith('test-product', futureDate1, futureDate2);
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
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';

    const request = new NextRequest(
      `http://localhost:3000/api/availability?productId=test-product&dateFrom=${pastDate}&dateTo=${futureDate}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('dateFrom cannot be in the past');
  });

  it('returns 400 when dateTo is before dateFrom', async () => {
    const futureDate1 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';
    const futureDate2 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';

    const request = new NextRequest(
      `http://localhost:3000/api/availability?productId=test-product&dateFrom=${futureDate1}&dateTo=${futureDate2}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('dateTo must be after dateFrom');
  });

  it('uses getAvailabilityList for recursive calls with sessionId', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/availability?productId=test-product&sessionId=session-123'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockGetAvailabilityList).toHaveBeenCalledWith('test-product', 'session-123', undefined);
    expect(mockDiscoverAvailability).not.toHaveBeenCalled();
  });

  it('uses getAvailabilityList with optionList', async () => {
    const optionList = [{ id: 'opt-1', value: '10:00' }];
    const request = new NextRequest(
      `http://localhost:3000/api/availability?productId=test-product&optionList=${encodeURIComponent(JSON.stringify(optionList))}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockGetAvailabilityList).toHaveBeenCalledWith('test-product', undefined, optionList);
  });

  it('returns 400 for invalid optionList JSON', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/availability?productId=test-product&optionList=invalid-json'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid optionList JSON format');
  });

  it('returns 500 on fetch error', async () => {
    mockDiscoverAvailability.mockRejectedValue(new Error('Network error'));

    const futureDate1 = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';
    const futureDate2 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';

    const request = new NextRequest(
      `http://localhost:3000/api/availability?productId=test-product&dateFrom=${futureDate1}&dateTo=${futureDate2}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch availability');
  });

  it('returns 404 when product not found', async () => {
    mockDiscoverAvailability.mockRejectedValue(new Error('Product not found'));

    const futureDate1 = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';
    const futureDate2 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';

    const request = new NextRequest(
      `http://localhost:3000/api/availability?productId=nonexistent&dateFrom=${futureDate1}&dateTo=${futureDate2}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Product not found');
  });
});
