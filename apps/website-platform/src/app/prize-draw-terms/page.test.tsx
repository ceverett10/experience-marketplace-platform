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

describe('prize-draw-terms/page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
  });

  describe('generateMetadata', () => {
    it('returns correct title', async () => {
      const metadata = await generateMetadata();
      expect(metadata.title).toBe('Prize Draw Terms & Conditions');
    });

    it('returns correct description', async () => {
      const metadata = await generateMetadata();
      expect(metadata.description).toBe(
        'Official terms and conditions for the Holibob prize draw competition. Win £1,000 of experiences.'
      );
    });

    it('sets openGraph title (without site name suffix)', async () => {
      const metadata = await generateMetadata();
      expect(metadata.openGraph).toMatchObject({
        title: 'Prize Draw Terms & Conditions',
        description:
          'Official terms and conditions for the Holibob prize draw competition. Win £1,000 of experiences.',
        type: 'website',
      });
    });

    it('sets canonical URL using primaryDomain', async () => {
      const metadata = await generateMetadata();
      expect(metadata.alternates?.canonical).toBe('https://test.example.com/prize-draw-terms');
    });

    it('falls back to hostname when primaryDomain is empty', async () => {
      mockGetSiteFromHostname.mockResolvedValue({
        ...baseSite,
        primaryDomain: '',
      });
      const metadata = await generateMetadata();
      expect(metadata.alternates?.canonical).toBe('https://test.example.com/prize-draw-terms');
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
