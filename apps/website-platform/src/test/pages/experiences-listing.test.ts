import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---
vi.mock('next/headers', () => ({
  headers: () =>
    new Map([
      ['host', 'test.example.com'],
      ['x-forwarded-host', 'test.example.com'],
    ]),
}));

const mockGetSiteFromHostname = vi.fn();

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: (...args: unknown[]) => mockGetSiteFromHostname(...args),
  DEFAULT_SITE_CONFIG: {
    id: 'default',
    slug: 'default',
    name: 'Experience Marketplace',
    brand: { primaryColor: '#6366f1', logoUrl: null, ogImageUrl: null },
    seoConfig: {},
    homepageConfig: {},
  },
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
  })),
  parseIsoDuration: vi.fn(() => 0),
}));

vi.mock('@/lib/supplier', () => ({
  isTickittoSite: vi.fn(() => false),
}));

vi.mock('@/lib/tickitto', () => ({
  getTickittoClient: vi.fn(() => ({
    searchEvents: vi.fn(async () => ({ events: [] })),
  })),
  mapTickittoEventToExperienceListItem: vi.fn(),
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
});

describe('Experiences listing generateMetadata', () => {
  it('returns default title when no search params', async () => {
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.title).toBe('Experiences & Tours');
  });

  it('returns destination-based title when destination is set', async () => {
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ destination: 'London' }),
    });
    expect(meta.title).toBe('Things to Do in London');
  });

  it('returns search-based title when q param is set', async () => {
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ q: 'Walking Tours' }),
    });
    expect(meta.title).toContain('Walking Tours');
  });

  it('combines search query and destination in title', async () => {
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ q: 'Food Tours', destination: 'Rome' }),
    });
    expect(meta.title).toContain('Food Tours');
    expect(meta.title).toContain('Rome');
  });

  it('builds microsite title from category and city', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      micrositeContext: {
        supplierId: 'sup-1',
        supplierCategories: ['Boat Tours'],
        supplierCities: ['Venice'],
        cachedProductCount: 30,
      },
    });
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.title).toContain('Boat Tours');
    expect(meta.title).toContain('Venice');
  });

  it('uses URL filter params for microsite title when present', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      micrositeContext: {
        supplierId: 'sup-1',
        supplierCategories: ['Walking Tours'],
        supplierCities: ['London'],
        cachedProductCount: 20,
      },
    });
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ cities: 'Paris', categories: 'Food Tours' }),
    });
    expect(meta.title).toContain('Food Tours');
    expect(meta.title).toContain('Paris');
  });

  it('includes canonical URL with search params', async () => {
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ destination: 'London' }),
    });
    expect(meta.alternates?.canonical).toContain('destination=London');
  });

  it('includes page number in canonical when page > 1', async () => {
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ page: '3' }),
    });
    expect(meta.alternates?.canonical).toContain('page=3');
  });

  it('excludes page from canonical when page is 1', async () => {
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ page: '1' }),
    });
    const canonical = meta.alternates?.canonical as string;
    expect(canonical).not.toContain('page=');
  });

  it('includes openGraph with site name suffix', async () => {
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.openGraph?.title).toContain('| Test Site');
  });

  it('includes twitter metadata', async () => {
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.twitter?.card).toBe('summary_large_image');
    expect(meta.twitter?.title).toContain('| Test Site');
  });

  it('trims description to ~160 characters', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      micrositeContext: {
        supplierId: 'sup-1',
        supplierCategories: ['Walking Tours', 'Food Tours', 'Cultural Experiences'],
        supplierCities: ['London'],
        cachedProductCount: 150,
      },
    });
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    if (typeof meta.description === 'string') {
      expect(meta.description.length).toBeLessThanOrEqual(163);
    }
  });

  it('includes cities and categories in canonical for microsites', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      micrositeContext: {
        supplierId: 'sup-1',
        supplierCategories: [],
        supplierCities: [],
      },
    });
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ cities: 'London', categories: 'Tours' }),
    });
    const canonical = meta.alternates?.canonical as string;
    expect(canonical).toContain('cities=London');
    expect(canonical).toContain('categories=Tours');
  });

  it('omits ogImage from openGraph when not available', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      brand: { primaryColor: '#0d9488', logoUrl: null, ogImageUrl: null },
      homepageConfig: { hero: {}, destinations: [], categories: [] },
    });
    const { generateMetadata } = await import('@/app/experiences/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.openGraph).toBeDefined();
    // When no ogImage, images should be absent
    if (meta.openGraph && 'images' in meta.openGraph) {
      expect(meta.openGraph.images).toBeUndefined();
    }
  });
});
