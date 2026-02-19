import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- hoisted mocks ---
const { mockGetSiteFromHostname } = vi.hoisted(() => ({
  mockGetSiteFromHostname: vi.fn(),
}));

const { mockPageFindFirst } = vi.hoisted(() => ({
  mockPageFindFirst: vi.fn(),
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

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: { findFirst: mockPageFindFirst },
  },
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

describe('contact/page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
    mockPageFindFirst.mockResolvedValue(null);
  });

  describe('generateMetadata', () => {
    it('returns default title when no page exists', async () => {
      const metadata = await generateMetadata();
      expect(metadata.title).toBe('Contact Us');
    });

    it('returns default description when no page exists', async () => {
      const metadata = await generateMetadata();
      expect(metadata.description).toBe(
        "Get in touch with Test Site. We're here to help with your travel experience questions."
      );
    });

    it('uses page metaTitle when available', async () => {
      mockPageFindFirst.mockResolvedValue({
        metaTitle: 'Reach Out to Us',
        title: 'Contact',
        metaDescription: 'Custom description for contact',
        noIndex: false,
      });
      const metadata = await generateMetadata();
      expect(metadata.title).toBe('Reach Out to Us');
    });

    it('uses page title as fallback when metaTitle is missing', async () => {
      mockPageFindFirst.mockResolvedValue({
        metaTitle: null,
        title: 'Get In Touch',
        metaDescription: null,
        noIndex: false,
      });
      const metadata = await generateMetadata();
      expect(metadata.title).toBe('Get In Touch');
    });

    it('uses page metaDescription when available', async () => {
      mockPageFindFirst.mockResolvedValue({
        metaTitle: null,
        title: 'Contact',
        metaDescription: 'Custom contact description',
        noIndex: false,
      });
      const metadata = await generateMetadata();
      expect(metadata.description).toBe('Custom contact description');
    });

    it('sets openGraph title with site name', async () => {
      const metadata = await generateMetadata();
      expect(metadata.openGraph).toMatchObject({
        title: 'Contact Us | Test Site',
        type: 'website',
      });
    });

    it('sets canonical URL using primaryDomain', async () => {
      const metadata = await generateMetadata();
      expect(metadata.alternates?.canonical).toBe('https://test.example.com/contact');
    });

    it('falls back to hostname when primaryDomain is empty', async () => {
      mockGetSiteFromHostname.mockResolvedValue({
        ...baseSite,
        primaryDomain: '',
      });
      const metadata = await generateMetadata();
      expect(metadata.alternates?.canonical).toBe('https://test.example.com/contact');
    });

    it('sets robots index true when page has no noIndex flag', async () => {
      mockPageFindFirst.mockResolvedValue({
        metaTitle: null,
        title: 'Contact',
        metaDescription: null,
        noIndex: false,
      });
      const metadata = await generateMetadata();
      expect(metadata.robots).toEqual({ index: true, follow: true });
    });

    it('sets robots index false when page has noIndex flag', async () => {
      mockPageFindFirst.mockResolvedValue({
        metaTitle: null,
        title: 'Contact',
        metaDescription: null,
        noIndex: true,
      });
      const metadata = await generateMetadata();
      expect(metadata.robots).toEqual({ index: false, follow: false });
    });

    it('defaults robots to index true when no page exists', async () => {
      mockPageFindFirst.mockResolvedValue(null);
      const metadata = await generateMetadata();
      expect(metadata.robots).toEqual({ index: true, follow: true });
    });

    it('queries prisma with correct siteId, slug, and type', async () => {
      await generateMetadata();
      expect(mockPageFindFirst).toHaveBeenCalledWith({
        where: {
          siteId: 'site-1',
          slug: 'contact',
          type: 'CONTACT',
        },
        include: {
          content: true,
        },
      });
    });
  });

  describe('exports', () => {
    it('exports dynamic = force-dynamic', () => {
      expect(dynamic).toBe('force-dynamic');
    });
  });
});
