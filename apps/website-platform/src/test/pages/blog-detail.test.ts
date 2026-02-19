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
      findMany: vi.fn(async () => []),
    },
  },
}));

vi.mock('@/lib/microsite-experiences', () => ({
  getRelatedMicrosites: vi.fn(async () => []),
  getNetworkRelatedBlogPosts: vi.fn(async () => []),
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

const mockPost = {
  id: 'post-1',
  title: 'Best Walking Tours in London',
  slug: 'blog/best-walking-tours-london',
  metaTitle: null,
  metaDescription: null,
  canonicalUrl: null,
  noIndex: false,
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-02-10'),
  content: { body: 'This is a blog post about London walking tours.' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSiteFromHostname.mockResolvedValue(defaultSite);
  mockPageFindUnique.mockResolvedValue(null);
});

describe('Blog detail generateMetadata', () => {
  it('returns "Blog Post Not Found" when post does not exist', async () => {
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'nonexistent' }) });
    expect(meta.title).toBe('Blog Post Not Found');
  });

  it('uses post title as page title', async () => {
    mockPageFindUnique.mockResolvedValue(mockPost);
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'best-walking-tours-london' }),
    });
    expect(meta.title).toBe('Best Walking Tours in London');
  });

  it('uses metaTitle when available', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockPost,
      metaTitle: 'Custom SEO Title for Blog',
    });
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'best-walking-tours-london' }),
    });
    expect(meta.title).toBe('Custom SEO Title for Blog');
  });

  it('uses metaDescription when available', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockPost,
      metaDescription: 'Custom SEO description for the blog post.',
    });
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'best-walking-tours-london' }),
    });
    expect(meta.description).toBe('Custom SEO description for the blog post.');
  });

  it('falls back to content body for description', async () => {
    mockPageFindUnique.mockResolvedValue(mockPost);
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'best-walking-tours-london' }),
    });
    expect(meta.description).toContain('London walking tours');
  });

  it('sets canonical URL from post.canonicalUrl when set', async () => {
    mockPageFindUnique.mockResolvedValue({
      ...mockPost,
      canonicalUrl: 'https://custom-canonical.com/post',
    });
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'best-walking-tours-london' }),
    });
    expect(meta.alternates?.canonical).toBe('https://custom-canonical.com/post');
  });

  it('sets default canonical URL when no custom canonical', async () => {
    mockPageFindUnique.mockResolvedValue(mockPost);
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'best-walking-tours-london' }),
    });
    expect(meta.alternates?.canonical).toBe(
      'https://test.example.com/blog/best-walking-tours-london'
    );
  });

  it('sets robots index=true when noIndex is false', async () => {
    mockPageFindUnique.mockResolvedValue(mockPost);
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'best-walking-tours-london' }),
    });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('sets robots index=false when noIndex is true', async () => {
    mockPageFindUnique.mockResolvedValue({ ...mockPost, noIndex: true });
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'best-walking-tours-london' }),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('includes openGraph with article type and dates', async () => {
    mockPageFindUnique.mockResolvedValue(mockPost);
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'best-walking-tours-london' }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const og = meta.openGraph as any;
    expect(og?.type).toBe('article');
    expect(og?.publishedTime).toBeDefined();
    expect(og?.modifiedTime).toBeDefined();
  });

  it('includes openGraph title with site name suffix', async () => {
    mockPageFindUnique.mockResolvedValue(mockPost);
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'best-walking-tours-london' }),
    });
    expect(meta.openGraph?.title).toContain('| Test Site');
  });

  it('includes twitter card metadata', async () => {
    mockPageFindUnique.mockResolvedValue(mockPost);
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'best-walking-tours-london' }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((meta.twitter as any)?.card).toBe('summary_large_image');
    expect((meta.twitter as any)?.title).toContain('| Test Site');
  });

  it('queries blog with "blog/" prefix in slug', async () => {
    mockPageFindUnique.mockResolvedValue(mockPost);
    const { generateMetadata } = await import('@/app/blog/[slug]/page');
    await generateMetadata({
      params: Promise.resolve({ slug: 'my-post' }),
    });
    expect(mockPageFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          siteId_slug: expect.objectContaining({
            slug: 'blog/my-post',
          }),
        }),
      })
    );
  });
});
