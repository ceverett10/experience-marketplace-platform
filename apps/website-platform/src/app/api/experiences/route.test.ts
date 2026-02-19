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
    homepageConfig: {
      popularExperiences: {
        destination: 'London',
        searchTerms: ['walking tours'],
      },
    },
  }),
}));

const { mockDiscoverProducts } = vi.hoisted(() => ({
  mockDiscoverProducts: vi.fn(),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    discoverProducts: mockDiscoverProducts,
  }),
  parseIsoDuration: vi.fn((iso: string) => {
    const match = iso.match(/PT(\d+)M/);
    return match ? parseInt(match[1]!, 10) : 0;
  }),
  optimizeHolibobImageWithPreset: vi.fn((url: string) => url + '?optimized=card'),
}));

import { GET } from './route';

// The route has an in-memory cache (apiCache Map) that persists across tests.
// Each test uses unique query params to generate a unique cache key.
let testCounter = 0;

describe('Experiences Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testCounter++;
  });

  it('returns experiences from Holibob API', async () => {
    mockDiscoverProducts.mockResolvedValue({
      products: [
        {
          id: 'prod-1',
          name: 'London Eye',
          shortDescription: 'Great views',
          imageUrl: 'https://example.com/eye.jpg',
          guidePrice: 35,
          guidePriceCurrency: 'GBP',
          guidePriceFormattedText: '£35.00',
          maxDuration: 'PT60M',
          rating: 4.5,
          location: { name: 'London' },
        },
      ],
      totalCount: 1,
      pageInfo: { hasNextPage: false },
    });

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?destination=London&adults=${testCounter}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.experiences).toHaveLength(1);
    expect(data.experiences[0].id).toBe('prod-1');
    expect(data.experiences[0].title).toBe('London Eye');
    expect(data.experiences[0].price.amount).toBe(35);
    expect(data.hasMore).toBe(false);
  });

  it('falls back to site destination when none provided', async () => {
    mockDiscoverProducts.mockResolvedValue({
      products: [],
      totalCount: 0,
      pageInfo: { hasNextPage: false },
    });

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?q=unique-search-${testCounter}`
    );

    await GET(request);

    expect(mockDiscoverProducts).toHaveBeenCalledWith(
      expect.objectContaining({ freeText: 'London' }),
      expect.any(Object)
    );
  });

  it('uses search term from query param', async () => {
    mockDiscoverProducts.mockResolvedValue({
      products: [],
      totalCount: 0,
      pageInfo: { hasNextPage: false },
    });

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?q=food+tour&adults=${testCounter}`
    );

    await GET(request);

    expect(mockDiscoverProducts).toHaveBeenCalledWith(
      expect.objectContaining({ searchTerm: 'food tour' }),
      expect.any(Object)
    );
  });

  it('handles seenProductIds for pagination', async () => {
    mockDiscoverProducts.mockResolvedValue({
      products: [{ id: 'prod-3', name: 'New Tour' }],
      totalCount: 30,
    });

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?seenProductIds=prod-1,prod-2&adults=${testCounter}`
    );

    await GET(request);

    expect(mockDiscoverProducts).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        seenProductIdList: ['prod-1', 'prod-2'],
      })
    );
  });

  it('optimizes Holibob image URLs', async () => {
    mockDiscoverProducts.mockResolvedValue({
      products: [
        {
          id: 'prod-1',
          name: 'Tour',
          imageUrl: 'https://images.holibob.tech/img.jpg',
        },
      ],
      totalCount: 1,
    });

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?destination=holibob-img-test&adults=${testCounter}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(data.experiences[0].imageUrl).toContain('?optimized=card');
  });

  it('does not optimize non-Holibob images', async () => {
    mockDiscoverProducts.mockResolvedValue({
      products: [
        {
          id: 'prod-1',
          name: 'Tour',
          imageUrl: 'https://other-cdn.com/img.jpg',
        },
      ],
      totalCount: 1,
    });

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?destination=non-holibob-test&adults=${testCounter}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(data.experiences[0].imageUrl).toBe('https://other-cdn.com/img.jpg');
  });

  it('uses placeholder when no image provided', async () => {
    mockDiscoverProducts.mockResolvedValue({
      products: [{ id: 'prod-1', name: 'Tour' }],
      totalCount: 1,
    });

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?destination=placeholder-test&adults=${testCounter}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(data.experiences[0].imageUrl).toBe('/placeholder-experience.jpg');
  });

  it('handles duration from durationText', async () => {
    mockDiscoverProducts.mockResolvedValue({
      products: [
        { id: 'prod-1', name: 'Tour', durationText: 'Approximately 2 hours' },
      ],
      totalCount: 1,
    });

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?destination=duration-test&adults=${testCounter}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(data.experiences[0].duration.formatted).toBe('Approximately 2 hours');
  });

  it('returns hasMore true when full page returned', async () => {
    const products = Array.from({ length: 12 }, (_, i) => ({
      id: `prod-${i}`,
      name: `Tour ${i}`,
    }));
    mockDiscoverProducts.mockResolvedValue({
      products,
      totalCount: 50,
    });

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?destination=hasmore-test&adults=${testCounter}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(data.hasMore).toBe(true);
  });

  it('returns 500 on error with empty experiences', async () => {
    mockDiscoverProducts.mockRejectedValue(new Error('API timeout'));

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?destination=error-test&adults=${testCounter}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.experiences).toEqual([]);
    expect(data.hasMore).toBe(false);
    expect(data.error).toBe('API timeout');
  });

  it('passes adults and children as integers', async () => {
    mockDiscoverProducts.mockResolvedValue({
      products: [],
      totalCount: 0,
    });

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?destination=params-test&adults=3&children=2&startDate=2025-${testCounter}`
    );

    await GET(request);

    expect(mockDiscoverProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        adults: 3,
        children: 2,
      }),
      expect.any(Object)
    );
  });

  it('defaults adults to 2 when not provided', async () => {
    mockDiscoverProducts.mockResolvedValue({
      products: [],
      totalCount: 0,
    });

    const request = new NextRequest(
      `http://localhost:3000/api/experiences?destination=default-adults-test&startDate=2025-${testCounter}`
    );

    await GET(request);

    expect(mockDiscoverProducts).toHaveBeenCalledWith(
      expect.objectContaining({ adults: 2 }),
      expect.any(Object)
    );
  });
});
