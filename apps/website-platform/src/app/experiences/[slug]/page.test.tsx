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
  notFound: vi.fn(),
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
    page: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  },
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn(() => ({
    getProduct: vi.fn(async () => null),
    discoverProducts: vi.fn(async () => ({ products: [], totalCount: 0 })),
    getProductsByProvider: vi.fn(async () => ({ nodes: [], recordCount: 0 })),
  })),
  mapProductToExperience: vi.fn(),
  parseIsoDuration: vi.fn(() => 0),
  optimizeHolibobImageWithPreset: vi.fn((url: string) => url),
}));

vi.mock('@/lib/microsite-experiences', () => ({
  isMicrosite: vi.fn(() => false),
}));

vi.mock('@/lib/supplier', () => ({
  isTickittoSite: vi.fn(() => false),
}));

vi.mock('@/lib/tickitto', () => ({
  getTickittoClient: vi.fn(),
  mapTickittoEventToExperience: vi.fn(),
  mapTickittoEventToExperienceListItem: vi.fn(),
}));

vi.mock('@/lib/booking-analytics', () => ({
  getProductBookingStats: vi.fn(async () => null),
}));

import { generateMetadata } from './page';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient, mapProductToExperience } from '@/lib/holibob';

/**
 * Tests for Experience detail page.tsx
 *
 * Testable items:
 * - getViewerCount: deterministic hash-based viewer count (not exported, tested via replica)
 * - generateMetadata: SEO metadata generation with product data
 */

function createMockSite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'site-1',
    name: 'London Experiences',
    slug: 'london-experiences',
    primaryDomain: 'london-experiences.com',
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

function createMockExperience(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp-123',
    title: 'Thames River Cruise with Afternoon Tea',
    slug: 'exp-123',
    shortDescription: 'Enjoy a relaxing cruise on the Thames with traditional afternoon tea.',
    description: 'Full description of the experience.',
    imageUrl: 'https://example.com/thames.jpg',
    images: ['https://example.com/thames.jpg', 'https://example.com/tea.jpg'],
    price: {
      amount: 55,
      currency: 'GBP',
      formatted: '55.00',
    },
    duration: {
      value: 120,
      unit: 'minutes',
      formatted: '2h',
    },
    rating: {
      average: 4.7,
      count: 342,
    },
    location: {
      name: 'London',
      address: 'Tower Bridge Pier, London',
      lat: 51.5055,
      lng: -0.0754,
    },
    reviews: [],
    categories: [{ id: 'cat-1', name: 'Boat Cruises', slug: 'boat-cruises' }],
    highlights: [],
    inclusions: [],
    exclusions: [],
    cancellationPolicy: 'Free cancellation up to 24 hours before',
    itinerary: [],
    additionalInfo: [],
    languages: ['English'],
    provider: { id: 'prov-1', name: 'Thames Cruises Ltd' },
    ...overrides,
  };
}

describe('Experience detail page.tsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiteFromHostname).mockResolvedValue(createMockSite() as any);
    vi.mocked(mapProductToExperience).mockReturnValue(createMockExperience() as any);
  });

  describe('generateMetadata', () => {
    it('returns "Experience Not Found" when product does not exist', async () => {
      vi.mocked(getHolibobClient).mockReturnValue({
        getProduct: vi.fn(async () => null),
        discoverProducts: vi.fn(async () => ({ products: [], totalCount: 0 })),
        getProductsByProvider: vi.fn(async () => ({ nodes: [], recordCount: 0 })),
      } as any);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'nonexistent-product' }),
      });

      expect(result.title).toBe('Experience Not Found');
    });

    it('returns product title as page title', async () => {
      vi.mocked(getHolibobClient).mockReturnValue({
        getProduct: vi.fn(async () => ({
          id: 'exp-123',
          name: 'Thames River Cruise with Afternoon Tea',
        })),
      } as any);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'exp-123' }),
      });

      expect(result.title).toBe('Thames River Cruise with Afternoon Tea');
    });

    it('returns shortDescription as page description', async () => {
      vi.mocked(getHolibobClient).mockReturnValue({
        getProduct: vi.fn(async () => ({
          id: 'exp-123',
          name: 'Thames River Cruise',
        })),
      } as any);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'exp-123' }),
      });

      expect(result.description).toBe(
        'Enjoy a relaxing cruise on the Thames with traditional afternoon tea.'
      );
    });

    it('sets canonical URL with slug', async () => {
      vi.mocked(getHolibobClient).mockReturnValue({
        getProduct: vi.fn(async () => ({
          id: 'exp-123',
          name: 'Thames River Cruise',
        })),
      } as any);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'exp-123' }),
      });

      expect(result.alternates?.canonical).toBe(
        'https://london-experiences.com/experiences/exp-123'
      );
    });

    it('includes product image in openGraph', async () => {
      vi.mocked(getHolibobClient).mockReturnValue({
        getProduct: vi.fn(async () => ({
          id: 'exp-123',
          name: 'Thames River Cruise',
        })),
      } as any);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'exp-123' }),
      });

      expect(result.openGraph?.images).toEqual(['https://example.com/thames.jpg']);
    });

    it('includes site name in openGraph title', async () => {
      vi.mocked(getHolibobClient).mockReturnValue({
        getProduct: vi.fn(async () => ({
          id: 'exp-123',
          name: 'Thames River Cruise',
        })),
      } as any);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'exp-123' }),
      });

      expect(result.openGraph?.title).toContain('London Experiences');
    });

    it('sets twitter card to summary_large_image', async () => {
      vi.mocked(getHolibobClient).mockReturnValue({
        getProduct: vi.fn(async () => ({
          id: 'exp-123',
          name: 'Thames River Cruise',
        })),
      } as any);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'exp-123' }),
      });

      expect(result.twitter?.card).toBe('summary_large_image');
    });

    it('blocks indexing for Viator products', async () => {
      vi.mocked(mapProductToExperience).mockReturnValue(
        createMockExperience({
          provider: { id: 'prov-2', name: 'Viator Tours' },
        }) as any
      );

      vi.mocked(getHolibobClient).mockReturnValue({
        getProduct: vi.fn(async () => ({
          id: 'exp-123',
          name: 'Viator Tour',
        })),
      } as any);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'exp-123' }),
      });

      expect(result.robots?.index).toBe(false);
      expect(result.robots?.follow).toBe(true);
    });

    it('allows indexing for non-Viator products', async () => {
      vi.mocked(getHolibobClient).mockReturnValue({
        getProduct: vi.fn(async () => ({
          id: 'exp-123',
          name: 'Thames River Cruise',
        })),
      } as any);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'exp-123' }),
      });

      expect(result.robots?.index).toBe(true);
      expect(result.robots?.follow).toBe(true);
    });

    it('handles API error gracefully', async () => {
      vi.mocked(getHolibobClient).mockReturnValue({
        getProduct: vi.fn(async () => {
          throw new Error('API timeout');
        }),
      } as any);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'exp-123' }),
      });

      expect(result.title).toBe('Experience Not Found');
    });
  });

  describe('getViewerCount (logic replica)', () => {
    /**
     * getViewerCount generates a deterministic "viewers" count from a product ID.
     * Range: 3-18 inclusive.
     */
    function getViewerCount(productId: string): number {
      let hash = 0;
      for (let i = 0; i < productId.length; i++) {
        hash = (hash << 5) - hash + productId.charCodeAt(i);
        hash |= 0;
      }
      return 3 + (Math.abs(hash) % 16);
    }

    it('returns deterministic count for same product ID', () => {
      const count1 = getViewerCount('product-abc-123');
      const count2 = getViewerCount('product-abc-123');
      expect(count1).toBe(count2);
    });

    it('returns count in range 3-18', () => {
      const testIds = ['a', 'test', 'product-123', 'very-long-product-identifier-uuid-format', ''];
      for (const id of testIds) {
        const count = getViewerCount(id);
        expect(count).toBeGreaterThanOrEqual(3);
        expect(count).toBeLessThanOrEqual(18);
      }
    });

    it('produces different counts for different IDs', () => {
      const counts = new Set<number>();
      const ids = ['product-1', 'product-2', 'product-3', 'product-4', 'product-5'];
      for (const id of ids) {
        counts.add(getViewerCount(id));
      }
      expect(counts.size).toBeGreaterThanOrEqual(2);
    });

    it('handles empty string', () => {
      const count = getViewerCount('');
      expect(count).toBe(3);
    });
  });
});
