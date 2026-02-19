import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- hoisted mocks ---
const { mockGetSiteFromHostname } = vi.hoisted(() => ({
  mockGetSiteFromHostname: vi.fn(),
}));

const { mockPageFindUnique } = vi.hoisted(() => ({
  mockPageFindUnique: vi.fn(),
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
    page: { findUnique: mockPageFindUnique },
  },
}));

vi.mock('@/lib/seo', () => ({
  generateFaqJsonLd: vi.fn(() => ({ '@type': 'FAQPage' })),
}));

vi.mock('@/components/content/FAQPageTemplate', () => ({
  FAQPageTemplate: () => null,
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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
  homepageConfig: { hero: { backgroundImage: '/hero.jpg' } },
};

const mockFaqPage = {
  id: 'faq-1',
  title: 'Booking Questions',
  metaTitle: 'FAQ: Booking Questions',
  metaDescription: 'Frequently asked questions about booking experiences.',
  canonicalUrl: null,
  noIndex: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-02-01'),
  content: {
    id: 'content-1',
    body: '### How do I book?\n\nVisit our experiences page.\n\n### Can I cancel?\n\nYes, free cancellation.',
    bodyFormat: 'MARKDOWN',
  },
};

describe('faq/[slug]/page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
    mockPageFindUnique.mockResolvedValue(null);
  });

  describe('generateMetadata', () => {
    it('returns "FAQ Not Found" when page does not exist', async () => {
      mockPageFindUnique.mockResolvedValue(null);
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'nonexistent' }),
      });
      expect(metadata.title).toBe('FAQ Not Found');
    });

    it('uses metaTitle when available', async () => {
      mockPageFindUnique.mockResolvedValue(mockFaqPage);
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      expect(metadata.title).toBe('FAQ: Booking Questions');
    });

    it('falls back to page title when metaTitle is absent', async () => {
      mockPageFindUnique.mockResolvedValue({
        ...mockFaqPage,
        metaTitle: null,
      });
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      expect(metadata.title).toBe('Booking Questions');
    });

    it('uses metaDescription when available', async () => {
      mockPageFindUnique.mockResolvedValue(mockFaqPage);
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      expect(metadata.description).toBe('Frequently asked questions about booking experiences.');
    });

    it('falls back to content body substring when metaDescription is absent', async () => {
      mockPageFindUnique.mockResolvedValue({
        ...mockFaqPage,
        metaDescription: null,
      });
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      expect(metadata.description).toBe(mockFaqPage.content.body.substring(0, 160));
    });

    it('sets openGraph with correct fields', async () => {
      mockPageFindUnique.mockResolvedValue(mockFaqPage);
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      const og = metadata.openGraph as Record<string, unknown>;
      expect(og.title).toBe('FAQ: Booking Questions | Test Site');
      expect(og.type).toBe('article');
      expect(og.publishedTime).toBe('2026-01-01T00:00:00.000Z');
      expect(og.modifiedTime).toBe('2026-02-01T00:00:00.000Z');
    });

    it('includes ogImage from brand config', async () => {
      mockPageFindUnique.mockResolvedValue(mockFaqPage);
      mockGetSiteFromHostname.mockResolvedValue({
        ...baseSite,
        brand: { ...baseSite.brand, ogImageUrl: '/brand-og.png' },
      });
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      const og = metadata.openGraph as Record<string, unknown>;
      expect(og.images).toEqual(['/brand-og.png']);
    });

    it('falls back to hero backgroundImage when ogImageUrl is missing', async () => {
      mockPageFindUnique.mockResolvedValue(mockFaqPage);
      mockGetSiteFromHostname.mockResolvedValue({
        ...baseSite,
        brand: { ...baseSite.brand, ogImageUrl: null },
      });
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      const og = metadata.openGraph as Record<string, unknown>;
      expect(og.images).toEqual(['/hero.jpg']);
    });

    it('omits images when neither ogImageUrl nor hero backgroundImage exist', async () => {
      mockPageFindUnique.mockResolvedValue(mockFaqPage);
      mockGetSiteFromHostname.mockResolvedValue({
        ...baseSite,
        brand: { ...baseSite.brand, ogImageUrl: null },
        homepageConfig: { hero: {} },
      });
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      const og = metadata.openGraph as Record<string, unknown>;
      expect(og.images).toBeUndefined();
    });

    it('sets canonical URL using primaryDomain by default', async () => {
      mockPageFindUnique.mockResolvedValue(mockFaqPage);
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      expect(metadata.alternates?.canonical).toBe('https://test.example.com/faq/booking-questions');
    });

    it('uses custom canonicalUrl when set on the page', async () => {
      mockPageFindUnique.mockResolvedValue({
        ...mockFaqPage,
        canonicalUrl: 'https://custom.example.com/faq/booking',
      });
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      expect(metadata.alternates?.canonical).toBe('https://custom.example.com/faq/booking');
    });

    it('sets robots index true when noIndex is false', async () => {
      mockPageFindUnique.mockResolvedValue(mockFaqPage);
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      expect(metadata.robots).toEqual({ index: true, follow: true });
    });

    it('sets robots index false when noIndex is true', async () => {
      mockPageFindUnique.mockResolvedValue({
        ...mockFaqPage,
        noIndex: true,
      });
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      expect(metadata.robots).toEqual({ index: false, follow: false });
    });

    it('queries prisma with faq/ prefix on slug', async () => {
      await generateMetadata({
        params: Promise.resolve({ slug: 'booking-questions' }),
      });
      expect(mockPageFindUnique).toHaveBeenCalledWith({
        where: {
          siteId_slug: {
            siteId: 'site-1',
            slug: 'faq/booking-questions',
          },
          type: 'FAQ',
          status: 'PUBLISHED',
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
