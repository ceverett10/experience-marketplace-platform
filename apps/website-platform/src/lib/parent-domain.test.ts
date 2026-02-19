import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany, mockCount } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
}));

vi.mock('./prisma', () => ({
  prisma: {
    supplier: { findMany: mockFindMany },
    product: { count: mockCount },
    micrositeConfig: { count: mockCount },
    site: { findMany: mockFindMany },
  },
}));

import {
  isParentDomain,
  getFeaturedSuppliers,
  getSupplierCategories,
  getSupplierCities,
  getPlatformStats,
  getActiveSites,
} from './parent-domain';

describe('parent-domain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isParentDomain', () => {
    it('returns true for experiencess.com', () => {
      expect(isParentDomain('experiencess.com')).toBe(true);
    });

    it('returns true for www.experiencess.com', () => {
      expect(isParentDomain('www.experiencess.com')).toBe(true);
    });

    it('returns true with port number', () => {
      expect(isParentDomain('experiencess.com:3000')).toBe(true);
    });

    it('returns false for microsite subdomains', () => {
      expect(isParentDomain('acme.experiencess.com')).toBe(false);
    });

    it('returns false for custom domains', () => {
      expect(isParentDomain('tours.example.com')).toBe(false);
    });

    it('returns false for localhost', () => {
      expect(isParentDomain('localhost')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isParentDomain('Experiencess.COM')).toBe(true);
    });
  });

  describe('getFeaturedSuppliers', () => {
    it('returns mapped suppliers', async () => {
      mockFindMany.mockResolvedValue([
        {
          id: 'sup-1',
          slug: 'acme-tours',
          name: 'Acme Tours',
          description: 'Best tours',
          productCount: 10,
          cities: ['London'],
          categories: ['tours'],
          rating: 4.5,
          reviewCount: 100,
          logoUrl: 'https://example.com/logo.png',
          heroImageUrl: 'https://example.com/hero.jpg',
          microsite: { fullDomain: 'acme.experiencess.com', status: 'ACTIVE' },
          products: [],
        },
      ]);

      const result = await getFeaturedSuppliers();

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('sup-1');
      expect(result[0]!.name).toBe('Acme Tours');
      expect(result[0]!.logoUrl).toBeNull(); // Generated logos disabled
      expect(result[0]!.heroImageUrl).toBe('https://example.com/hero.jpg');
      expect(result[0]!.micrositeUrl).toBe('https://acme.experiencess.com');
    });

    it('uses product image as hero fallback', async () => {
      mockFindMany.mockResolvedValue([
        {
          id: 'sup-2',
          slug: 'beta',
          name: 'Beta',
          description: null,
          productCount: 5,
          cities: [],
          categories: [],
          rating: null,
          reviewCount: 0,
          logoUrl: null,
          heroImageUrl: null,
          microsite: null,
          products: [{ primaryImageUrl: 'https://example.com/product.jpg' }],
        },
      ]);

      const result = await getFeaturedSuppliers();

      expect(result[0]!.heroImageUrl).toBe('https://example.com/product.jpg');
      expect(result[0]!.micrositeUrl).toBeNull();
    });

    it('returns null micrositeUrl for non-ACTIVE microsites', async () => {
      mockFindMany.mockResolvedValue([
        {
          id: 'sup-3',
          slug: 'gamma',
          name: 'Gamma',
          description: null,
          productCount: 3,
          cities: [],
          categories: [],
          rating: null,
          reviewCount: 0,
          logoUrl: null,
          heroImageUrl: null,
          microsite: { fullDomain: 'gamma.experiencess.com', status: 'PENDING' },
          products: [],
        },
      ]);

      const result = await getFeaturedSuppliers();
      expect(result[0]!.micrositeUrl).toBeNull();
    });

    it('respects limit parameter', async () => {
      mockFindMany.mockResolvedValue([]);

      await getFeaturedSuppliers(5);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });

    it('returns empty array on error', async () => {
      mockFindMany.mockRejectedValue(new Error('DB error'));

      const result = await getFeaturedSuppliers();
      expect(result).toEqual([]);
    });
  });

  describe('getSupplierCategories', () => {
    it('counts and sorts categories across suppliers', async () => {
      mockFindMany.mockResolvedValue([
        { categories: ['Tours', 'Attractions'] },
        { categories: ['Tours', 'Food'] },
        { categories: ['Tours'] },
      ]);

      const result = await getSupplierCategories();

      expect(result[0]!.name).toBe('Tours');
      expect(result[0]!.supplierCount).toBe(3);
      expect(result[0]!.slug).toBe('tours');
      expect(result).toHaveLength(3);
    });

    it('limits to top 12 categories', async () => {
      const categories = Array.from({ length: 15 }, (_, i) => `Cat${i}`);
      mockFindMany.mockResolvedValue([{ categories }]);

      const result = await getSupplierCategories();
      expect(result).toHaveLength(12);
    });

    it('generates slugs with special characters stripped', async () => {
      mockFindMany.mockResolvedValue([
        { categories: ['Food & Drink'] },
      ]);

      const result = await getSupplierCategories();
      expect(result[0]!.slug).toBe('food-drink');
    });

    it('returns empty array on error', async () => {
      mockFindMany.mockRejectedValue(new Error('DB error'));
      const result = await getSupplierCategories();
      expect(result).toEqual([]);
    });
  });

  describe('getSupplierCities', () => {
    it('counts and sorts cities across suppliers', async () => {
      mockFindMany.mockResolvedValue([
        { cities: ['London', 'Paris'] },
        { cities: ['London'] },
      ]);

      const result = await getSupplierCities();

      expect(result[0]!.name).toBe('London');
      expect(result[0]!.supplierCount).toBe(2);
      expect(result[1]!.name).toBe('Paris');
      expect(result[1]!.supplierCount).toBe(1);
    });

    it('respects limit parameter', async () => {
      const cities = Array.from({ length: 20 }, (_, i) => `City${i}`);
      mockFindMany.mockResolvedValue([{ cities }]);

      const result = await getSupplierCities(5);
      expect(result).toHaveLength(5);
    });

    it('returns empty array on error', async () => {
      mockFindMany.mockRejectedValue(new Error('DB error'));
      const result = await getSupplierCities();
      expect(result).toEqual([]);
    });
  });

  describe('getPlatformStats', () => {
    it('returns aggregated platform statistics', async () => {
      // First call: supplier.findMany for suppliers
      mockFindMany.mockResolvedValueOnce([
        { cities: ['London', 'Paris'], categories: ['Tours', 'Food'] },
        { cities: ['London', 'Rome'], categories: ['Tours'] },
      ]);
      // Second call: product.count
      mockCount.mockResolvedValueOnce(150);
      // Third call: micrositeConfig.count
      mockCount.mockResolvedValueOnce(8);

      const result = await getPlatformStats();

      expect(result.totalSuppliers).toBe(2);
      expect(result.totalProducts).toBe(150);
      expect(result.totalCities).toBe(3); // London, Paris, Rome
      expect(result.totalCategories).toBe(2); // Tours, Food
      expect(result.activeMicrosites).toBe(8);
    });

    it('returns zeros on error', async () => {
      mockFindMany.mockRejectedValue(new Error('DB error'));

      const result = await getPlatformStats();

      expect(result).toEqual({
        totalSuppliers: 0,
        totalProducts: 0,
        totalCities: 0,
        totalCategories: 0,
        activeMicrosites: 0,
      });
    });
  });

  describe('getActiveSites', () => {
    it('returns mapped active sites with logoUrl nulled', async () => {
      mockFindMany.mockResolvedValue([
        {
          id: 'site-1',
          slug: 'acme',
          name: 'Acme',
          description: 'Desc',
          primaryDomain: 'acme.com',
          brand: {
            name: 'Acme Brand',
            tagline: 'Best tours',
            logoUrl: 'https://example.com/logo.png',
            primaryColor: '#ff0000',
          },
        },
      ]);

      const result = await getActiveSites();

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Acme');
      expect(result[0]!.brand!.logoUrl).toBeNull(); // Generated logos disabled
      expect(result[0]!.brand!.primaryColor).toBe('#ff0000');
    });

    it('handles sites with null brand', async () => {
      mockFindMany.mockResolvedValue([
        {
          id: 'site-2',
          slug: 'no-brand',
          name: 'No Brand',
          description: null,
          primaryDomain: null,
          brand: null,
        },
      ]);

      const result = await getActiveSites();
      expect(result[0]!.brand).toBeNull();
    });

    it('returns empty array on error', async () => {
      mockFindMany.mockRejectedValue(new Error('DB error'));
      const result = await getActiveSites();
      expect(result).toEqual([]);
    });
  });
});
