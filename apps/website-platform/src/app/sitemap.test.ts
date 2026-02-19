import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@/lib/microsite-experiences', () => ({
  isMicrosite: vi.fn((ctx: unknown) => !!ctx),
}));

const { mockPageFindMany, mockProductFindMany } = vi.hoisted(() => ({
  mockPageFindMany: vi.fn(),
  mockProductFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: { findMany: mockPageFindMany },
    product: { findMany: mockProductFindMany },
  },
}));

import sitemap from './sitemap';

const baseSite = {
  id: 'site-1',
  name: 'Test Site',
  primaryDomain: 'test.example.com',
  micrositeContext: null,
};

describe('sitemap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
    mockPageFindMany.mockResolvedValue([]);
    mockProductFindMany.mockResolvedValue([]);
  });

  it('includes static pages for non-microsite', async () => {
    const entries = await sitemap();

    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://test.example.com');
    expect(urls).toContain('https://test.example.com/experiences');
    expect(urls).toContain('https://test.example.com/destinations');
    expect(urls).toContain('https://test.example.com/categories');
    expect(urls).toContain('https://test.example.com/blog');
    expect(urls).toContain('https://test.example.com/about');
    expect(urls).toContain('https://test.example.com/contact');
  });

  it('omits destinations/categories for microsites', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      micrositeContext: { supplierId: 'sup-1' },
    });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain('https://test.example.com');
    expect(urls).toContain('https://test.example.com/experiences');
    expect(urls).not.toContain('https://test.example.com/destinations');
    expect(urls).not.toContain('https://test.example.com/categories');
  });

  it('maps BLOG pages with slug directly (no double prefix)', async () => {
    mockPageFindMany.mockResolvedValue([
      { slug: 'blog/my-post', type: 'BLOG', priority: 0.6, updatedAt: new Date('2025-01-01') },
    ]);

    const entries = await sitemap();
    const blogEntry = entries.find((e) => e.url.includes('my-post'));

    expect(blogEntry!.url).toBe('https://test.example.com/blog/my-post');
    expect(blogEntry!.changeFrequency).toBe('monthly');
  });

  it('maps CATEGORY pages with /categories/ prefix', async () => {
    mockPageFindMany.mockResolvedValue([
      { slug: 'food-tours', type: 'CATEGORY', priority: 0.7, updatedAt: new Date('2025-01-01') },
    ]);

    const entries = await sitemap();
    const catEntry = entries.find((e) => e.url.includes('food-tours'));

    expect(catEntry!.url).toBe('https://test.example.com/categories/food-tours');
    expect(catEntry!.changeFrequency).toBe('weekly');
  });

  it('maps LANDING pages with slug directly (no double prefix)', async () => {
    mockPageFindMany.mockResolvedValue([
      {
        slug: 'destinations/little-italy',
        type: 'LANDING',
        priority: 0.7,
        updatedAt: new Date('2025-01-01'),
      },
    ]);

    const entries = await sitemap();
    const landingEntry = entries.find((e) => e.url.includes('little-italy'));

    expect(landingEntry!.url).toBe('https://test.example.com/destinations/little-italy');
  });

  it('maps PRODUCT pages with /experiences/ prefix', async () => {
    mockPageFindMany.mockResolvedValue([
      { slug: 'prod-123', type: 'PRODUCT', priority: 0.6, updatedAt: new Date('2025-01-01') },
    ]);

    const entries = await sitemap();
    const productEntry = entries.find((e) => e.url.includes('prod-123'));

    expect(productEntry!.url).toBe('https://test.example.com/experiences/prod-123');
  });

  it('deduplicates static pages from database results', async () => {
    mockPageFindMany.mockResolvedValue([
      { slug: 'about', type: 'HOMEPAGE', priority: 0.5, updatedAt: new Date('2025-01-01') },
    ]);

    const entries = await sitemap();
    const aboutUrls = entries.filter((e) => e.url === 'https://test.example.com/about');

    expect(aboutUrls).toHaveLength(1);
  });

  it('includes microsite product pages', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      micrositeContext: { supplierId: 'sup-1' },
    });
    mockProductFindMany.mockResolvedValue([
      { holibobProductId: 'hb-prod-1', updatedAt: new Date('2025-01-01'), rating: 4.5 },
      { holibobProductId: 'hb-prod-2', updatedAt: new Date('2025-01-01'), rating: null },
    ]);

    const entries = await sitemap();
    const prodUrls = entries.filter((e) => e.url.includes('/experiences/hb-prod'));

    expect(prodUrls).toHaveLength(2);
    expect(prodUrls[0]!.url).toBe('https://test.example.com/experiences/hb-prod-1');
    // Higher rating = higher priority (capped at 0.8)
    expect(prodUrls[0]!.priority).toBeCloseTo(0.78, 1);
    // No rating = base priority 0.6
    expect(prodUrls[1]!.priority).toBe(0.6);
  });

  it('does not fetch products for non-microsite', async () => {
    await sitemap();
    expect(mockProductFindMany).not.toHaveBeenCalled();
  });

  it('uses hostname as fallback when no primaryDomain', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      primaryDomain: null,
    });

    const entries = await sitemap();
    expect(entries[0]!.url).toBe('https://test.example.com');
  });
});
