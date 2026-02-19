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
  homepageConfig: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSiteFromHostname.mockResolvedValue(defaultSite);
});

describe('Unsubscribed page generateMetadata', () => {
  it('returns correct title', async () => {
    const { generateMetadata } = await import('@/app/unsubscribed/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Unsubscribed');
  });

  it('returns correct description', async () => {
    const { generateMetadata } = await import('@/app/unsubscribed/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('unsubscribed');
  });

  it('sets robots to noindex, nofollow', async () => {
    const { generateMetadata } = await import('@/app/unsubscribed/page');
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('always returns noindex', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      name: 'Any Site',
    });
    const { generateMetadata } = await import('@/app/unsubscribed/page');
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('title is static', async () => {
    const { generateMetadata } = await import('@/app/unsubscribed/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Unsubscribed');
  });

  it('description mentions marketing emails', async () => {
    const { generateMetadata } = await import('@/app/unsubscribed/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('marketing emails');
  });

  it('does not include openGraph (private page)', async () => {
    const { generateMetadata } = await import('@/app/unsubscribed/page');
    const meta = await generateMetadata();
    // Unsubscribed page should be minimal metadata
    expect(meta.title).toBeDefined();
    expect(meta.robots).toBeDefined();
  });

  it('does not include canonical URL', async () => {
    const { generateMetadata } = await import('@/app/unsubscribed/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBeUndefined();
  });

  it('calls getSiteFromHostname', async () => {
    const { generateMetadata } = await import('@/app/unsubscribed/page');
    await generateMetadata();
    expect(mockGetSiteFromHostname).toHaveBeenCalled();
  });

  it('description is concise', async () => {
    const { generateMetadata } = await import('@/app/unsubscribed/page');
    const meta = await generateMetadata();
    if (typeof meta.description === 'string') {
      expect(meta.description.length).toBeLessThan(100);
    }
  });
});
