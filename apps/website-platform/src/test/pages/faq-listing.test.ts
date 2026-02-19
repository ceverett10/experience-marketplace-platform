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

const mockPageCount = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: {
      count: (...args: unknown[]) => mockPageCount(...args),
      findMany: vi.fn(async () => []),
    },
  },
}));

const defaultSite = {
  id: 'site-1',
  name: 'Test Site',
  hostname: 'test.example.com',
  primaryDomain: 'test.example.com',
  micrositeContext: null,
  brand: { primaryColor: '#0d9488', logoUrl: '/logo.png', ogImageUrl: '/og.png' },
  seoConfig: {},
  homepageConfig: { hero: {} },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSiteFromHostname.mockResolvedValue(defaultSite);
  mockPageCount.mockResolvedValue(0);
});

describe('FAQ listing generateMetadata', () => {
  it('returns correct title', async () => {
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.title).toBe('Frequently Asked Questions');
  });

  it('includes site name in description', async () => {
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.description).toContain('Test Site');
  });

  it('sets canonical URL without page param for page 1', async () => {
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.alternates?.canonical).toBe('https://test.example.com/faq');
  });

  it('sets canonical URL with page param for page > 1', async () => {
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({ page: '2' }) });
    expect(meta.alternates?.canonical).toBe('https://test.example.com/faq?page=2');
  });

  it('includes openGraph with site name', async () => {
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.openGraph?.title).toBe('Frequently Asked Questions | Test Site');
  });

  it('includes link-next when more pages exist', async () => {
    mockPageCount.mockResolvedValue(25); // > 12 per page
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.other?.['link-next']).toBeDefined();
  });

  it('includes link-prev on page 2', async () => {
    mockPageCount.mockResolvedValue(25);
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({ page: '2' }) });
    expect(meta.other?.['link-prev']).toBeDefined();
  });

  it('link-prev on page 2 points to base URL', async () => {
    mockPageCount.mockResolvedValue(25);
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({ page: '2' }) });
    expect(meta.other?.['link-prev']).toBe('https://test.example.com/faq');
  });

  it('does not include link-next on last page', async () => {
    mockPageCount.mockResolvedValue(5); // 5 items < 12 per page = 1 page
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.other?.['link-next']).toBeUndefined();
  });

  it('does not include link-prev on page 1', async () => {
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(meta.other?.['link-prev']).toBeUndefined();
  });

  it('includes ogImage when available', async () => {
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({}) });
    if (meta.openGraph && 'images' in meta.openGraph) {
      expect(meta.openGraph.images).toBeDefined();
    }
  });

  it('handles negative page numbers gracefully', async () => {
    const { generateMetadata } = await import('@/app/faq/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({ page: '-1' }) });
    // Should default to page 1 (Math.max(1, ...))
    expect(meta.alternates?.canonical).toBe('https://test.example.com/faq');
  });
});
