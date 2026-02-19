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

describe('unsubscribed/page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
  });

  describe('generateMetadata', () => {
    it('returns correct title', async () => {
      const metadata = await generateMetadata();
      expect(metadata.title).toBe('Unsubscribed');
    });

    it('returns correct description', async () => {
      const metadata = await generateMetadata();
      expect(metadata.description).toBe('You have been unsubscribed from marketing emails.');
    });

    it('sets robots to noindex, nofollow', async () => {
      const metadata = await generateMetadata();
      expect(metadata.robots).toEqual({
        index: false,
        follow: false,
      });
    });

    it('does not include openGraph metadata', async () => {
      const metadata = await generateMetadata();
      expect(metadata.openGraph).toBeUndefined();
    });

    it('does not include canonical URL', async () => {
      const metadata = await generateMetadata();
      expect(metadata.alternates).toBeUndefined();
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
