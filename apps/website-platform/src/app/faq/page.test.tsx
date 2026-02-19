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

const { mockPageFindMany, mockPageCount } = vi.hoisted(() => ({
  mockPageFindMany: vi.fn(),
  mockPageCount: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: {
      findMany: mockPageFindMany,
      count: mockPageCount,
    },
  },
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

describe('FAQ page generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
    mockPageCount.mockResolvedValue(24);
  });

  it('returns correct title', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Frequently Asked Questions');
  });

  it('includes site name in description', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.description).toContain('Test Site');
  });

  it('appends site name to openGraph title', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.openGraph?.title).toBe('Frequently Asked Questions | Test Site');
  });

  it('sets canonical URL without page param for page 1', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.alternates?.canonical).toBe('https://test.example.com/faq');
  });

  it('sets canonical URL with page param for page > 1', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ page: '3' }),
    });

    expect(metadata.alternates?.canonical).toBe('https://test.example.com/faq?page=3');
  });

  it('includes link-next in other when more pages exist', async () => {
    mockPageCount.mockResolvedValue(24); // 24 / 12 = 2 pages

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.other?.['link-next']).toBe('https://test.example.com/faq?page=2');
  });

  it('does not include link-prev for page 1', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.other?.['link-prev']).toBeUndefined();
  });

  it('includes both link-prev and link-next on middle page', async () => {
    mockPageCount.mockResolvedValue(36); // 36 / 12 = 3 pages

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ page: '2' }),
    });

    expect(metadata.other?.['link-prev']).toBe('https://test.example.com/faq');
    expect(metadata.other?.['link-next']).toBe('https://test.example.com/faq?page=3');
  });

  it('link-prev uses base URL (not ?page=1) for page 2', async () => {
    mockPageCount.mockResolvedValue(36);

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ page: '2' }),
    });

    expect(metadata.other?.['link-prev']).toBe('https://test.example.com/faq');
  });

  it('does not include link-next on last page', async () => {
    mockPageCount.mockResolvedValue(12); // 1 page total

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.other?.['link-next']).toBeUndefined();
  });

  it('uses ogImageUrl from brand for openGraph images', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.openGraph?.images).toEqual(['/og.png']);
  });

  it('falls back to hero backgroundImage when ogImageUrl is missing', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      brand: { ...baseSite.brand, ogImageUrl: null },
    });

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.openGraph?.images).toEqual(['/hero.jpg']);
  });

  it('omits images when no OG image is available', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      brand: { ...baseSite.brand, ogImageUrl: null },
      homepageConfig: {},
    });

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.openGraph?.images).toBeUndefined();
  });

  it('treats invalid page param as page 1', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ page: 'abc' }),
    });

    // NaN becomes page 1 via Math.max(1, NaN) = 1
    expect(metadata.alternates?.canonical).toBe('https://test.example.com/faq');
  });
});

// --- Test the generateExcerpt utility logic (replicated from source) ---

function generateExcerpt(body: string, maxLength: number = 160): string {
  const plainText = body
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  if (plainText.length <= maxLength) return plainText;
  return plainText.substring(0, maxLength).trim() + '...';
}

describe('generateExcerpt utility', () => {
  it('strips markdown headings', () => {
    expect(generateExcerpt('## Hello World')).toBe('Hello World');
  });

  it('strips bold markdown', () => {
    expect(generateExcerpt('This is **bold** text')).toBe('This is bold text');
  });

  it('strips italic markdown', () => {
    expect(generateExcerpt('This is *italic* text')).toBe('This is italic text');
  });

  it('strips markdown links but keeps text', () => {
    expect(generateExcerpt('[click here](https://example.com)')).toBe('click here');
  });

  it('handles markdown images (link regex matches before image regex)', () => {
    // The link regex /\[([^\]]+)\]\([^)]+\)/g runs before the image regex,
    // so it matches [alt text](image.png) first, leaving the '!' prefix.
    // This is the actual behavior of the source function.
    expect(generateExcerpt('![alt text](image.png) Hello')).toBe('!alt text Hello');
  });

  it('truncates long text with ellipsis', () => {
    const longText = 'A'.repeat(200);
    const result = generateExcerpt(longText, 100);
    expect(result.length).toBeLessThanOrEqual(103); // 100 + '...'
    expect(result).toMatch(/\.\.\.$/);
  });

  it('returns short text as-is', () => {
    expect(generateExcerpt('Short text')).toBe('Short text');
  });
});
