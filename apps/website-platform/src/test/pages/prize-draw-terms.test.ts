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

describe('Prize draw terms generateMetadata', () => {
  it('returns correct title', async () => {
    const { generateMetadata } = await import('@/app/prize-draw-terms/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Prize Draw Terms & Conditions');
  });

  it('returns correct description', async () => {
    const { generateMetadata } = await import('@/app/prize-draw-terms/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('prize draw');
    expect(meta.description).toContain('Holibob');
  });

  it('sets robots to noindex, follow', async () => {
    const { generateMetadata } = await import('@/app/prize-draw-terms/page');
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it('sets canonical URL', async () => {
    const { generateMetadata } = await import('@/app/prize-draw-terms/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://test.example.com/prize-draw-terms');
  });

  it('includes openGraph with title', async () => {
    const { generateMetadata } = await import('@/app/prize-draw-terms/page');
    const meta = await generateMetadata();
    expect(meta.openGraph?.title).toBe('Prize Draw Terms & Conditions');
  });

  it('openGraph type is website', async () => {
    const { generateMetadata } = await import('@/app/prize-draw-terms/page');
    const meta = await generateMetadata();
    expect(meta.openGraph?.type).toBe('website');
  });

  it('uses primaryDomain in canonical', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      primaryDomain: 'custom-domain.com',
    });
    const { generateMetadata } = await import('@/app/prize-draw-terms/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://custom-domain.com/prize-draw-terms');
  });

  it('always sets noindex regardless of site config', async () => {
    const { generateMetadata } = await import('@/app/prize-draw-terms/page');
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it('description mentions competition', async () => {
    const { generateMetadata } = await import('@/app/prize-draw-terms/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('competition');
  });

  it('title is static', async () => {
    const { generateMetadata } = await import('@/app/prize-draw-terms/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Prize Draw Terms & Conditions');
  });
});
