import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetProductsByProvider } = vi.hoisted(() => ({
  mockGetProductsByProvider: vi.fn(),
}));

vi.mock('@experience-marketplace/holibob-api', () => ({
  createHolibobClient: vi.fn(() => ({
    getProductsByProvider: mockGetProductsByProvider,
  })),
}));

vi.mock('@/lib/holibob', () => ({
  optimizeHolibobImageWithPreset: vi.fn((url: string, preset: string) => url + `?preset=${preset}`),
  parseIsoDuration: vi.fn((iso: string) => {
    const match = iso.match(/PT(\d+)M/);
    return match ? parseInt(match[1]!, 10) : 0;
  }),
}));

vi.mock('@/lib/duration-utils', () => ({
  DURATION_RANGES: {
    short: { label: 'Under 1 hour', min: 0, max: 60 },
    'half-day': { label: '1-4 hours', min: 60, max: 240 },
    'full-day': { label: '4-8 hours', min: 240, max: 480 },
    'multi-day': { label: '8+ hours', min: 480, max: null },
  } as Record<string, { label: string; min: number; max: number | null }>,
  parseDurationToMinutes: vi.fn(),
  classifyDuration: vi.fn((minutes: number) => {
    if (minutes < 60) return 'short';
    if (minutes < 240) return 'half-day';
    if (minutes < 480) return 'full-day';
    return 'multi-day';
  }),
}));

import { GET } from './route';

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    name: 'London Tour',
    description: 'A nice tour of London',
    imageList: [{ url: 'https://images.holibob.tech/tour.jpg' }],
    guidePrice: 35,
    guidePriceCurrency: 'GBP',
    guidePriceFormattedText: '£35.00',
    maxDuration: 'PT90M',
    reviewRating: 4.5,
    reviewCount: 100,
    categoryList: { nodes: [{ name: 'Tours' }] },
    place: { cityId: 'city-1' },
    ...overrides,
  };
}

describe('Microsite Experiences Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when holibobSupplierId missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/microsite-experiences');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('holibobSupplierId is required');
  });

  it('returns transformed experiences', async () => {
    mockGetProductsByProvider.mockResolvedValue({
      nodes: [makeProduct()],
      recordCount: 1,
      nextPage: null,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.experiences).toHaveLength(1);
    expect(data.experiences[0].id).toBe('prod-1');
    expect(data.experiences[0].title).toBe('London Tour');
    expect(data.experiences[0].price.amount).toBe(35);
    expect(data.experiences[0].price.formatted).toBe('£35.00');
    expect(data.experiences[0].duration.minutes).toBe(90);
    expect(data.experiences[0].rating.average).toBe(4.5);
    expect(data.experiences[0].categories).toEqual(['Tours']);
  });

  it('optimizes Holibob images', async () => {
    mockGetProductsByProvider.mockResolvedValue({
      nodes: [makeProduct()],
      recordCount: 1,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.experiences[0].imageUrl).toContain('?preset=card');
  });

  it('uses placeholder for missing image', async () => {
    mockGetProductsByProvider.mockResolvedValue({
      nodes: [makeProduct({ imageList: null })],
      recordCount: 1,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.experiences[0].imageUrl).toBe('/placeholder-experience.jpg');
  });

  it('passes categories filter to Holibob API', async () => {
    mockGetProductsByProvider.mockResolvedValue({ nodes: [], recordCount: 0 });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1&categories=cat-1,cat-2'
    );
    await GET(request);

    expect(mockGetProductsByProvider).toHaveBeenCalledWith(
      'sup-1',
      expect.objectContaining({
        filters: { categoryIds: ['cat-1', 'cat-2'] },
      })
    );
  });

  it('passes search filter to Holibob API', async () => {
    mockGetProductsByProvider.mockResolvedValue({ nodes: [], recordCount: 0 });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1&search=walking'
    );
    await GET(request);

    expect(mockGetProductsByProvider).toHaveBeenCalledWith(
      'sup-1',
      expect.objectContaining({
        filters: { search: 'walking' },
      })
    );
  });

  it('applies client-side price filter', async () => {
    mockGetProductsByProvider.mockResolvedValue({
      nodes: [
        makeProduct({ id: 'p1', guidePrice: 20 }),
        makeProduct({ id: 'p2', guidePrice: 50 }),
        makeProduct({ id: 'p3', guidePrice: 100 }),
      ],
      recordCount: 3,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1&priceMin=25&priceMax=75'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.experiences).toHaveLength(1);
    expect(data.experiences[0].id).toBe('p2');
  });

  it('applies client-side duration filter', async () => {
    mockGetProductsByProvider.mockResolvedValue({
      nodes: [
        makeProduct({ id: 'p1', maxDuration: 'PT30M' }),
        makeProduct({ id: 'p2', maxDuration: 'PT120M' }),
      ],
      recordCount: 2,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1&duration=short'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.experiences).toHaveLength(1);
    expect(data.experiences[0].id).toBe('p1');
  });

  it('applies client-side rating filter', async () => {
    mockGetProductsByProvider.mockResolvedValue({
      nodes: [
        makeProduct({ id: 'p1', reviewRating: 4.8, reviewCount: 50 }),
        makeProduct({ id: 'p2', reviewRating: 3.5, reviewCount: 20 }),
        makeProduct({ id: 'p3', reviewRating: null }),
      ],
      recordCount: 3,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1&minRating=4.0'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.experiences).toHaveLength(1);
    expect(data.experiences[0].id).toBe('p1');
  });

  it('computes filter counts from full result set', async () => {
    mockGetProductsByProvider.mockResolvedValue({
      nodes: [
        makeProduct({ id: 'p1', guidePrice: 30, categoryList: { nodes: [{ name: 'Tours' }] } }),
        makeProduct({ id: 'p2', guidePrice: 60, categoryList: { nodes: [{ name: 'Tours' }, { name: 'Food' }] } }),
      ],
      recordCount: 2,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.filterCounts.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Tours', count: 2 }),
        expect.objectContaining({ name: 'Food', count: 1 }),
      ])
    );
  });

  it('returns hasMore when next page exists', async () => {
    mockGetProductsByProvider.mockResolvedValue({
      nodes: Array.from({ length: 20 }, (_, i) => makeProduct({ id: `p-${i}` })),
      recordCount: 50,
      nextPage: 2,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.hasMore).toBe(true);
    expect(data.totalCount).toBe(50);
  });

  it('fetches larger batch when client filters active', async () => {
    mockGetProductsByProvider.mockResolvedValue({
      nodes: [],
      recordCount: 0,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1&priceMin=10'
    );
    await GET(request);

    expect(mockGetProductsByProvider).toHaveBeenCalledWith(
      'sup-1',
      expect.objectContaining({
        pageSize: 100, // Math.max(20 * 3, 100)
        page: 1, // Always page 1 when client filtering
      })
    );
  });

  it('handles null product fields gracefully', async () => {
    mockGetProductsByProvider.mockResolvedValue({
      nodes: [makeProduct({
        name: null,
        description: null,
        imageList: [],
        guidePrice: null,
        guidePriceCurrency: null,
        guidePriceFormattedText: null,
        maxDuration: null,
        reviewRating: null,
        categoryList: null,
        place: null,
      })],
      recordCount: 1,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.experiences[0].title).toBe('Experience');
    expect(data.experiences[0].price.amount).toBe(0);
    expect(data.experiences[0].rating).toBeNull();
    expect(data.experiences[0].categories).toEqual([]);
  });

  it('returns 500 on error', async () => {
    mockGetProductsByProvider.mockRejectedValue(new Error('API timeout'));

    const request = new NextRequest(
      'http://localhost:3000/api/microsite-experiences?holibobSupplierId=sup-1'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.experiences).toEqual([]);
    expect(data.error).toBe('API timeout');
    expect(data.filterCounts.categories).toEqual([]);
  });
});
