import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => {
        if (key === 'host') return 'test.example.com';
        return null;
      }),
    })
  ),
}));

const { mockGetSiteFromHostname } = vi.hoisted(() => ({
  mockGetSiteFromHostname: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: mockGetSiteFromHostname,
}));

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    curatedCollection: { findMany: mockFindMany },
  },
}));

import { generateMetadata } from './page';

// --- Test data ---

const baseSite = {
  id: 'site-1',
  name: 'Test Site',
  primaryDomain: 'test.example.com',
  micrositeContext: null,
  brand: {
    primaryColor: '#4F46E5',
    logoUrl: '/logo.png',
    ogImageUrl: '/og.png',
  },
  seoConfig: {},
  homepageConfig: {
    hero: { backgroundImage: '/hero.jpg' },
  },
};

describe('Collections listing page generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
  });

  it('returns correct title', async () => {
    const metadata = await generateMetadata();

    expect(metadata.title).toBe('Experience Collections');
  });

  it('includes site name in description', async () => {
    const metadata = await generateMetadata();

    expect(metadata.description).toContain('Test Site');
    expect(metadata.description).toContain('collections');
  });

  it('appends site name to openGraph title', async () => {
    const metadata = await generateMetadata();

    expect(metadata.openGraph?.title).toBe('Experience Collections | Test Site');
  });

  it('sets openGraph type to website', async () => {
    const metadata = await generateMetadata();

    expect(metadata.openGraph?.type).toBe('website');
  });

  it('sets canonical URL to /collections', async () => {
    const metadata = await generateMetadata();

    expect(metadata.alternates?.canonical).toBe('https://test.example.com/collections');
  });

  it('uses hostname when primaryDomain is not set', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      primaryDomain: null,
    });

    const metadata = await generateMetadata();

    expect(metadata.alternates?.canonical).toBe('https://test.example.com/collections');
  });

  it('uses ogImageUrl from brand for openGraph images', async () => {
    const metadata = await generateMetadata();

    expect(metadata.openGraph?.images).toEqual(['/og.png']);
  });

  it('falls back to hero backgroundImage when ogImageUrl is missing', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      brand: { ...baseSite.brand, ogImageUrl: null },
    });

    const metadata = await generateMetadata();

    expect(metadata.openGraph?.images).toEqual(['/hero.jpg']);
  });

  it('omits images when no OG image is available', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...baseSite,
      brand: { ...baseSite.brand, ogImageUrl: null },
      homepageConfig: {},
    });

    const metadata = await generateMetadata();

    expect(metadata.openGraph?.images).toBeUndefined();
  });

  it('does not set robots directives', async () => {
    const metadata = await generateMetadata();

    expect(metadata.robots).toBeUndefined();
  });
});

// --- Test the adjustColor utility logic (replicated from source) ---

function adjustColor(hex: string, amount: number): string {
  hex = hex.replace('#', '');

  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

describe('adjustColor utility', () => {
  it('darkens a color by negative amount', () => {
    // #ffffff - 40 = #d7d7d7
    const result = adjustColor('#ffffff', -40);
    expect(result).toBe('#d7d7d7');
  });

  it('brightens a color by positive amount', () => {
    // #000000 + 40 = #282828
    const result = adjustColor('#000000', 40);
    expect(result).toBe('#282828');
  });

  it('clamps values to 0', () => {
    // #101010 - 100 should clamp to #000000
    const result = adjustColor('#101010', -100);
    expect(result).toBe('#000000');
  });

  it('clamps values to 255', () => {
    // #f0f0f0 + 100 should clamp to #ffffff
    const result = adjustColor('#f0f0f0', 100);
    expect(result).toBe('#ffffff');
  });

  it('handles hex without # prefix', () => {
    const result = adjustColor('4F46E5', -40);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// --- Test the getCollectionTypeInfo utility logic (replicated from source) ---

function getCollectionTypeInfo(type: string): { label: string; color: string } {
  switch (type) {
    case 'AUDIENCE':
      return { label: 'For You', color: 'bg-blue-100 text-blue-700' };
    case 'SEASONAL':
      return { label: 'Seasonal', color: 'bg-amber-100 text-amber-700' };
    case 'THEMATIC':
      return { label: 'Themed', color: 'bg-purple-100 text-purple-700' };
    case 'CURATED':
      return { label: 'Curated', color: 'bg-green-100 text-green-700' };
    default:
      return { label: 'Collection', color: 'bg-gray-100 text-gray-700' };
  }
}

describe('getCollectionTypeInfo utility', () => {
  it('returns "For You" for AUDIENCE type', () => {
    expect(getCollectionTypeInfo('AUDIENCE')).toEqual({
      label: 'For You',
      color: 'bg-blue-100 text-blue-700',
    });
  });

  it('returns "Seasonal" for SEASONAL type', () => {
    expect(getCollectionTypeInfo('SEASONAL').label).toBe('Seasonal');
  });

  it('returns "Themed" for THEMATIC type', () => {
    expect(getCollectionTypeInfo('THEMATIC').label).toBe('Themed');
  });

  it('returns "Curated" for CURATED type', () => {
    expect(getCollectionTypeInfo('CURATED').label).toBe('Curated');
  });

  it('returns default "Collection" for unknown type', () => {
    expect(getCollectionTypeInfo('UNKNOWN')).toEqual({
      label: 'Collection',
      color: 'bg-gray-100 text-gray-700',
    });
  });
});
