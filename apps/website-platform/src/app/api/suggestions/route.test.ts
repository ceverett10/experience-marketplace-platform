import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn().mockReturnValue('localhost:3000'),
    })
  ),
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    })
  ),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn().mockResolvedValue({
    id: 'test-site',
    name: 'Test Site',
    holibobPartnerId: 'partner-123',
    brand: { primaryColor: '#6366f1' },
  }),
}));

const { mockGetSuggestions } = vi.hoisted(() => ({
  mockGetSuggestions: vi.fn(),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    getSuggestions: mockGetSuggestions,
  }),
}));

import { GET } from './route';

describe('Suggestions Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty suggestions when no search input provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/suggestions');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.destination).toBeNull();
    expect(data.destinations).toEqual([]);
    expect(data.tags).toEqual([]);
    expect(data.searchTerms).toEqual([]);
    expect(mockGetSuggestions).not.toHaveBeenCalled();
  });

  it('calls API when "where" is provided', async () => {
    const mockSuggestions = {
      destination: { id: 'dest-1', name: 'London' },
      destinations: [{ id: 'dest-1', name: 'London' }],
      tags: ['tours'],
      searchTerms: ['walking tour'],
    };
    mockGetSuggestions.mockResolvedValue(mockSuggestions);

    const request = new NextRequest('http://localhost:3000/api/suggestions?where=London');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockSuggestions);
    expect(mockGetSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        freeText: 'London',
        currency: 'GBP',
        adults: 2,
      })
    );
  });

  it('calls API when "what" is provided', async () => {
    mockGetSuggestions.mockResolvedValue({ destinations: [] });

    const request = new NextRequest('http://localhost:3000/api/suggestions?what=food+tour');

    const response = await GET(request);
    expect(response.status).toBe(200);

    expect(mockGetSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        searchTerm: 'food tour',
      })
    );
  });

  it('calls API when "adults" is provided', async () => {
    mockGetSuggestions.mockResolvedValue({ destinations: [] });

    const request = new NextRequest('http://localhost:3000/api/suggestions?adults=3');

    const response = await GET(request);
    expect(response.status).toBe(200);

    expect(mockGetSuggestions).toHaveBeenCalledWith(expect.objectContaining({ adults: 3 }));
  });

  it('calls API when "startDate" is provided', async () => {
    mockGetSuggestions.mockResolvedValue({ destinations: [] });

    const request = new NextRequest('http://localhost:3000/api/suggestions?startDate=2025-06-01');

    const response = await GET(request);
    expect(response.status).toBe(200);

    expect(mockGetSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: '2025-06-01' })
    );
  });

  it('passes all parameters including children and endDate', async () => {
    mockGetSuggestions.mockResolvedValue({ destinations: [] });

    const request = new NextRequest(
      'http://localhost:3000/api/suggestions?where=Paris&what=museum&adults=2&children=1&startDate=2025-06-01&endDate=2025-06-07'
    );

    await GET(request);

    expect(mockGetSuggestions).toHaveBeenCalledWith({
      currency: 'GBP',
      freeText: 'Paris',
      searchTerm: 'museum',
      adults: 2,
      children: 1,
      dateFrom: '2025-06-01',
      dateTo: '2025-06-07',
    });
  });

  it('defaults adults to 2 when not provided', async () => {
    mockGetSuggestions.mockResolvedValue({ destinations: [] });

    const request = new NextRequest('http://localhost:3000/api/suggestions?where=Rome');

    await GET(request);

    expect(mockGetSuggestions).toHaveBeenCalledWith(expect.objectContaining({ adults: 2 }));
  });

  it('returns 500 on error', async () => {
    mockGetSuggestions.mockRejectedValue(new Error('API unavailable'));

    const request = new NextRequest('http://localhost:3000/api/suggestions?where=Tokyo');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('API unavailable');
    expect(data.destinations).toEqual([]);
  });
});
