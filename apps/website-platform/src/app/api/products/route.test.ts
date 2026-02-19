import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFindMany, mockCount, mockDiscoverProducts } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockDiscoverProducts: vi.fn(),
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    product: {
      findMany: mockFindMany,
      count: mockCount,
    },
  },
}));

vi.mock('@experience-marketplace/holibob-api', () => ({
  createHolibobClient: vi.fn(() => ({
    discoverProducts: mockDiscoverProducts,
  })),
}));

import { GET } from './route';

describe('Products Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Local DB path (with supplierId)', () => {
    it('fetches products from local DB when supplierId provided', async () => {
      mockFindMany.mockResolvedValue([
        {
          id: 'local-1',
          holibobProductId: 'hb-prod-1',
          slug: 'london-eye-tour',
          title: 'London Eye Tour',
          shortDescription: 'Great views',
          primaryImageUrl: 'https://example.com/eye.jpg',
          priceFrom: 35,
          currency: 'GBP',
          duration: '2 hours',
          rating: 4.5,
          reviewCount: 100,
          city: 'London',
          categories: ['tours', 'attractions'],
        },
      ]);
      mockCount.mockResolvedValue(1);

      const request = new NextRequest(
        'http://localhost:3000/api/products?supplierId=supplier-123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.source).toBe('local');
      expect(data.products).toHaveLength(1);
      expect(data.products[0].id).toBe('hb-prod-1'); // Uses holibobProductId
      expect(data.products[0].title).toBe('London Eye Tour');
      expect(data.products[0].price.amount).toBe(35);
      expect(data.products[0].price.formatted).toBe('£35.00');
    });

    it('applies category filter to local DB', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/products?supplierId=s-1&category=tours'
      );

      await GET(request);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            supplierId: 's-1',
            categories: { has: 'tours' },
          }),
        })
      );
    });

    it('applies city filter (case-insensitive)', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/products?supplierId=s-1&city=london'
      );

      await GET(request);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            city: { contains: 'london', mode: 'insensitive' },
          }),
        })
      );
    });

    it('paginates with first and offset', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(50);

      const request = new NextRequest(
        'http://localhost:3000/api/products?supplierId=s-1&first=10&offset=20'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        })
      );
      expect(data.hasMore).toBe(true); // 20 + 10 < 50
      expect(data.totalCount).toBe(50);
    });

    it('returns hasMore false at end of results', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(25);

      const request = new NextRequest(
        'http://localhost:3000/api/products?supplierId=s-1&first=20&offset=20'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.hasMore).toBe(false); // 20 + 20 >= 25
    });

    it('handles products with null optional fields', async () => {
      mockFindMany.mockResolvedValue([
        {
          id: 'local-2',
          holibobProductId: 'hb-prod-2',
          slug: 'minimal',
          title: 'Minimal Product',
          shortDescription: null,
          primaryImageUrl: null,
          priceFrom: null,
          currency: 'GBP',
          duration: null,
          rating: null,
          reviewCount: 0,
          city: null,
          categories: [],
        },
      ]);
      mockCount.mockResolvedValue(1);

      const request = new NextRequest(
        'http://localhost:3000/api/products?supplierId=s-1'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.products[0].shortDescription).toBe('');
      expect(data.products[0].imageUrl).toBe('/placeholder-experience.jpg');
      expect(data.products[0].price.amount).toBe(0);
      expect(data.products[0].rating).toBeNull();
      expect(data.products[0].location.name).toBe('');
    });

    it('orders by rating desc then reviewCount desc', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/products?supplierId=s-1'
      );

      await GET(request);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
        })
      );
    });
  });

  describe('Holibob API path (without supplierId)', () => {
    it('fetches from Holibob when no supplierId', async () => {
      mockDiscoverProducts.mockResolvedValue({
        products: [
          {
            id: 'hb-1',
            name: 'Big Ben Tour',
            shortDescription: 'Visit Big Ben',
            imageUrl: 'https://example.com/ben.jpg',
            priceFrom: 25,
            currency: 'GBP',
            duration: 90,
            rating: 4.2,
            reviewCount: 50,
            location: { name: 'London' },
          },
        ],
        totalCount: 1,
        pageInfo: { hasNextPage: false },
      });

      const request = new NextRequest('http://localhost:3000/api/products');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.source).toBe('holibob');
      expect(data.products[0].id).toBe('hb-1');
      expect(data.products[0].title).toBe('Big Ben Tour');
    });

    it('applies category filter as categoryIds', async () => {
      mockDiscoverProducts.mockResolvedValue({
        products: [],
        totalCount: 0,
        pageInfo: { hasNextPage: false },
      });

      const request = new NextRequest(
        'http://localhost:3000/api/products?category=cat-1'
      );

      await GET(request);

      expect(mockDiscoverProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryIds: ['cat-1'],
        }),
        expect.any(Object)
      );
    });

    it('applies location as placeIds', async () => {
      mockDiscoverProducts.mockResolvedValue({
        products: [],
        totalCount: 0,
        pageInfo: { hasNextPage: false },
      });

      const request = new NextRequest(
        'http://localhost:3000/api/products?location=place-london'
      );

      await GET(request);

      expect(mockDiscoverProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          placeIds: ['place-london'],
        }),
        expect.any(Object)
      );
    });

    it('formats duration from minutes', async () => {
      mockDiscoverProducts.mockResolvedValue({
        products: [
          { id: 'hb-1', name: 'Tour', duration: 90 },
        ],
        totalCount: 1,
        pageInfo: { hasNextPage: false },
      });

      const request = new NextRequest('http://localhost:3000/api/products');

      const response = await GET(request);
      const data = await response.json();

      expect(data.products[0].duration.formatted).toBe('1h 30m');
    });

    it('uses placeholder for missing image', async () => {
      mockDiscoverProducts.mockResolvedValue({
        products: [{ id: 'hb-1', name: 'Tour' }],
        totalCount: 1,
        pageInfo: { hasNextPage: false },
      });

      const request = new NextRequest('http://localhost:3000/api/products');

      const response = await GET(request);
      const data = await response.json();

      expect(data.products[0].imageUrl).toBe('/placeholder-experience.jpg');
    });
  });

  describe('Error handling', () => {
    it('returns 500 with empty products on error', async () => {
      mockFindMany.mockRejectedValue(new Error('DB connection lost'));

      const request = new NextRequest(
        'http://localhost:3000/api/products?supplierId=s-1'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.products).toEqual([]);
      expect(data.error).toBe('DB connection lost');
    });
  });
});
