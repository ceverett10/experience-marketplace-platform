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
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  },
}));

vi.mock('@/lib/microsite-experiences', () => ({
  getRelatedMicrosites: vi.fn(async () => []),
  getNetworkRelatedBlogPosts: vi.fn(async () => []),
}));

import { generateMetadata } from './page';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';

/**
 * Tests for Blog post page.tsx
 *
 * Testable items:
 * - getDefaultImage: Fallback chain for structured data images (private, tested via replica)
 * - generateMetadata: SEO metadata for blog posts
 * - getBlogPost: Query construction for microsites vs regular sites (tested indirectly)
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

function createMockPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    title: 'Top 10 Things to Do in London',
    slug: 'blog/top-10-things-london',
    metaTitle: null,
    metaDescription: 'Discover the best activities and attractions in London.',
    canonicalUrl: null,
    noIndex: false,
    type: 'BLOG',
    status: 'PUBLISHED',
    siteId: 'site-1',
    micrositeId: null,
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-15'),
    content: {
      body: 'London is a vibrant city with endless things to explore. Here are our top 10 picks.',
      qualityScore: 85,
      isAiGenerated: true,
    },
    ...overrides,
  };
}

describe('Blog post page.tsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiteFromHostname).mockResolvedValue(createMockSite() as any);
    vi.mocked(prisma.page.findUnique).mockResolvedValue(createMockPost() as any);
  });

  describe('generateMetadata', () => {
    it('returns post title as page title', async () => {
      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.title).toBe('Top 10 Things to Do in London');
    });

    it('uses metaTitle when available', async () => {
      vi.mocked(prisma.page.findUnique).mockResolvedValue(
        createMockPost({
          metaTitle: 'Best London Activities for Tourists',
        }) as any
      );

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.title).toBe('Best London Activities for Tourists');
    });

    it('returns metaDescription as page description', async () => {
      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.description).toBe('Discover the best activities and attractions in London.');
    });

    it('falls back to body substring when no metaDescription', async () => {
      vi.mocked(prisma.page.findUnique).mockResolvedValue(
        createMockPost({
          metaDescription: null,
        }) as any
      );

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.description).toContain('London is a vibrant city');
    });

    it('returns "Blog Post Not Found" when post does not exist', async () => {
      vi.mocked(prisma.page.findUnique).mockResolvedValue(null);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'nonexistent' }),
      });

      expect(result.title).toBe('Blog Post Not Found');
    });

    it('sets canonical URL from slug', async () => {
      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.alternates?.canonical).toBe(
        'https://london-tours.example.com/blog/top-10-things-london'
      );
    });

    it('uses custom canonical URL when set', async () => {
      vi.mocked(prisma.page.findUnique).mockResolvedValue(
        createMockPost({
          canonicalUrl: 'https://custom-domain.com/blog/london-guide',
        }) as any
      );

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.alternates?.canonical).toBe('https://custom-domain.com/blog/london-guide');
    });

    it('includes site name in openGraph title', async () => {
      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.openGraph?.title).toContain('London Tours');
    });

    it('sets openGraph type to article', async () => {
      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.openGraph?.type).toBe('article');
    });

    it('includes publishedTime and modifiedTime', async () => {
      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.openGraph?.publishedTime).toBe(new Date('2025-06-01').toISOString());
      expect(result.openGraph?.modifiedTime).toBe(new Date('2025-06-15').toISOString());
    });

    it('sets robots index based on noIndex flag', async () => {
      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.robots?.index).toBe(true);
      expect(result.robots?.follow).toBe(true);
    });

    it('sets robots noindex when noIndex is true', async () => {
      vi.mocked(prisma.page.findUnique).mockResolvedValue(createMockPost({ noIndex: true }) as any);

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.robots?.index).toBe(false);
      expect(result.robots?.follow).toBe(false);
    });

    it('includes ogImage from brand config', async () => {
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
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.openGraph?.images).toEqual(['https://example.com/og.jpg']);
    });

    it('falls back to hero image for ogImage', async () => {
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          homepageConfig: {
            hero: {
              backgroundImage: 'https://example.com/hero.jpg',
            },
          },
        }) as any
      );

      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.openGraph?.images).toEqual(['https://example.com/hero.jpg']);
    });

    it('queries with siteId_slug for regular sites', async () => {
      await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(prisma.page.findUnique).toHaveBeenCalledWith({
        where: expect.objectContaining({
          siteId_slug: {
            siteId: 'site-1',
            slug: 'blog/top-10-things-london',
          },
        }),
        include: expect.any(Object),
      });
    });

    it('queries with micrositeId_slug for microsites', async () => {
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({
          micrositeContext: {
            micrositeId: 'ms-1',
            supplierId: 'sup-1',
          },
        }) as any
      );

      await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(prisma.page.findUnique).toHaveBeenCalledWith({
        where: expect.objectContaining({
          micrositeId_slug: {
            micrositeId: 'ms-1',
            slug: 'blog/top-10-things-london',
          },
        }),
        include: expect.any(Object),
      });
    });

    it('sets twitter card to summary_large_image', async () => {
      const result = await generateMetadata({
        params: Promise.resolve({ slug: 'top-10-things-london' }),
      });

      expect(result.twitter?.card).toBe('summary_large_image');
    });
  });

  describe('getDefaultImage (logic replica)', () => {
    /**
     * Fallback chain:
     * 1. brand.ogImageUrl
     * 2. homepageConfig.hero.backgroundImage
     * 3. brand.logoUrl
     * 4. https://{hostname}/og-image.png
     */
    function getDefaultImage(
      site: {
        brand?: { ogImageUrl?: string | null; logoUrl?: string | null } | null;
        homepageConfig?: { hero?: { backgroundImage?: string } } | null;
      },
      hostname: string
    ): string {
      if (site.brand?.ogImageUrl) {
        return site.brand.ogImageUrl;
      }
      if (site.homepageConfig?.hero?.backgroundImage) {
        return site.homepageConfig.hero.backgroundImage;
      }
      if (site.brand?.logoUrl) {
        return site.brand.logoUrl;
      }
      return `https://${hostname}/og-image.png`;
    }

    it('returns ogImageUrl when available', () => {
      const result = getDefaultImage(
        { brand: { ogImageUrl: 'https://example.com/og.jpg', logoUrl: '/logo.png' } },
        'test.com'
      );
      expect(result).toBe('https://example.com/og.jpg');
    });

    it('falls back to hero background image', () => {
      const result = getDefaultImage(
        {
          brand: { ogImageUrl: null, logoUrl: '/logo.png' },
          homepageConfig: { hero: { backgroundImage: 'https://example.com/hero.jpg' } },
        },
        'test.com'
      );
      expect(result).toBe('https://example.com/hero.jpg');
    });

    it('falls back to logo URL', () => {
      const result = getDefaultImage(
        { brand: { ogImageUrl: null, logoUrl: '/logo.png' }, homepageConfig: null },
        'test.com'
      );
      expect(result).toBe('/logo.png');
    });

    it('falls back to generic placeholder', () => {
      const result = getDefaultImage(
        { brand: { ogImageUrl: null, logoUrl: null }, homepageConfig: null },
        'test.com'
      );
      expect(result).toBe('https://test.com/og-image.png');
    });

    it('falls back to generic placeholder when no brand', () => {
      const result = getDefaultImage({ brand: null }, 'test.com');
      expect(result).toBe('https://test.com/og-image.png');
    });
  });
});
