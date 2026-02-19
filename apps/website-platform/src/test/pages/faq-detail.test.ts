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

vi.mock('@/lib/seo', () => ({
  generateFaqJsonLd: vi.fn(() => ({})),
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

const mockFaqPage = {
  id: 'faq-1',
  title: 'Booking Questions',
  slug: 'faq/booking-questions',
  metaTitle: null,
  metaDescription: null,
  canonicalUrl: null,
  noIndex: false,
  createdAt: new Date('2026-01-10'),
  updatedAt: new Date('2026-02-05'),
  content: { body: 'Answers to common booking questions.' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSiteFromHostname.mockResolvedValue(defaultSite);
  mockPageFindUnique.mockResolvedValue(null);
});

describe('FAQ detail generateMetadata', () => {
  it('returns "FAQ Not Found" when page does not exist', async () => {
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'nonexistent' }) });
    expect(meta.title).toBe('FAQ Not Found');
  });

  it('uses page title as page title', async () => {
    mockPageFindUnique.mockResolvedValue(mockFaqPage);
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'booking-questions' }),
    });
    expect(meta.title).toBe('Booking Questions');
  });

  it('uses metaTitle when available', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockFaqPage,
      metaTitle: 'Custom FAQ SEO Title',
    });
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'booking-questions' }),
    });
    expect(meta.title).toBe('Custom FAQ SEO Title');
  });

  it('uses metaDescription when available', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockFaqPage,
      metaDescription: 'Custom FAQ description',
    });
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'booking-questions' }),
    });
    expect(meta.description).toBe('Custom FAQ description');
  });

  it('falls back to content body for description', async () => {
    mockPageFindUnique.mockResolvedValue(mockFaqPage);
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'booking-questions' }),
    });
    expect(meta.description).toContain('booking questions');
  });

  it('sets default canonical URL', async () => {
    mockPageFindUnique.mockResolvedValue(mockFaqPage);
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'booking-questions' }),
    });
    expect(meta.alternates?.canonical).toBe('https://test.example.com/faq/booking-questions');
  });

  it('uses custom canonicalUrl when set', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockFaqPage,
      canonicalUrl: 'https://custom.com/faq-page',
    });
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'booking-questions' }),
    });
    expect(meta.alternates?.canonical).toBe('https://custom.com/faq-page');
  });

  it('sets robots index=true when noIndex is false', async () => {
    mockPageFindUnique.mockResolvedValue(mockFaqPage);
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'booking-questions' }),
    });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('sets robots index=false when noIndex is true', async () => {
    mockPageFindUnique.mockResolvedValue({ ...mockFaqPage, noIndex: true });
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'booking-questions' }),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('includes openGraph with article type', async () => {
    mockPageFindUnique.mockResolvedValue(mockFaqPage);
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'booking-questions' }),
    });
    expect(meta.openGraph?.type).toBe('article');
    expect(meta.openGraph?.title).toContain('| Test Site');
  });

  it('includes publishedTime and modifiedTime', async () => {
    mockPageFindUnique.mockResolvedValue(mockFaqPage);
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'booking-questions' }),
    });
    expect(meta.openGraph?.publishedTime).toBeDefined();
    expect(meta.openGraph?.modifiedTime).toBeDefined();
  });

  it('queries with "faq/" prefix in slug', async () => {
    mockPageFindUnique.mockResolvedValue(mockFaqPage);
    const { generateMetadata } = await import('@/app/faq/[slug]/page');
    await generateMetadata({
      params: Promise.resolve({ slug: 'my-faq' }),
    });
    expect(mockPageFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          siteId_slug: expect.objectContaining({
            slug: 'faq/my-faq',
          }),
        }),
      })
    );
  });
});
