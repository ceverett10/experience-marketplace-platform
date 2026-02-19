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
const mockIsParentDomain = vi.fn();

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: (...args: unknown[]) => mockGetSiteFromHostname(...args),
}));

vi.mock('@/lib/parent-domain', () => ({
  isParentDomain: (...args: unknown[]) => mockIsParentDomain(...args),
  getPlatformStats: vi.fn(async () => ({ sites: 0, experiences: 0, suppliers: 0 })),
}));

const mockPageFindFirst = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: {
      findFirst: (...args: unknown[]) => mockPageFindFirst(...args),
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
  homepageConfig: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSiteFromHostname.mockResolvedValue(defaultSite);
  mockIsParentDomain.mockReturnValue(false);
  mockPageFindFirst.mockResolvedValue(null);
});

describe('About page generateMetadata', () => {
  it('returns parent domain metadata when on parent domain', async () => {
    mockIsParentDomain.mockReturnValue(true);
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('About Us | Experiencess');
    expect(meta.description).toContain('Holibob');
  });

  it('returns parent domain openGraph when on parent domain', async () => {
    mockIsParentDomain.mockReturnValue(true);
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.openGraph?.title).toBe('About Us | Experiencess');
  });

  it('returns parent domain canonical URL', async () => {
    mockIsParentDomain.mockReturnValue(true);
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toContain('/about');
  });

  it('returns default "About Us" title when no page exists', async () => {
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('About Us');
  });

  it('uses page metaTitle when available', async () => {
    mockPageFindFirst.mockResolvedValue({
      metaTitle: 'Custom About Title',
      title: 'About',
      metaDescription: null,
      content: { body: 'Content here' },
      noIndex: false,
    });
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Custom About Title');
  });

  it('uses page title when no metaTitle', async () => {
    mockPageFindFirst.mockResolvedValue({
      metaTitle: null,
      title: 'Our Story',
      metaDescription: null,
      content: { body: 'Story content' },
      noIndex: false,
    });
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Our Story');
  });

  it('includes microsite-specific description when no custom content', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      micrositeContext: { micrositeId: 'micro-1' },
    });
    mockPageFindFirst.mockResolvedValue(null);
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('Experiencess.com');
  });

  it('uses regular description for non-microsite', async () => {
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('Test Site');
  });

  it('includes openGraph with site name suffix', async () => {
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.openGraph?.title).toContain('| Test Site');
  });

  it('sets canonical URL with primaryDomain', async () => {
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://test.example.com/about');
  });

  it('sets robots from page noIndex field', async () => {
    mockPageFindFirst.mockResolvedValue({
      metaTitle: null,
      title: 'About',
      metaDescription: null,
      content: { body: 'content' },
      noIndex: true,
    });
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('sets robots index=true when page has noIndex=false', async () => {
    mockPageFindFirst.mockResolvedValue({
      metaTitle: null,
      title: 'About',
      metaDescription: null,
      content: { body: 'content' },
      noIndex: false,
    });
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('defaults robots to indexable when no page exists', async () => {
    const { generateMetadata } = await import('@/app/about/page');
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: true, follow: true });
  });
});
