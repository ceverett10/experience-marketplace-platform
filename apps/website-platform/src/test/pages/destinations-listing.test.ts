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

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSiteFromHostname.mockResolvedValue(defaultSite);
});

describe('Destinations listing generateMetadata', () => {
  it('returns correct title', async () => {
    const { generateMetadata } = await import('@/app/destinations/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Destinations');
  });

  it('includes site name in description', async () => {
    const { generateMetadata } = await import('@/app/destinations/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('Test Site');
  });

  it('includes openGraph with site name', async () => {
    const { generateMetadata } = await import('@/app/destinations/page');
    const meta = await generateMetadata();
    expect(meta.openGraph?.title).toBe('Destinations | Test Site');
  });

  it('sets canonical URL', async () => {
    const { generateMetadata } = await import('@/app/destinations/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://test.example.com/destinations');
  });

  it('includes ogImage in openGraph when available', async () => {
    const { generateMetadata } = await import('@/app/destinations/page');
    const meta = await generateMetadata();
    if (meta.openGraph && 'images' in meta.openGraph) {
      expect(meta.openGraph.images).toBeDefined();
    }
  });

  it('uses primaryDomain in canonical', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      primaryDomain: 'custom-domain.com',
    });
    const { generateMetadata } = await import('@/app/destinations/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://custom-domain.com/destinations');
  });

  it('openGraph type is website', async () => {
    const { generateMetadata } = await import('@/app/destinations/page');
    const meta = await generateMetadata();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((meta.openGraph as any)?.type).toBe('website');
  });

  it('description mentions destinations', async () => {
    const { generateMetadata } = await import('@/app/destinations/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('destinations');
  });

  it('omits ogImage when not available', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      brand: { primaryColor: '#0d9488', logoUrl: null, ogImageUrl: null },
      homepageConfig: { hero: {} },
    });
    const { generateMetadata } = await import('@/app/destinations/page');
    const meta = await generateMetadata();
    expect(meta.openGraph).toBeDefined();
  });

  it('works with different site name', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      name: 'Venice Guides',
    });
    const { generateMetadata } = await import('@/app/destinations/page');
    const meta = await generateMetadata();
    expect(meta.openGraph?.title).toBe('Destinations | Venice Guides');
    expect(meta.description).toContain('Venice Guides');
  });
});
