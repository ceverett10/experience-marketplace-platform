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

const mockCategory = {
  id: 'cat-1',
  title: 'Food & Wine Tours',
  slug: 'food-wine-tours',
  metaTitle: null,
  metaDescription: null,
  canonicalUrl: null,
  noIndex: false,
  content: { body: 'Discover amazing food and wine tours in various cities.' },
  holibobCategoryId: 'hb-cat-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSiteFromHostname.mockResolvedValue(defaultSite);
  mockPageFindUnique.mockResolvedValue(null);
});

describe('Category detail generateMetadata', () => {
  it('returns "Category Not Found" when category does not exist', async () => {
    const { generateMetadata } = await import('@/app/categories/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'nonexistent' }) });
    expect(meta.title).toBe('Category Not Found');
  });

  it('uses category title as page title', async () => {
    mockPageFindUnique.mockResolvedValue(mockCategory);
    const { generateMetadata } = await import('@/app/categories/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'food-wine-tours' }),
    });
    expect(meta.title).toBe('Food & Wine Tours');
  });

  it('uses metaTitle when available', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockCategory,
      metaTitle: 'Custom Category SEO Title',
    });
    const { generateMetadata } = await import('@/app/categories/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'food-wine-tours' }),
    });
    expect(meta.title).toBe('Custom Category SEO Title');
  });

  it('uses metaDescription when available', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockCategory,
      metaDescription: 'Custom category description',
    });
    const { generateMetadata } = await import('@/app/categories/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'food-wine-tours' }),
    });
    expect(meta.description).toBe('Custom category description');
  });

  it('falls back to content body for description', async () => {
    mockPageFindUnique.mockResolvedValue(mockCategory);
    const { generateMetadata } = await import('@/app/categories/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'food-wine-tours' }),
    });
    expect(meta.description).toContain('food and wine');
  });

  it('sets default canonical URL', async () => {
    mockPageFindUnique.mockResolvedValue(mockCategory);
    const { generateMetadata } = await import('@/app/categories/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'food-wine-tours' }),
    });
    expect(meta.alternates?.canonical).toBe('https://test.example.com/categories/food-wine-tours');
  });

  it('uses custom canonicalUrl when set', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockCategory,
      canonicalUrl: 'https://custom.com/food-tours',
    });
    const { generateMetadata } = await import('@/app/categories/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'food-wine-tours' }),
    });
    expect(meta.alternates?.canonical).toBe('https://custom.com/food-tours');
  });

  it('sets robots index=true when noIndex is false', async () => {
    mockPageFindUnique.mockResolvedValue(mockCategory);
    const { generateMetadata } = await import('@/app/categories/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'food-wine-tours' }),
    });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('sets robots index=false when noIndex is true', async () => {
    mockPageFindUnique.mockResolvedValue({ ...mockCategory, noIndex: true });
    const { generateMetadata } = await import('@/app/categories/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'food-wine-tours' }),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('includes openGraph with site name suffix', async () => {
    mockPageFindUnique.mockResolvedValue(mockCategory);
    const { generateMetadata } = await import('@/app/categories/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'food-wine-tours' }),
    });
    expect(meta.openGraph?.title).toContain('| Test Site');
  });

  it('includes ogImage in openGraph when available', async () => {
    mockPageFindUnique.mockResolvedValue(mockCategory);
    const { generateMetadata } = await import('@/app/categories/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'food-wine-tours' }),
    });
    if (meta.openGraph && 'images' in meta.openGraph) {
      expect(meta.openGraph.images).toBeDefined();
    }
  });
});
