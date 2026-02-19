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

const { mockGetSiteFromHostname } = vi.hoisted(() => ({
  mockGetSiteFromHostname: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: mockGetSiteFromHostname,
}));

vi.mock('@/components/common/UnsplashAttribution', () => ({
  UnsplashAttribution: () => null,
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
    categories: [{ name: 'Tours', slug: 'tours', icon: 'map', description: 'Guided tours' }],
    popularExperiences: { destination: 'London' },
  },
};

describe('Categories listing page generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
  });

  it('returns correct title', async () => {
    const metadata = await generateMetadata();

    expect(metadata.title).toBe('Experience Categories');
  });

  it('includes site name in description', async () => {
    const metadata = await generateMetadata();

    expect(metadata.description).toContain('Test Site');
    expect(metadata.description).toContain('Browse experience categories');
  });

  it('appends site name to openGraph title', async () => {
    const metadata = await generateMetadata();

    expect(metadata.openGraph?.title).toBe('Experience Categories | Test Site');
  });

  it('sets openGraph type to website', async () => {
    const metadata = await generateMetadata();

    expect(metadata.openGraph?.type).toBe('website');
  });

  it('sets canonical URL to /categories', async () => {
    const metadata = await generateMetadata();

    expect(metadata.alternates?.canonical).toBe('https://test.example.com/categories');
  });

  it('uses ogImageUrl from brand for openGraph images', async () => {
    const metadata = await generateMetadata();

    expect(metadata.openGraph?.images).toEqual(['/og.png']);
  });

  it('falls back to hero backgroundImage when ogImageUrl is missing', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      brand: { ...baseSite.brand, ogImageUrl: null },
    });

    const metadata = await generateMetadata();

    expect(metadata.openGraph?.images).toEqual(['/hero.jpg']);
  });

  it('omits images when no OG image is available', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      brand: { ...baseSite.brand, ogImageUrl: null },
      homepageConfig: { ...baseSite.homepageConfig, hero: {} },
    });

    const metadata = await generateMetadata();

    expect(metadata.openGraph?.images).toBeUndefined();
  });

  it('uses hostname in canonical when primaryDomain is not set', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      primaryDomain: null,
    });

    const metadata = await generateMetadata();

    expect(metadata.alternates?.canonical).toBe('https://test.example.com/categories');
  });

  it('does not set robots directives (no noIndex logic for listing)', async () => {
    const metadata = await generateMetadata();

    expect(metadata.robots).toBeUndefined();
  });

  it('openGraph description is shorter than full description', async () => {
    const metadata = await generateMetadata();

    const ogDesc = metadata.openGraph?.description as string;
    const metaDesc = metadata.description as string;
    expect(ogDesc.length).toBeLessThanOrEqual(metaDesc.length);
  });
});
