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

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: mockGetSiteFromHostname,
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn(() => ({
    discoverProducts: vi.fn().mockResolvedValue({ products: [] }),
  })),
}));

const { mockPageFindUnique } = vi.hoisted(() => ({
  mockPageFindUnique: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: { findUnique: mockPageFindUnique },
  },
}));

vi.mock('@/components/content/CategoryPageTemplate', () => ({
  CategoryPageTemplate: () => null,
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

const baseCategoryPage = {
  id: 'page-1',
  title: 'Food Tours',
  metaTitle: 'Best Food Tours',
  metaDescription: 'Discover the best food tours available.',
  noIndex: false,
  canonicalUrl: null,
  holibobCategoryId: 'cat-1',
  content: {
    body: 'Explore amazing food tours in various destinations.',
    structuredData: null,
  },
};

describe('Categories [slug] page generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
    mockPageFindUnique.mockResolvedValue(baseCategoryPage);
  });

  it('returns "Category Not Found" when category does not exist', async () => {
    mockPageFindUnique.mockResolvedValue(null);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'nonexistent' }),
    });

    expect(metadata.title).toBe('Category Not Found');
  });

  it('uses metaTitle from category page when available', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'food-tours' }),
    });

    expect(metadata.title).toBe('Best Food Tours');
  });

  it('falls back to page title when metaTitle is not set', async () => {
    mockPageFindUnique.mockResolvedValue({ ...baseCategoryPage, metaTitle: null });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'food-tours' }),
    });

    expect(metadata.title).toBe('Food Tours');
  });

  it('uses metaDescription from category page', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'food-tours' }),
    });

    expect(metadata.description).toBe('Discover the best food tours available.');
  });

  it('falls back to content body substring when metaDescription is not set', async () => {
    mockPageFindUnique.mockResolvedValue({ ...baseCategoryPage, metaDescription: null });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'food-tours' }),
    });

    expect(metadata.description).toBe('Explore amazing food tours in various destinations.');
  });

  it('sets canonical URL to /categories/[slug] by default', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'food-tours' }),
    });

    expect(metadata.alternates?.canonical).toBe('https://test.example.com/categories/food-tours');
  });

  it('uses custom canonicalUrl when set on page', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...baseCategoryPage,
      canonicalUrl: 'https://custom.example.com/food',
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'food-tours' }),
    });

    expect(metadata.alternates?.canonical).toBe('https://custom.example.com/food');
  });

  it('appends site name to openGraph title', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'food-tours' }),
    });

    expect(metadata.openGraph?.title).toBe('Best Food Tours | Test Site');
  });

  it('sets robots index true when noIndex is false', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'food-tours' }),
    });

    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it('sets robots noindex when noIndex is true', async () => {
    mockPageFindUnique.mockResolvedValue({ ...baseCategoryPage, noIndex: true });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'food-tours' }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('uses ogImageUrl from brand for openGraph images', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'food-tours' }),
    });

    expect(metadata.openGraph?.images).toEqual(['/og.png']);
  });

  it('omits images when no OG image is available', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      brand: { ...baseSite.brand, ogImageUrl: null },
      homepageConfig: {},
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'food-tours' }),
    });

    expect(metadata.openGraph?.images).toBeUndefined();
  });
});

// --- Test the extractFaqSchema utility logic (replicated from source) ---

function extractFaqSchema(body?: string | null) {
  if (!body) return null;

  const faqRegex = /###\s+(.+\?)\s*\n+([\s\S]*?)(?=\n###|\n##|\n#|$)/g;
  const items: { question: string; answer: string }[] = [];
  let match;

  while ((match = faqRegex.exec(body)) !== null) {
    const question = match[1]?.trim();
    const answer = match[2]
      ?.trim()
      .replace(/\n+/g, ' ')
      .replace(/[#*_`]/g, '');
    if (question && answer) {
      items.push({ question, answer });
    }
  }

  if (items.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

describe('extractFaqSchema utility', () => {
  it('returns null for null body', () => {
    expect(extractFaqSchema(null)).toBeNull();
  });

  it('returns null for empty body', () => {
    expect(extractFaqSchema('')).toBeNull();
  });

  it('returns null when no FAQ headings found', () => {
    expect(extractFaqSchema('## Regular heading\n\nSome content')).toBeNull();
  });

  it('extracts FAQ pairs from H3 headings ending with ?', () => {
    const body = `### What is this tour?\nThis is an amazing guided tour.\n### How long does it take?\nAbout 2 hours.`;
    const result = extractFaqSchema(body);

    expect(result).not.toBeNull();
    expect(result?.['@type']).toBe('FAQPage');
    expect(result?.mainEntity).toHaveLength(2);
    expect(result?.mainEntity[0].name).toBe('What is this tour?');
    expect(result?.mainEntity[0].acceptedAnswer.text).toBe('This is an amazing guided tour.');
  });

  it('strips markdown formatting from answers', () => {
    const body = `### What is included?\n**Bold** and *italic* and \`code\` text.`;
    const result = extractFaqSchema(body);

    expect(result?.mainEntity[0].acceptedAnswer.text).not.toContain('**');
    expect(result?.mainEntity[0].acceptedAnswer.text).not.toContain('*');
    expect(result?.mainEntity[0].acceptedAnswer.text).not.toContain('`');
  });
});
