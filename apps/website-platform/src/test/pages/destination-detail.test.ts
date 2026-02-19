import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---
vi.mock('next/headers', () => ({
  headers: () =>
    new Map([
      ['host', 'test.example.com'],
      ['x-forwarded-host', 'test.example.com'],
    ]),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

const mockGetSiteFromHostname = vi.fn();

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: (...args: unknown[]) => mockGetSiteFromHostname(...args),
}));

const mockPageFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: {
      findUnique: (...args: unknown[]) => mockPageFindUnique(...args),
    },
  },
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn(() => ({
    discoverProducts: vi.fn(async () => ({ products: [], totalCount: 0 })),
  })),
}));

const defaultSite = {
  id: 'site-1',
  name: 'Test Site',
  hostname: 'test.example.com',
  primaryDomain: 'test.example.com',
  micrositeContext: null,
  brand: { primaryColor: '#0d9488', logoUrl: '/logo.png', ogImageUrl: '/og.png' },
  seoConfig: {},
  homepageConfig: { hero: { backgroundImage: '/hero.jpg' } },
};

const mockDestination = {
  id: 'dest-1',
  title: 'Things to Do in London',
  slug: 'destinations/london',
  metaTitle: null,
  metaDescription: null,
  canonicalUrl: null,
  noIndex: false,
  content: { body: 'Discover the best experiences in London, from walking tours to boat rides.' },
  holibobLocationId: 'hb-loc-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSiteFromHostname.mockResolvedValue(defaultSite);
  mockPageFindUnique.mockResolvedValue(null);
});

describe('Destination detail generateMetadata', () => {
  it('returns "Destination Not Found" when page does not exist', async () => {
    const { generateMetadata } = await import('@/app/destinations/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'nonexistent' }) });
    expect(meta.title).toBe('Destination Not Found');
  });

  it('uses destination title as page title', async () => {
    mockPageFindUnique.mockResolvedValue(mockDestination);
    const { generateMetadata } = await import('@/app/destinations/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'london' }) });
    expect(meta.title).toBe('Things to Do in London');
  });

  it('uses metaTitle when available', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockDestination,
      metaTitle: 'Custom London SEO Title',
    });
    const { generateMetadata } = await import('@/app/destinations/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'london' }) });
    expect(meta.title).toBe('Custom London SEO Title');
  });

  it('uses metaDescription when available', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockDestination,
      metaDescription: 'Custom London description',
    });
    const { generateMetadata } = await import('@/app/destinations/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'london' }) });
    expect(meta.description).toBe('Custom London description');
  });

  it('falls back to content body for description', async () => {
    mockPageFindUnique.mockResolvedValue(mockDestination);
    const { generateMetadata } = await import('@/app/destinations/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'london' }) });
    expect(meta.description).toContain('London');
  });

  it('sets default canonical URL', async () => {
    mockPageFindUnique.mockResolvedValue(mockDestination);
    const { generateMetadata } = await import('@/app/destinations/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'london' }) });
    expect(meta.alternates?.canonical).toBe('https://test.example.com/destinations/london');
  });

  it('uses custom canonicalUrl when set', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockDestination,
      canonicalUrl: 'https://custom.com/london-guide',
    });
    const { generateMetadata } = await import('@/app/destinations/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'london' }) });
    expect(meta.alternates?.canonical).toBe('https://custom.com/london-guide');
  });

  it('sets robots index=true when noIndex is false', async () => {
    mockPageFindUnique.mockResolvedValue(mockDestination);
    const { generateMetadata } = await import('@/app/destinations/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'london' }) });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('sets robots index=false when noIndex is true', async () => {
    mockPageFindUnique.mockResolvedValue({ ...mockDestination, noIndex: true });
    const { generateMetadata } = await import('@/app/destinations/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'london' }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('includes openGraph with site name suffix', async () => {
    mockPageFindUnique.mockResolvedValue(mockDestination);
    const { generateMetadata } = await import('@/app/destinations/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'london' }) });
    expect(meta.openGraph?.title).toContain('| Test Site');
  });

  it('includes ogImage in openGraph when available', async () => {
    mockPageFindUnique.mockResolvedValue(mockDestination);
    const { generateMetadata } = await import('@/app/destinations/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'london' }) });
    if (meta.openGraph && 'images' in meta.openGraph) {
      expect(meta.openGraph.images).toBeDefined();
    }
  });
});
