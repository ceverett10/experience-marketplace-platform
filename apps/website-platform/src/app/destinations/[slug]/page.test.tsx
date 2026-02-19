import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => {
        if (key === 'host') return 'test.example.com';
        return null;
      }),
    })
  ),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

const { mockGetSiteFromHostname } = vi.hoisted(() => ({
  mockGetSiteFromHostname: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: mockGetSiteFromHostname,
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn(() => ({
    discoverProducts: vi.fn().mockResolvedValue({ products: [] }),
  })),
}));

const { mockPageFindUnique } = vi.hoisted(() => ({
  mockPageFindUnique: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: { findUnique: mockPageFindUnique },
  },
}));

vi.mock('@/components/content/DestinationPageTemplate', () => ({
  DestinationPageTemplate: () => null,
}));

import { generateMetadata } from './page';

// --- Test data ---

const baseSite = {
  id: 'site-1',
  name: 'Test Site',
  primaryDomain: 'test.example.com',
  micrositeContext: null,
  brand: {
    primaryColor: '#0d9488',
    logoUrl: '/logo.png',
    ogImageUrl: '/og.png',
  },
  seoConfig: {},
  homepageConfig: {
    hero: { backgroundImage: '/hero.jpg' },
  },
};

const baseDestinationPage = {
  id: 'page-1',
  title: 'London Travel Guide',
  metaTitle: 'Best Things to Do in London',
  metaDescription: 'Discover the best experiences and activities in London.',
  noIndex: false,
  canonicalUrl: null,
  holibobLocationId: 'loc-1',
  content: {
    body: 'London is a vibrant city with endless things to explore.',
    structuredData: null,
  },
};

describe('Destinations [slug] page generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
    mockPageFindUnique.mockResolvedValue(baseDestinationPage);
  });

  it('returns "Destination Not Found" when destination does not exist', async () => {
    mockPageFindUnique.mockResolvedValue(null);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'nonexistent' }),
    });

    expect(metadata.title).toBe('Destination Not Found');
  });

  it('uses metaTitle from destination page when available', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.title).toBe('Best Things to Do in London');
  });

  it('falls back to page title when metaTitle is not set', async () => {
    mockPageFindUnique.mockResolvedValue({ ...baseDestinationPage, metaTitle: null });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.title).toBe('London Travel Guide');
  });

  it('uses metaDescription from destination page', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.description).toBe('Discover the best experiences and activities in London.');
  });

  it('falls back to content body substring when metaDescription is not set', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...baseDestinationPage,
      metaDescription: null,
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.description).toBe('London is a vibrant city with endless things to explore.');
  });

  it('sets canonical URL to /destinations/[slug] by default', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.alternates?.canonical).toBe('https://test.example.com/destinations/london');
  });

  it('uses custom canonicalUrl when set on page', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...baseDestinationPage,
      canonicalUrl: 'https://custom.example.com/london-guide',
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.alternates?.canonical).toBe('https://custom.example.com/london-guide');
  });

  it('appends site name to openGraph title', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.openGraph?.title).toBe('Best Things to Do in London | Test Site');
  });

  it('sets robots index true when noIndex is false', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it('sets robots noindex when noIndex is true', async () => {
    mockPageFindUnique.mockResolvedValue({ ...baseDestinationPage, noIndex: true });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('uses ogImageUrl from brand for openGraph images', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.openGraph?.images).toEqual(['/og.png']);
  });

  it('omits images when no OG image is available', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      brand: { ...baseSite.brand, ogImageUrl: null },
      homepageConfig: {},
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.openGraph?.images).toBeUndefined();
  });

  it('sets openGraph type to website', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'london' }),
    });

    expect(metadata.openGraph?.type).toBe('website');
  });
});

// --- Test the getDefaultImage utility logic (replicated from source) ---

function getDefaultImage(
  site: {
    brand?: { ogImageUrl?: string | null; logoUrl?: string | null } | null;
    homepageConfig?: { hero?: { backgroundImage?: string } } | null;
  },
  hostname: string
): string {
  if (site.brand?.ogImageUrl) return site.brand.ogImageUrl;
  if (site.homepageConfig?.hero?.backgroundImage) return site.homepageConfig.hero.backgroundImage;
  if (site.brand?.logoUrl) return site.brand.logoUrl;
  return `https://${hostname}/og-image.png`;
}

describe('getDefaultImage utility', () => {
  it('returns ogImageUrl when available', () => {
    expect(
      getDefaultImage(
        {
          brand: { ogImageUrl: '/og.png', logoUrl: '/logo.png' },
          homepageConfig: { hero: { backgroundImage: '/hero.jpg' } },
        },
        'example.com'
      )
    ).toBe('/og.png');
  });

  it('falls back to hero backgroundImage', () => {
    expect(
      getDefaultImage(
        {
          brand: { ogImageUrl: null, logoUrl: '/logo.png' },
          homepageConfig: { hero: { backgroundImage: '/hero.jpg' } },
        },
        'example.com'
      )
    ).toBe('/hero.jpg');
  });

  it('falls back to logoUrl', () => {
    expect(
      getDefaultImage(
        { brand: { ogImageUrl: null, logoUrl: '/logo.png' }, homepageConfig: {} },
        'example.com'
      )
    ).toBe('/logo.png');
  });

  it('falls back to hostname-based default', () => {
    expect(
      getDefaultImage(
        { brand: { ogImageUrl: null, logoUrl: null }, homepageConfig: {} },
        'example.com'
      )
    ).toBe('https://example.com/og-image.png');
  });
});
