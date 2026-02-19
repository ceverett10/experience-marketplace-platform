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

describe('Privacy page generateMetadata', () => {
  it('returns correct title', async () => {
    const { generateMetadata } = await import('@/app/privacy/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Privacy Policy');
  });

  it('returns correct description', async () => {
    const { generateMetadata } = await import('@/app/privacy/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('Privacy Policy');
    expect(meta.description).toContain('Holibob Limited');
  });

  it('sets robots to noindex, follow', async () => {
    const { generateMetadata } = await import('@/app/privacy/page');
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it('sets canonical URL', async () => {
    const { generateMetadata } = await import('@/app/privacy/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://test.example.com/privacy');
  });

  it('includes openGraph with site name suffix', async () => {
    const { generateMetadata } = await import('@/app/privacy/page');
    const meta = await generateMetadata();
    expect(meta.openGraph?.title).toBe('Privacy Policy | Test Site');
  });

  it('openGraph type is website', async () => {
    const { generateMetadata } = await import('@/app/privacy/page');
    const meta = await generateMetadata();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((meta.openGraph as any)?.type).toBe('website');
  });

  it('uses primaryDomain in canonical', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      primaryDomain: 'custom-domain.com',
    });
    const { generateMetadata } = await import('@/app/privacy/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://custom-domain.com/privacy');
  });

  it('always sets noindex regardless of site config', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      name: 'Any Site',
    });
    const { generateMetadata } = await import('@/app/privacy/page');
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it('title is static (does not include site name)', async () => {
    const { generateMetadata } = await import('@/app/privacy/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Privacy Policy');
  });

  it('description mentions personal data protection', async () => {
    const { generateMetadata } = await import('@/app/privacy/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('personal data');
  });
});
