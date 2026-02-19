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

const mockPageFindFirst = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: {
      findFirst: (...args: unknown[]) => mockPageFindFirst(...args),
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
  mockPageFindFirst.mockResolvedValue(null);
});

describe('Contact page generateMetadata', () => {
  it('returns default title when no page exists', async () => {
    const { generateMetadata } = await import('@/app/contact/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Contact Us');
  });

  it('uses page metaTitle when available', async () => {
    mockPageFindFirst.mockResolvedValue({
      metaTitle: 'Get in Touch',
      title: 'Contact',
      metaDescription: null,
      noIndex: false,
    });
    const { generateMetadata } = await import('@/app/contact/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Get in Touch');
  });

  it('uses page title when no metaTitle', async () => {
    mockPageFindFirst.mockResolvedValue({
      metaTitle: null,
      title: 'Reach Out to Us',
      metaDescription: null,
      noIndex: false,
    });
    const { generateMetadata } = await import('@/app/contact/page');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Reach Out to Us');
  });

  it('uses metaDescription when available', async () => {
    mockPageFindFirst.mockResolvedValue({
      metaTitle: null,
      title: 'Contact',
      metaDescription: 'Custom contact page description',
      noIndex: false,
    });
    const { generateMetadata } = await import('@/app/contact/page');
    const meta = await generateMetadata();
    expect(meta.description).toBe('Custom contact page description');
  });

  it('generates default description with site name', async () => {
    const { generateMetadata } = await import('@/app/contact/page');
    const meta = await generateMetadata();
    expect(meta.description).toContain('Test Site');
  });

  it('sets canonical URL', async () => {
    const { generateMetadata } = await import('@/app/contact/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://test.example.com/contact');
  });

  it('includes openGraph with site name suffix', async () => {
    const { generateMetadata } = await import('@/app/contact/page');
    const meta = await generateMetadata();
    expect(meta.openGraph?.title).toContain('| Test Site');
  });

  it('openGraph type is website', async () => {
    const { generateMetadata } = await import('@/app/contact/page');
    const meta = await generateMetadata();
    expect(meta.openGraph?.type).toBe('website');
  });

  it('sets robots from page noIndex field', async () => {
    mockPageFindFirst.mockResolvedValue({
      metaTitle: null,
      title: 'Contact',
      metaDescription: null,
      noIndex: true,
    });
    const { generateMetadata } = await import('@/app/contact/page');
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('defaults robots to indexable when no page exists', async () => {
    const { generateMetadata } = await import('@/app/contact/page');
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('uses primaryDomain in canonical', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      primaryDomain: 'custom-domain.com',
    });
    const { generateMetadata } = await import('@/app/contact/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://custom-domain.com/contact');
  });
});
