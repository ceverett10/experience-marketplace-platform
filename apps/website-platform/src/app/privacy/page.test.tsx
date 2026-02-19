import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- hoisted mocks ---
const { mockGetSiteFromHostname } = vi.hoisted(() => ({
  mockGetSiteFromHostname: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => {
        if (key === 'x-forwarded-host') return null;
        if (key === 'host') return 'test.example.com';
        return null;
      }),
    })
  ),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: mockGetSiteFromHostname,
}));

vi.mock('@/components/content/StaticPageTemplate', () => ({
  StaticPageTemplate: () => null,
}));

import { generateMetadata, dynamic } from './page';

const baseSite = {
  id: 'site-1',
  name: 'Test Site',
  hostname: 'test.example.com',
  primaryDomain: 'test.example.com',
  micrositeId: null,
  micrositeContext: null,
  brand: { primaryColor: '#0d9488', logoUrl: '/logo.png', ogImageUrl: '/og.png' },
  seoConfig: {},
  homepageConfig: {},
};

describe('privacy/page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
  });

  describe('generateMetadata', () => {
    it('returns correct title', async () => {
      const metadata = await generateMetadata();
      expect(metadata.title).toBe('Privacy Policy');
    });

    it('returns correct description', async () => {
      const metadata = await generateMetadata();
      expect(metadata.description).toBe(
        'Privacy Policy for Holibob Limited. Learn how we collect, use, and protect your personal data.'
      );
    });

    it('sets openGraph title with site name', async () => {
      const metadata = await generateMetadata();
      expect(metadata.openGraph).toMatchObject({
        title: 'Privacy Policy | Test Site',
        description:
          'Privacy Policy for Holibob Limited. Learn how we collect, use, and protect your personal data.',
        type: 'website',
      });
    });

    it('sets canonical URL using primaryDomain', async () => {
      const metadata = await generateMetadata();
      expect(metadata.alternates?.canonical).toBe('https://test.example.com/privacy');
    });

    it('falls back to hostname when primaryDomain is empty', async () => {
      mockGetSiteFromHostname.mockResolvedValue({
        ...baseSite,
        primaryDomain: '',
      });
      const metadata = await generateMetadata();
      expect(metadata.alternates?.canonical).toBe('https://test.example.com/privacy');
    });

    it('sets robots to noindex, follow', async () => {
      const metadata = await generateMetadata();
      expect(metadata.robots).toEqual({
        index: false,
        follow: true,
      });
    });

    it('calls getSiteFromHostname with correct hostname', async () => {
      await generateMetadata();
      expect(mockGetSiteFromHostname).toHaveBeenCalledWith('test.example.com');
    });
  });

  describe('exports', () => {
    it('exports dynamic = force-dynamic', () => {
      expect(dynamic).toBe('force-dynamic');
    });
  });
});
