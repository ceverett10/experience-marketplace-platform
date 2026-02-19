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

vi.mock('@/lib/parent-domain', () => ({
  isParentDomain: vi.fn(() => true),
  getFeaturedSuppliers: vi.fn().mockResolvedValue([]),
  getSupplierCategories: vi.fn().mockResolvedValue([]),
  getSupplierCities: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    supplier: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
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
  homepageConfig: {},
};

describe('providers/page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
  });

  describe('generateMetadata', () => {
    it('returns default title when no search params', async () => {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve({}),
      });
      expect(metadata.title).toBe('Experience Providers');
    });

    it('returns city-specific title when city param is set', async () => {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve({ city: 'London' }),
      });
      expect(metadata.title).toBe('Experience Providers in London');
    });

    it('returns category-specific title when category param is set', async () => {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve({ category: 'Food Tours' }),
      });
      expect(metadata.title).toBe('Food Tours Providers');
    });

    it('returns city-specific description when city param is set', async () => {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve({ city: 'London' }),
      });
      expect(metadata.description).toBe(
        'Discover top-rated tour operators and activity providers in London. Book experiences with free cancellation.'
      );
    });

    it('returns category-specific description when category param is set', async () => {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve({ category: 'Food Tours' }),
      });
      expect(metadata.description).toBe(
        'Browse Food Tours experience providers across our network. Book with instant confirmation.'
      );
    });

    it('returns default description when no params', async () => {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve({}),
      });
      expect(metadata.description).toBe(
        'Browse all experience providers in our network. Free cancellation, instant confirmation.'
      );
    });

    it('sets canonical URL using hostname', async () => {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve({}),
      });
      expect(metadata.alternates?.canonical).toBe('https://test.example.com/providers');
    });

    it('prefers city title over category when both are provided', async () => {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve({ city: 'London', category: 'Food Tours' }),
      });
      expect(metadata.title).toBe('Experience Providers in London');
    });
  });

  describe('exports', () => {
    it('exports dynamic = force-dynamic', () => {
      expect(dynamic).toBe('force-dynamic');
    });
  });
});
