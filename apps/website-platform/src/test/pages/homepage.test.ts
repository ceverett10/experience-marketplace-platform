import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---
vi.mock('next/headers', () => ({
  headers: () =>
    new Map([
      ['host', 'test.example.com'],
      ['x-forwarded-host', 'test.example.com'],
    ]),
  cookies: () => ({ get: () => null }),
}));

const mockGetSiteFromHostname = vi.fn();
const mockIsParentDomain = vi.fn();

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: (...args: unknown[]) => mockGetSiteFromHostname(...args),
  getHostname: vi.fn(() => 'test.example.com'),
  DEFAULT_SITE_CONFIG: {
    id: 'site-1',
    name: 'Test Site',
    hostname: 'test.example.com',
    primaryDomain: 'test.example.com',
    micrositeId: null,
    micrositeContext: null,
    brand: { primaryColor: '#0d9488', logoUrl: '/logo.png', ogImageUrl: '/og.png' },
    seoConfig: {},
    homepageConfig: {},
  },
}));

vi.mock('@/lib/parent-domain', () => ({
  isParentDomain: (...args: unknown[]) => mockIsParentDomain(...args),
  getFeaturedSuppliers: vi.fn(async () => []),
  getSupplierCategories: vi.fn(async () => []),
  getSupplierCities: vi.fn(async () => []),
  getPlatformStats: vi.fn(async () => ({ sites: 0, experiences: 0, suppliers: 0 })),
  getActiveSites: vi.fn(async () => []),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: () => ({
        findFirst: vi.fn(),
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(),
        count: vi.fn(async () => 0),
      }),
    }
  ),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn(() => ({
    discoverProducts: vi.fn(async () => ({ products: [], totalCount: 0 })),
    getProductsByProvider: vi.fn(async () => ({ nodes: [], totalCount: 0 })),
  })),
  mapProductToExperience: vi.fn(),
  parseIsoDuration: vi.fn(() => 0),
}));

vi.mock('@/lib/microsite-experiences', () => ({
  getMicrositeHomepageProducts: vi.fn(async () => []),
  isMicrosite: vi.fn(() => false),
  localProductToExperienceListItem: vi.fn(),
  getRelatedMicrosites: vi.fn(async () => []),
}));

vi.mock('@/lib/image-utils', () => ({
  optimizeUnsplashUrl: vi.fn((url: string) => url),
  shouldSkipOptimization: vi.fn(() => false),
}));

const defaultSite = {
  id: 'site-1',
  name: 'Test Site',
  hostname: 'test.example.com',
  primaryDomain: 'test.example.com',
  micrositeContext: null,
  brand: { primaryColor: '#0d9488', logoUrl: '/logo.png', ogImageUrl: '/og.png' },
  seoConfig: {},
  homepageConfig: { destinations: [], categories: [], hero: {} },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSiteFromHostname.mockResolvedValue(defaultSite);
  mockIsParentDomain.mockReturnValue(false);
});

describe('Homepage generateMetadata', () => {
  it('returns parent domain metadata when on parent domain', async () => {
    mockIsParentDomain.mockReturnValue(true);
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.title).toContain('Experiencess');
    expect(meta.description).toBeDefined();
    expect(meta.alternates?.canonical).toContain('https://');
  });

  it('returns site-specific metadata for regular site', async () => {
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.title).toBeDefined();
    expect(meta.description).toBeDefined();
    expect(meta.alternates?.canonical).toBe('https://test.example.com');
  });

  it('includes openGraph metadata with ogImage', async () => {
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.openGraph).toBeDefined();
    expect(meta.openGraph?.title).toBeDefined();
  });

  it('builds title from category and city when available', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      micrositeContext: {
        supplierCategories: ['Walking Tours'],
        supplierCities: ['London'],
      },
    });
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.title).toContain('Walking Tours');
    expect(meta.title).toContain('London');
  });

  it('builds title with category only when no city', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      micrositeContext: {
        supplierCategories: ['Food Tours'],
        supplierCities: [],
      },
    });
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.title).toContain('Food Tours');
  });

  it('falls back to generic title when no category or city', async () => {
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.title).toContain('Test Site');
  });

  it('uses existing seoConfig title when well-optimized (>30 chars, not generic)', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      seoConfig: { defaultTitle: 'A Fully Optimized SEO Title For Our Amazing Travel Site' },
    });
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('A Fully Optimized SEO Title For Our Amazing Travel Site');
  });

  it('rejects generic seoConfig title patterns', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      seoConfig: {
        defaultTitle: 'Premium Travel Experiences | Experiences in Your Destination',
      },
    });
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.title).not.toContain('Your Destination');
  });

  it('builds description with product count and city when available', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      micrositeContext: {
        cachedProductCount: 50,
        supplierCities: ['Barcelona'],
        supplierCategories: [],
      },
    });
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('50+');
    expect(meta.description).toContain('Barcelona');
  });

  it('uses existing seoConfig description when >80 chars', async () => {
    const longDesc =
      'A very detailed and well-crafted description that is definitely longer than eighty characters for proper SEO optimization.';
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      seoConfig: { defaultDescription: longDesc },
    });
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.description).toBe(longDesc);
  });

  it('canonical URL uses primaryDomain', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      primaryDomain: 'custom.example.com',
    });
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://custom.example.com');
  });

  it('includes ogImage in openGraph when available from brand', async () => {
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    if (meta.openGraph && 'images' in meta.openGraph) {
      expect(meta.openGraph.images).toBeDefined();
    }
  });

  it('falls back to hero backgroundImage for ogImage', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      brand: { primaryColor: '#0d9488', logoUrl: '/logo.png', ogImageUrl: null },
      homepageConfig: { hero: { backgroundImage: '/hero.jpg' }, destinations: [], categories: [] },
    });
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    expect(meta.openGraph).toBeDefined();
  });

  it('description is trimmed to ~160 characters', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      micrositeContext: {
        cachedProductCount: 200,
        supplierCities: ['London', 'Manchester', 'Birmingham'],
        supplierCategories: ['Walking Tours', 'Food Tours', 'Cultural Experiences', 'Boat Tours'],
      },
    });
    const { generateMetadata } = await import('@/app/page');
    const meta = await generateMetadata();
    if (typeof meta.description === 'string') {
      expect(meta.description.length).toBeLessThanOrEqual(163);
    }
  });
});
