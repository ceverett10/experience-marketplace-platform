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

const { mockIsParentDomain } = vi.hoisted(() => ({
  mockIsParentDomain: vi.fn(() => false),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: mockGetSiteFromHostname,
}));

vi.mock('@/lib/parent-domain', () => ({
  isParentDomain: mockIsParentDomain,
  getPlatformStats: vi.fn().mockResolvedValue({
    totalSuppliers: 100,
    totalProducts: 5000,
    totalCities: 200,
    totalCategories: 50,
    activeMicrosites: 30,
  }),
}));

const { mockPageFindFirst } = vi.hoisted(() => ({
  mockPageFindFirst: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: { findFirst: mockPageFindFirst },
  },
}));

vi.mock('@/components/content/StaticPageTemplate', () => ({
  StaticPageTemplate: () => null,
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
  homepageConfig: {},
};

const micrositeSite = {
  ...baseSite,
  id: 'site-micro',
  name: 'Micro Site',
  micrositeContext: { micrositeId: 'micro-1' },
};

const basePage = {
  id: 'page-1',
  title: 'About Our Company',
  metaTitle: 'About Us - Custom Meta',
  metaDescription: 'Custom meta description for about page',
  noIndex: false,
  content: { body: 'Some content here' },
};

describe('About page generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
    mockIsParentDomain.mockReturnValue(false);
    mockPageFindFirst.mockResolvedValue(basePage);
  });

  it('returns parent domain metadata when hostname is parent domain', async () => {
    mockIsParentDomain.mockReturnValue(true);

    const metadata = await generateMetadata();

    expect(metadata.title).toBe('About Us | Experiencess');
    expect(metadata.description).toContain('Experiencess is a network');
    expect(metadata.openGraph?.title).toBe('About Us | Experiencess');
    expect(metadata.alternates?.canonical).toBe('https://test.example.com/about');
  });

  it('uses metaTitle from page when available', async () => {
    const metadata = await generateMetadata();

    expect(metadata.title).toBe('About Us - Custom Meta');
  });

  it('falls back to page title when metaTitle is not set', async () => {
    mockPageFindFirst.mockResolvedValue({ ...basePage, metaTitle: null });

    const metadata = await generateMetadata();

    expect(metadata.title).toBe('About Our Company');
  });

  it('falls back to "About Us" when no page exists', async () => {
    mockPageFindFirst.mockResolvedValue(null);

    const metadata = await generateMetadata();

    expect(metadata.title).toBe('About Us');
  });

  it('uses metaDescription from page when available', async () => {
    const metadata = await generateMetadata();

    expect(metadata.description).toBe('Custom meta description for about page');
  });

  it('generates microsite description when microsite has no custom content', async () => {
    mockGetSiteFromHostname.mockResolvedValue(micrositeSite);
    mockPageFindFirst.mockResolvedValue({
      ...basePage,
      metaDescription: null,
      content: { body: '' },
    });

    const metadata = await generateMetadata();

    expect(metadata.description).toContain('Micro Site is part of the Experiencess.com network');
  });

  it('generates standard description for non-microsite without metaDescription', async () => {
    mockPageFindFirst.mockResolvedValue({
      ...basePage,
      metaDescription: null,
      content: { body: 'Has content' },
    });

    const metadata = await generateMetadata();

    expect(metadata.description).toContain('Learn more about Test Site');
  });

  it('sets canonical URL using primaryDomain', async () => {
    const metadata = await generateMetadata();

    expect(metadata.alternates?.canonical).toBe('https://test.example.com/about');
  });

  it('appends site name to openGraph title', async () => {
    const metadata = await generateMetadata();

    expect(metadata.openGraph?.title).toBe('About Us - Custom Meta | Test Site');
  });

  it('sets robots index to true when page has noIndex false', async () => {
    const metadata = await generateMetadata();

    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it('sets robots noindex when page has noIndex true', async () => {
    mockPageFindFirst.mockResolvedValue({ ...basePage, noIndex: true });

    const metadata = await generateMetadata();

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('defaults robots to index:true when no page exists', async () => {
    mockPageFindFirst.mockResolvedValue(null);

    const metadata = await generateMetadata();

    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it('sets openGraph type to website', async () => {
    const metadata = await generateMetadata();

    expect(metadata.openGraph?.type).toBe('website');
  });
});
