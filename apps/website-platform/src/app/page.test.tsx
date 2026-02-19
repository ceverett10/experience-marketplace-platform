import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/headers before importing the module
vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => {
        if (key === 'host') return 'test.example.com';
        if (key === 'x-forwarded-host') return null;
        return null;
      }),
    })
  ),
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(() => undefined),
      set: vi.fn(),
      delete: vi.fn(),
    })
  ),
}));

vi.mock('@/lib/parent-domain', () => ({
  isParentDomain: vi.fn(() => false),
  getFeaturedSuppliers: vi.fn(async () => []),
  getSupplierCategories: vi.fn(async () => []),
  getSupplierCities: vi.fn(async () => []),
  getPlatformStats: vi.fn(async () => ({})),
  getActiveSites: vi.fn(async () => []),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn(),
  DEFAULT_SITE_CONFIG: {
    id: 'default',
    slug: 'default',
    name: 'Experience Marketplace',
    primaryDomain: null,
    holibobPartnerId: 'demo',
    brand: {
      name: 'Experience Marketplace',
      primaryColor: '#6366f1',
      secondaryColor: '#8b5cf6',
      accentColor: '#f59e0b',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      logoUrl: null,
      logoDarkUrl: null,
      faviconUrl: null,
      ogImageUrl: null,
      socialLinks: null,
    },
    seoConfig: null,
    homepageConfig: null,
    micrositeContext: null,
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      count: vi.fn(async () => 0),
    },
    curatedCollection: {
      findMany: vi.fn(async () => []),
    },
  },
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn(() => ({
    discoverProducts: vi.fn(async () => ({ products: [], totalCount: 0 })),
    getProductsByProvider: vi.fn(async () => ({ nodes: [], recordCount: 0 })),
    getProduct: vi.fn(async () => null),
  })),
  mapProductToExperience: vi.fn(),
  parseIsoDuration: vi.fn((val: string) => {
    const match = val.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return 0;
    return parseInt(match[1] || '0') * 60 + parseInt(match[2] || '0');
  }),
  optimizeHolibobImageWithPreset: vi.fn((url: string) => url),
}));

vi.mock('@/lib/image-utils', () => ({
  optimizeUnsplashUrl: vi.fn((url: string) => url),
  shouldSkipOptimization: vi.fn(() => false),
}));

vi.mock('@/lib/microsite-experiences', () => ({
  getMicrositeHomepageProducts: vi.fn(async () => []),
  isMicrosite: vi.fn(() => false),
  localProductToExperienceListItem: vi.fn(),
  getRelatedMicrosites: vi.fn(async () => []),
}));

import { generateMetadata } from './page';
import { getSiteFromHostname } from '@/lib/tenant';
import { isParentDomain } from '@/lib/parent-domain';

/**
 * Tests for Homepage page.tsx
 *
 * Since formatPrice, formatDuration, buildHomepageTitle, and buildHomepageDescription
 * are not exported, we test them indirectly through generateMetadata, which calls
 * buildHomepageTitle and buildHomepageDescription.
 */

function createMockSite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'site-1',
    name: 'London Tours',
    slug: 'london-tours',
    primaryDomain: 'london-tours.example.com',
    holibobPartnerId: 'partner-1',
    brand: {
      primaryColor: '#0d9488',
      logoUrl: '/logo.png',
      ogImageUrl: null,
      faviconUrl: null,
    },
    seoConfig: null,
    homepageConfig: null,
    micrositeContext: null,
    relatedMicrosites: [],
    ...overrides,
  };
}

describe('Homepage page.tsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateMetadata', () => {
    it('returns parent domain metadata when on parent domain', async () => {
      vi.mocked(isParentDomain).mockReturnValue(true);

      const result = await generateMetadata();

      expect(result.title).toContain('Experiencess');
      expect(result.description).toBeDefined();
      expect(result.alternates?.canonical).toContain('test.example.com');
    });

    it('returns site-specific metadata for regular site', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'London Tours',
          primaryDomain: 'london-tours.example.com',
        }) as any
      );

      const result = await generateMetadata();

      expect(result.title).toContain('London Tours');
      expect(result.alternates?.canonical).toBe('https://london-tours.example.com');
    });

    it('uses custom seoConfig title when well-optimized', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'London Tours',
          seoConfig: {
            defaultTitle: 'Best Walking Tours in London - Expert Guided Experiences',
          },
        }) as any
      );

      const result = await generateMetadata();

      expect(result.title).toBe('Best Walking Tours in London - Expert Guided Experiences');
    });

    it('rejects generic seoConfig titles', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'London Tours',
          seoConfig: {
            defaultTitle: 'Premium Travel Experiences | Experiences in Your Destination',
          },
        }) as any
      );

      const result = await generateMetadata();

      expect(result.title).not.toContain('Your Destination');
    });

    it('builds title from category and city when available via micrositeContext', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'MyTours',
          micrositeContext: {
            supplierCategories: ['Walking Tours'],
            supplierCities: ['Edinburgh'],
          },
        }) as any
      );

      const result = await generateMetadata();

      expect(result.title).toContain('Walking Tours');
      expect(result.title).toContain('Edinburgh');
      expect(result.title).toContain('MyTours');
    });

    it('builds title from category only when no city', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'FoodExp',
          micrositeContext: {
            supplierCategories: ['Food Tours'],
            supplierCities: [],
          },
        }) as any
      );

      const result = await generateMetadata();

      expect(result.title).toContain('FoodExp');
      expect(result.title).toContain('Food Tours');
    });

    it('falls back to default title when no context', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'TestSite',
        }) as any
      );

      const result = await generateMetadata();

      expect(result.title).toBe('TestSite - Book Unique Experiences & Tours');
    });

    it('uses existing seoConfig description when long enough', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      const longDescription =
        'This is a very detailed description of our amazing tours and experiences that spans well over eighty characters in length.';
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'TestSite',
          seoConfig: {
            defaultDescription: longDescription,
          },
        }) as any
      );

      const result = await generateMetadata();

      expect(result.description).toBe(longDescription);
    });

    it('generates dynamic description with product count and city', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'TestSite',
          micrositeContext: {
            cachedProductCount: 150,
            supplierCategories: ['Walking Tours', 'Food Tours', 'Boat Cruises'],
            supplierCities: ['London'],
          },
        }) as any
      );

      const result = await generateMetadata();

      expect(result.description).toContain('150+');
      expect(result.description).toContain('London');
      expect(result.description).toContain('Book online today!');
    });

    it('includes ogImage when available', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'TestSite',
          brand: {
            primaryColor: '#0d9488',
            logoUrl: '/logo.png',
            ogImageUrl: 'https://example.com/og.jpg',
          },
        }) as any
      );

      const result = await generateMetadata();

      expect(result.openGraph?.images).toEqual(['https://example.com/og.jpg']);
    });

    it('falls back to hero image for ogImage', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'TestSite',
          brand: {
            primaryColor: '#0d9488',
            logoUrl: '/logo.png',
            ogImageUrl: null,
          },
          homepageConfig: {
            hero: {
              backgroundImage: 'https://example.com/hero.jpg',
            },
          },
        }) as any
      );

      const result = await generateMetadata();

      expect(result.openGraph?.images).toEqual(['https://example.com/hero.jpg']);
    });

    it('sets canonical URL using primaryDomain', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'TestSite',
          primaryDomain: 'my-tours.com',
        }) as any
      );

      const result = await generateMetadata();

      expect(result.alternates?.canonical).toBe('https://my-tours.com');
    });

    it('includes openGraph metadata with correct type', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'TestSite',
          primaryDomain: 'test.com',
        }) as any
      );

      const result = await generateMetadata();

      expect(result.openGraph?.type).toBe('website');
      expect(result.openGraph?.url).toBe('https://test.com');
    });

    it('rejects short seoConfig titles (under 30 chars)', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'TestSite',
          seoConfig: {
            defaultTitle: 'Short Title Here',
          },
        }) as any
      );

      const result = await generateMetadata();

      expect(result.title).not.toBe('Short Title Here');
    });

    it('rejects seoConfig title that equals site name', async () => {
      vi.mocked(isParentDomain).mockReturnValue(false);
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          name: 'TestSite',
          seoConfig: {
            defaultTitle: 'TestSite',
          },
        }) as any
      );

      const result = await generateMetadata();

      expect(result.title).toBe('TestSite - Book Unique Experiences & Tours');
    });
  });
});
