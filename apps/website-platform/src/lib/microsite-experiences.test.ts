import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockProductFindMany, mockProductCount, mockProductFindUnique, mockSupplierFindUnique, mockMicrositeConfigFindMany, mockPageFindMany } =
  vi.hoisted(() => ({
    mockProductFindMany: vi.fn(),
    mockProductCount: vi.fn(),
    mockProductFindUnique: vi.fn(),
    mockSupplierFindUnique: vi.fn(),
    mockMicrositeConfigFindMany: vi.fn(),
    mockPageFindMany: vi.fn(),
  }));

vi.mock('./prisma', () => ({
  prisma: {
    product: {
      findMany: mockProductFindMany,
      findUnique: mockProductFindUnique,
      count: mockProductCount,
    },
    supplier: {
      findUnique: mockSupplierFindUnique,
    },
    micrositeConfig: {
      findMany: mockMicrositeConfigFindMany,
    },
    page: {
      findMany: mockPageFindMany,
    },
  },
}));

import {
  getSupplierProducts,
  getProductById,
  getProductByHolibobId,
  getSupplierById,
  getSupplierByHolibobId,
  getRelatedProducts,
  getMicrositeHomepageProducts,
  isMicrosite,
  localProductToExperienceListItem,
  getRelatedMicrosites,
  getNetworkRelatedBlogPosts,
} from './microsite-experiences';

function makeDbProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    holibobProductId: 'hb-prod-1',
    slug: 'london-tour',
    title: 'London Tour',
    description: 'A great tour',
    shortDescription: 'Great tour',
    priceFrom: 35,
    currency: 'GBP',
    duration: '2 hours',
    city: 'London',
    country: 'GB',
    rating: 4.5,
    reviewCount: 100,
    primaryImageUrl: 'https://example.com/img.jpg',
    images: ['https://example.com/img1.jpg'],
    categories: ['Tours'],
    tags: ['walking'],
    ...overrides,
  };
}

function makeDbSupplier(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sup-1',
    holibobSupplierId: 'hb-sup-1',
    slug: 'london-walks',
    name: 'London Walks',
    description: 'Best walking tours',
    productCount: 10,
    cities: ['London', 'Bath'],
    categories: ['Tours', 'Walking'],
    rating: 4.6,
    reviewCount: 200,
    priceRangeMin: 15,
    priceRangeMax: 99,
    priceCurrency: 'GBP',
    logoUrl: 'https://example.com/logo.png',
    heroImageUrl: 'https://example.com/hero.jpg',
    ...overrides,
  };
}

describe('microsite-experiences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSupplierProducts', () => {
    it('returns products and total count', async () => {
      mockProductFindMany.mockResolvedValue([makeDbProduct()]);
      mockProductCount.mockResolvedValue(1);

      const result = await getSupplierProducts('sup-1');

      expect(result.products).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.products[0].id).toBe('prod-1');
    });

    it('applies default sort and pagination', async () => {
      mockProductFindMany.mockResolvedValue([]);
      mockProductCount.mockResolvedValue(0);

      await getSupplierProducts('sup-1');

      expect(mockProductFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { supplierId: 'sup-1' },
          orderBy: { rating: 'desc' },
          take: 20,
          skip: 0,
        })
      );
    });

    it('passes custom sort and pagination options', async () => {
      mockProductFindMany.mockResolvedValue([]);
      mockProductCount.mockResolvedValue(0);

      await getSupplierProducts('sup-1', {
        limit: 10,
        offset: 5,
        sortBy: 'priceFrom',
        sortOrder: 'asc',
      });

      expect(mockProductFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { priceFrom: 'asc' },
          take: 10,
          skip: 5,
        })
      );
    });

    it('converts priceFrom to number', async () => {
      mockProductFindMany.mockResolvedValue([makeDbProduct({ priceFrom: '35.50' })]);
      mockProductCount.mockResolvedValue(1);

      const result = await getSupplierProducts('sup-1');

      expect(result.products[0].priceFrom).toBe(35.5);
    });

    it('handles null priceFrom', async () => {
      mockProductFindMany.mockResolvedValue([makeDbProduct({ priceFrom: null })]);
      mockProductCount.mockResolvedValue(1);

      const result = await getSupplierProducts('sup-1');

      expect(result.products[0].priceFrom).toBeNull();
    });
  });

  describe('getProductById', () => {
    it('returns product when found', async () => {
      mockProductFindUnique.mockResolvedValue(makeDbProduct());

      const result = await getProductById('prod-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('prod-1');
      expect(mockProductFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prod-1' } })
      );
    });

    it('returns null when not found', async () => {
      mockProductFindUnique.mockResolvedValue(null);

      const result = await getProductById('missing');

      expect(result).toBeNull();
    });

    it('converts priceFrom to number', async () => {
      mockProductFindUnique.mockResolvedValue(makeDbProduct({ priceFrom: '42' }));

      const result = await getProductById('prod-1');

      expect(result!.priceFrom).toBe(42);
    });
  });

  describe('getProductByHolibobId', () => {
    it('queries by holibobProductId', async () => {
      mockProductFindUnique.mockResolvedValue(makeDbProduct());

      const result = await getProductByHolibobId('hb-prod-1');

      expect(result).not.toBeNull();
      expect(mockProductFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { holibobProductId: 'hb-prod-1' } })
      );
    });

    it('returns null when not found', async () => {
      mockProductFindUnique.mockResolvedValue(null);

      const result = await getProductByHolibobId('missing');

      expect(result).toBeNull();
    });
  });

  describe('getSupplierById', () => {
    it('returns supplier when found', async () => {
      mockSupplierFindUnique.mockResolvedValue(makeDbSupplier());

      const result = await getSupplierById('sup-1');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('London Walks');
      expect(result!.cities).toEqual(['London', 'Bath']);
    });

    it('returns null when not found', async () => {
      mockSupplierFindUnique.mockResolvedValue(null);

      const result = await getSupplierById('missing');

      expect(result).toBeNull();
    });

    it('converts price ranges to numbers', async () => {
      mockSupplierFindUnique.mockResolvedValue(
        makeDbSupplier({ priceRangeMin: '15.50', priceRangeMax: '99.99' })
      );

      const result = await getSupplierById('sup-1');

      expect(result!.priceRangeMin).toBe(15.5);
      expect(result!.priceRangeMax).toBe(99.99);
    });

    it('handles null price ranges', async () => {
      mockSupplierFindUnique.mockResolvedValue(
        makeDbSupplier({ priceRangeMin: null, priceRangeMax: null })
      );

      const result = await getSupplierById('sup-1');

      expect(result!.priceRangeMin).toBeNull();
      expect(result!.priceRangeMax).toBeNull();
    });
  });

  describe('getSupplierByHolibobId', () => {
    it('queries by holibobSupplierId', async () => {
      mockSupplierFindUnique.mockResolvedValue(makeDbSupplier());

      const result = await getSupplierByHolibobId('hb-sup-1');

      expect(result).not.toBeNull();
      expect(mockSupplierFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { holibobSupplierId: 'hb-sup-1' } })
      );
    });
  });

  describe('getRelatedProducts', () => {
    it('finds products by supplier, city, or category', async () => {
      const product = makeDbProduct() as any;
      mockProductFindMany.mockResolvedValue([
        makeDbProduct({ id: 'prod-2', title: 'Related Tour' }),
      ]);

      const result = await getRelatedProducts(product, 'sup-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('prod-2');
      expect(mockProductFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ supplierId: 'sup-1', id: { not: 'prod-1' } }),
            ]),
          }),
          take: 8,
        })
      );
    });

    it('respects limit parameter', async () => {
      const product = makeDbProduct() as any;
      mockProductFindMany.mockResolvedValue([]);

      await getRelatedProducts(product, 'sup-1', 4);

      expect(mockProductFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 4 })
      );
    });
  });

  describe('getMicrositeHomepageProducts', () => {
    it('returns supplier products for SUPPLIER entity type', async () => {
      mockProductFindMany.mockResolvedValue([makeDbProduct()]);
      mockProductCount.mockResolvedValue(1);

      const result = await getMicrositeHomepageProducts({
        entityType: 'SUPPLIER',
        supplierId: 'sup-1',
      } as any);

      expect(result).toHaveLength(1);
    });

    it('returns product + related for PRODUCT entity type', async () => {
      const product = makeDbProduct();
      // getProductById call
      mockProductFindUnique
        .mockResolvedValueOnce(product) // getProductById
        .mockResolvedValueOnce({ supplierId: 'sup-1' }); // fullProduct lookup

      // getRelatedProducts call
      mockProductFindMany.mockResolvedValue([makeDbProduct({ id: 'related-1' })]);

      const result = await getMicrositeHomepageProducts({
        entityType: 'PRODUCT',
        productId: 'prod-1',
      } as any);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('prod-1');
      expect(result[1].id).toBe('related-1');
    });

    it('returns empty array for unknown entity type', async () => {
      const result = await getMicrositeHomepageProducts({
        entityType: 'OTHER',
      } as any);

      expect(result).toEqual([]);
    });

    it('returns empty array when product not found', async () => {
      mockProductFindUnique.mockResolvedValue(null);

      const result = await getMicrositeHomepageProducts({
        entityType: 'PRODUCT',
        productId: 'missing',
      } as any);

      expect(result).toEqual([]);
    });

    it('returns just the product when supplier not found', async () => {
      mockProductFindUnique
        .mockResolvedValueOnce(makeDbProduct()) // getProductById
        .mockResolvedValueOnce(null); // fullProduct lookup

      const result = await getMicrositeHomepageProducts({
        entityType: 'PRODUCT',
        productId: 'prod-1',
      } as any);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('prod-1');
    });
  });

  describe('isMicrosite', () => {
    it('returns true when micrositeContext exists', () => {
      expect(isMicrosite({ entityType: 'SUPPLIER' } as any)).toBe(true);
    });

    it('returns false when undefined', () => {
      expect(isMicrosite(undefined)).toBe(false);
    });
  });

  describe('localProductToExperienceListItem', () => {
    it('transforms a local product to experience list format', () => {
      const product = makeDbProduct() as any;
      const item = localProductToExperienceListItem(product);

      expect(item.id).toBe('hb-prod-1');
      expect(item.title).toBe('London Tour');
      expect(item.slug).toBe('hb-prod-1');
      expect(item.shortDescription).toBe('Great tour');
      expect(item.imageUrl).toBe('https://example.com/img.jpg');
      expect(item.price.amount).toBe(35);
      expect(item.price.currency).toBe('GBP');
      expect(item.price.formatted).toContain('35');
      expect(item.duration.formatted).toBe('2 hours');
      expect(item.rating).toEqual({ average: 4.5, count: 100 });
      expect(item.location.name).toBe('London');
    });

    it('uses defaults for null fields', () => {
      const product = makeDbProduct({
        shortDescription: null,
        primaryImageUrl: null,
        priceFrom: null,
        duration: null,
        rating: null,
        city: null,
      }) as any;

      const item = localProductToExperienceListItem(product);

      expect(item.shortDescription).toBe('');
      expect(item.imageUrl).toBe('/placeholder-experience.jpg');
      expect(item.price.amount).toBe(0);
      expect(item.duration.formatted).toBe('Duration varies');
      expect(item.rating).toBeNull();
      expect(item.location.name).toBe('');
    });
  });

  describe('getRelatedMicrosites', () => {
    function makeMicrositeCandidate(overrides: Record<string, unknown> = {}) {
      return {
        id: 'ms-2',
        fullDomain: 'other-tours.example.com',
        siteName: 'Other Tours',
        tagline: 'Best tours',
        cachedProductCount: 10,
        supplier: {
          cities: ['London'],
          categories: ['Tours'],
          productCount: 10,
          rating: 4.5,
        },
        ...overrides,
      };
    }

    it('returns scored and sorted related microsites', async () => {
      mockMicrositeConfigFindMany.mockResolvedValue([
        makeMicrositeCandidate({ id: 'ms-2', supplier: { cities: ['London', 'Bath'], categories: ['Tours', 'Walking'], productCount: 10, rating: 4.5 } }),
        makeMicrositeCandidate({ id: 'ms-3', supplier: { cities: ['Paris'], categories: ['Tours'], productCount: 5, rating: 4.0 } }),
      ]);

      const result = await getRelatedMicrosites('ms-1', ['London'], ['Tours']);

      // ms-2 has shared city London (+3) + shared category Tours (+2) + rating bonus (+1) = 6
      // ms-3 has no shared cities + shared category Tours (+2) + rating bonus (+1) = 3
      expect(result).toHaveLength(2);
      expect(result[0].fullDomain).toBe('other-tours.example.com');
    });

    it('excludes candidates with zero relevance score', async () => {
      // No shared cities, no shared categories, no rating → score = 0
      mockMicrositeConfigFindMany.mockResolvedValue([
        makeMicrositeCandidate({ id: 'ms-2', supplier: { cities: ['Tokyo'], categories: ['Food'], productCount: 5, rating: null } }),
      ]);

      const result = await getRelatedMicrosites('ms-1', ['London'], ['Tours']);

      expect(result).toHaveLength(0);
    });

    it('includes candidates with rating bonus even without shared location/category', async () => {
      // rating bonus = +1, no shared cities/categories → score = 1 > 0 → included
      mockMicrositeConfigFindMany.mockResolvedValue([
        makeMicrositeCandidate({ id: 'ms-2', supplier: { cities: ['Tokyo'], categories: ['Food'], productCount: 5, rating: 4.0 } }),
      ]);

      const result = await getRelatedMicrosites('ms-1', ['London'], ['Tours']);

      expect(result).toHaveLength(1);
    });

    it('respects limit parameter', async () => {
      const candidates = Array.from({ length: 10 }, (_, i) =>
        makeMicrositeCandidate({
          id: `ms-${i + 2}`,
          fullDomain: `site-${i}.com`,
          supplier: { cities: ['London'], categories: ['Tours'], productCount: i + 1, rating: 4.0 },
        })
      );
      mockMicrositeConfigFindMany.mockResolvedValue(candidates);

      const result = await getRelatedMicrosites('ms-1', ['London'], ['Tours'], 3);

      expect(result).toHaveLength(3);
    });

    it('handles candidates without supplier data', async () => {
      mockMicrositeConfigFindMany.mockResolvedValue([
        makeMicrositeCandidate({ supplier: null }),
      ]);

      const result = await getRelatedMicrosites('ms-1', ['London'], ['Tours']);

      // No supplier means no cities/categories to match → score = 0 → filtered out
      expect(result).toHaveLength(0);
    });

    it('uses case-insensitive matching', async () => {
      mockMicrositeConfigFindMany.mockResolvedValue([
        makeMicrositeCandidate({ supplier: { cities: ['london'], categories: ['TOURS'], productCount: 5, rating: 4.0 } }),
      ]);

      const result = await getRelatedMicrosites('ms-1', ['London'], ['tours']);

      expect(result).toHaveLength(1);
    });
  });

  describe('getNetworkRelatedBlogPosts', () => {
    it('returns blog posts from related microsites', async () => {
      mockMicrositeConfigFindMany.mockResolvedValue([
        {
          id: 'ms-2',
          fullDomain: 'other.example.com',
          siteName: 'Other Site',
          status: 'ACTIVE',
          cachedProductCount: 5,
          supplier: { cities: ['London'], categories: ['Tours'] },
        },
      ]);

      mockPageFindMany.mockResolvedValue([
        {
          title: 'Best London Walks',
          slug: 'blog/best-london-walks',
          micrositeId: 'ms-2',
          publishedAt: new Date('2025-06-01'),
        },
      ]);

      const result = await getNetworkRelatedBlogPosts('ms-1', ['London'], ['Tours']);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Best London Walks');
      expect(result[0].siteName).toBe('Other Site');
      expect(result[0].fullDomain).toBe('other.example.com');
    });

    it('deduplicates by microsite (max 1 post per microsite)', async () => {
      mockMicrositeConfigFindMany.mockResolvedValue([
        {
          id: 'ms-2',
          fullDomain: 'other.com',
          siteName: 'Other',
          status: 'ACTIVE',
          cachedProductCount: 5,
          supplier: { cities: ['London'], categories: ['Tours'] },
        },
      ]);

      mockPageFindMany.mockResolvedValue([
        { title: 'Post 1', slug: 'blog/post-1', micrositeId: 'ms-2', publishedAt: new Date('2025-06-01') },
        { title: 'Post 2', slug: 'blog/post-2', micrositeId: 'ms-2', publishedAt: new Date('2025-05-01') },
      ]);

      const result = await getNetworkRelatedBlogPosts('ms-1', ['London'], ['Tours']);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Post 1');
    });

    it('returns empty array when no related microsites', async () => {
      mockMicrositeConfigFindMany.mockResolvedValue([
        {
          id: 'ms-2',
          fullDomain: 'unrelated.com',
          siteName: 'Unrelated',
          status: 'ACTIVE',
          cachedProductCount: 5,
          supplier: { cities: ['Tokyo'], categories: ['Food'] },
        },
      ]);

      const result = await getNetworkRelatedBlogPosts('ms-1', ['London'], ['Tours']);

      expect(result).toEqual([]);
      expect(mockPageFindMany).not.toHaveBeenCalled();
    });

    it('returns empty array on error', async () => {
      mockMicrositeConfigFindMany.mockRejectedValue(new Error('DB error'));

      const result = await getNetworkRelatedBlogPosts('ms-1', ['London'], ['Tours']);

      expect(result).toEqual([]);
    });

    it('filters microsites with score < 2', async () => {
      mockMicrositeConfigFindMany.mockResolvedValue([
        {
          id: 'ms-2',
          fullDomain: 'other.com',
          siteName: 'Other',
          status: 'ACTIVE',
          cachedProductCount: 5,
          // Only 1 shared category = score 2 (city=0, cat=1*2=2) → included
          supplier: { cities: ['Paris'], categories: ['Tours'] },
        },
        {
          id: 'ms-3',
          fullDomain: 'marginal.com',
          siteName: 'Marginal',
          status: 'ACTIVE',
          cachedProductCount: 5,
          // No shared anything = score 0 → excluded
          supplier: { cities: ['Tokyo'], categories: ['Food'] },
        },
      ]);

      mockPageFindMany.mockResolvedValue([
        { title: 'Post', slug: 'blog/post', micrositeId: 'ms-2', publishedAt: new Date() },
      ]);

      const result = await getNetworkRelatedBlogPosts('ms-1', ['London'], ['Tours']);

      // Only ms-2 qualifies (score=2), ms-3 excluded (score=0)
      expect(result).toHaveLength(1);
    });
  });
});
