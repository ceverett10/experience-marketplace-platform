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
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
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
    product: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    page: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  },
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn(() => ({
    discoverProducts: vi.fn(async () => ({ products: [], totalCount: 0 })),
    getProductsByProvider: vi.fn(async () => ({ nodes: [], recordCount: 0 })),
  })),
  parseIsoDuration: vi.fn((val: string) => {
    const match = val.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return 0;
    return parseInt(match[1] || '0') * 60 + parseInt(match[2] || '0');
  }),
}));

vi.mock('@/lib/supplier', () => ({
  isTickittoSite: vi.fn(() => false),
}));

vi.mock('@/lib/tickitto', () => ({
  getTickittoClient: vi.fn(() => ({
    searchEvents: vi.fn(async () => ({ events: [], totalCount: 0 })),
  })),
  mapTickittoEventToExperienceListItem: vi.fn(),
}));

import { generateMetadata } from './page';
import { getSiteFromHostname } from '@/lib/tenant';

/**
 * Tests for Experiences listing page.tsx
 *
 * Focus areas:
 * - generateMetadata with different search params and site configurations
 * - Title/description generation for regular sites vs microsites
 * - Canonical URL construction with pagination
 */

function createMockSite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'site-1',
    name: 'Test Tours',
    slug: 'test-tours',
    primaryDomain: 'test-tours.example.com',
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

describe('Experiences listing page.tsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiteFromHostname).mockResolvedValue(createMockSite() as any);
  });

  describe('generateMetadata', () => {
    it('returns default title when no search params', async () => {
      const result = await generateMetadata({
        searchParams: Promise.resolve({}),
      });

      expect(result.title).toBe('Experiences & Tours');
      expect(result.description).toContain('Browse and book unique experiences');
    });

    it('includes destination in title', async () => {
      const result = await generateMetadata({
        searchParams: Promise.resolve({ destination: 'London' }),
      });

      expect(result.title).toBe('Things to Do in London');
      expect(result.description).toContain('London');
    });

    it('includes search query in title', async () => {
      const result = await generateMetadata({
        searchParams: Promise.resolve({ q: 'Food Tours' }),
      });

      expect(result.title).toBe('Food Tours - Experiences');
    });

    it('includes both query and destination in title', async () => {
      const result = await generateMetadata({
        searchParams: Promise.resolve({ q: 'Walking Tours', destination: 'Edinburgh' }),
      });

      expect(result.title).toBe('Walking Tours - Edinburgh');
      expect(result.description).toContain('walking tours');
      expect(result.description).toContain('Edinburgh');
    });

    it('builds canonical URL without params when no filters', async () => {
      const result = await generateMetadata({
        searchParams: Promise.resolve({}),
      });

      expect(result.alternates?.canonical).toBe('https://test-tours.example.com/experiences');
    });

    it('builds canonical URL with destination param', async () => {
      const result = await generateMetadata({
        searchParams: Promise.resolve({ destination: 'Paris' }),
      });

      expect(result.alternates?.canonical).toBe(
        'https://test-tours.example.com/experiences?destination=Paris'
      );
    });

    it('includes page number in canonical for paginated pages', async () => {
      const result = await generateMetadata({
        searchParams: Promise.resolve({ page: '3' }),
      });

      expect(result.alternates?.canonical).toBe(
        'https://test-tours.example.com/experiences?page=3'
      );
    });

    it('does not include page=1 in canonical', async () => {
      const result = await generateMetadata({
        searchParams: Promise.resolve({ page: '1' }),
      });

      expect(result.alternates?.canonical).toBe('https://test-tours.example.com/experiences');
    });

    it('adds site name to openGraph title', async () => {
      const result = await generateMetadata({
        searchParams: Promise.resolve({}),
      });

      expect(result.openGraph?.title).toContain('Test Tours');
    });

    it('sets twitter card to summary_large_image', async () => {
      const result = await generateMetadata({
        searchParams: Promise.resolve({}),
      });

      expect(result.twitter?.card).toBe('summary_large_image');
    });

    it('uses location param as destination fallback', async () => {
      const result = await generateMetadata({
        searchParams: Promise.resolve({ location: 'Barcelona' }),
      });

      expect(result.title).toBe('Things to Do in Barcelona');
    });

    it('includes ogImage when brand has ogImageUrl', async () => {
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          brand: {
            primaryColor: '#0d9488',
            logoUrl: '/logo.png',
            ogImageUrl: 'https://example.com/og.jpg',
            faviconUrl: null,
          },
        }) as any
      );

      const result = await generateMetadata({
        searchParams: Promise.resolve({}),
      });

      expect(result.openGraph?.images).toEqual(['https://example.com/og.jpg']);
    });

    describe('microsite metadata', () => {
      function createMicrositeConfig(overrides: Record<string, unknown> = {}) {
        return createMockSite({
          micrositeContext: {
            supplierId: 'sup-1',
            holibobSupplierId: 'hb-sup-1',
            micrositeId: 'ms-1',
            supplierCategories: ['Walking Tours', 'Food Tours'],
            supplierCities: ['London', 'Edinburgh'],
            cachedProductCount: 50,
            layoutConfig: { resolvedType: 'CATALOG' },
            ...overrides,
          },
        });
      }

      it('builds microsite title with category and city', async () => {
        vi.mocked(getSiteFromHostname).mockResolvedValue(createMicrositeConfig() as any);

        const result = await generateMetadata({
          searchParams: Promise.resolve({}),
        });

        expect(result.title).toBe('Walking Tours in London');
      });

      it('builds microsite title with category only', async () => {
        vi.mocked(getSiteFromHostname).mockResolvedValue(
          createMicrositeConfig({ supplierCities: [] }) as any
        );

        const result = await generateMetadata({
          searchParams: Promise.resolve({}),
        });

        expect(result.title).toBe('Walking Tours & Experiences');
      });

      it('builds microsite title with city only', async () => {
        vi.mocked(getSiteFromHostname).mockResolvedValue(
          createMicrositeConfig({ supplierCategories: [] }) as any
        );

        const result = await generateMetadata({
          searchParams: Promise.resolve({}),
        });

        expect(result.title).toBe('Things to Do in London');
      });

      it('includes product count in microsite description', async () => {
        vi.mocked(getSiteFromHostname).mockResolvedValue(createMicrositeConfig() as any);

        const result = await generateMetadata({
          searchParams: Promise.resolve({}),
        });

        expect(result.description).toContain('50+');
      });

      it('includes city filter in canonical for microsite', async () => {
        vi.mocked(getSiteFromHostname).mockResolvedValue(createMicrositeConfig() as any);

        const result = await generateMetadata({
          searchParams: Promise.resolve({ cities: 'London' }),
        });

        expect(result.alternates?.canonical).toContain('cities=London');
      });

      it('includes category filter in canonical for microsite', async () => {
        vi.mocked(getSiteFromHostname).mockResolvedValue(createMicrositeConfig() as any);

        const result = await generateMetadata({
          searchParams: Promise.resolve({ categories: 'Food Tours' }),
        });

        expect(result.alternates?.canonical).toContain('categories=Food+Tours');
      });

      it('uses URL city filter over default in title', async () => {
        vi.mocked(getSiteFromHostname).mockResolvedValue(createMicrositeConfig() as any);

        const result = await generateMetadata({
          searchParams: Promise.resolve({ cities: 'Edinburgh' }),
        });

        expect(result.title).toContain('Edinburgh');
      });

      it('uses generic title for multiple URL cities', async () => {
        vi.mocked(getSiteFromHostname).mockResolvedValue(createMicrositeConfig() as any);

        const result = await generateMetadata({
          searchParams: Promise.resolve({ cities: 'London,Edinburgh' }),
        });

        expect(result.title).toBeDefined();
      });
    });
  });
});
