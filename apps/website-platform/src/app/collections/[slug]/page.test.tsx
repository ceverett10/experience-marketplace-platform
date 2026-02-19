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

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

const { mockGetSiteFromHostname } = vi.hoisted(() => ({
  mockGetSiteFromHostname: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: mockGetSiteFromHostname,
}));

const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    curatedCollection: { findUnique: mockFindUnique },
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
  homepageConfig: {},
};

const micrositeSite = {
  ...baseSite,
  id: 'site-micro',
  name: 'Micro Site',
  micrositeContext: { micrositeId: 'micro-1' },
};

const baseCollection = {
  id: 'col-1',
  name: 'Romantic Getaways',
  slug: 'romantic-getaways',
  description: 'Perfect experiences for couples.',
  imageUrl: '/collection-image.jpg',
  collectionType: 'AUDIENCE',
  iconEmoji: '💕',
  isActive: true,
  products: [
    {
      product: {
        id: 'prod-1',
        holibobProductId: 'hb-1',
        slug: 'sunset-cruise',
        title: 'Sunset Cruise',
        shortDescription: 'A beautiful sunset cruise.',
        primaryImageUrl: '/prod-1.jpg',
        priceFrom: 50,
        currency: 'GBP',
        rating: 4.8,
        reviewCount: 120,
        duration: '2 hours',
        city: 'London',
      },
      sortOrder: 0,
      featuredReason: 'Most Popular',
    },
    {
      product: {
        id: 'prod-2',
        holibobProductId: 'hb-2',
        slug: null,
        title: 'Spa Day',
        shortDescription: 'Relaxing spa experience.',
        primaryImageUrl: '/prod-2.jpg',
        priceFrom: 80,
        currency: 'GBP',
        rating: null,
        reviewCount: null,
        duration: '4 hours',
        city: 'Bath',
      },
      sortOrder: 1,
      featuredReason: null,
    },
  ],
};

describe('Collections [slug] page generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteFromHostname.mockResolvedValue(baseSite);
    mockFindUnique.mockResolvedValue(baseCollection);
  });

  it('returns "Collection Not Found" when collection does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'nonexistent' }),
    });

    expect(metadata.title).toBe('Collection Not Found');
  });

  it('uses collection name as title', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'romantic-getaways' }),
    });

    expect(metadata.title).toBe('Romantic Getaways');
  });

  it('uses collection description when available', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'romantic-getaways' }),
    });

    expect(metadata.description).toBe('Perfect experiences for couples.');
  });

  it('generates fallback description when collection has no description', async () => {
    mockFindUnique.mockResolvedValue({ ...baseCollection, description: null });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'romantic-getaways' }),
    });

    expect(metadata.description).toContain('2 curated experiences');
    expect(metadata.description).toContain('Romantic Getaways');
    expect(metadata.description).toContain('Test Site');
  });

  it('sets canonical URL to /collections/[slug]', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'romantic-getaways' }),
    });

    expect(metadata.alternates?.canonical).toBe(
      'https://test.example.com/collections/romantic-getaways'
    );
  });

  it('appends site name to openGraph title', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'romantic-getaways' }),
    });

    expect(metadata.openGraph?.title).toBe('Romantic Getaways | Test Site');
  });

  it('uses collection imageUrl for openGraph images', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'romantic-getaways' }),
    });

    expect(metadata.openGraph?.images).toEqual([{ url: '/collection-image.jpg' }]);
  });

  it('falls back to first product image when collection has no imageUrl', async () => {
    mockFindUnique.mockResolvedValue({ ...baseCollection, imageUrl: null });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'romantic-getaways' }),
    });

    expect(metadata.openGraph?.images).toEqual([{ url: '/prod-1.jpg' }]);
  });

  it('omits images when neither collection nor products have images', async () => {
    mockFindUnique.mockResolvedValue({
      ...baseCollection,
      imageUrl: null,
      products: [
        {
          ...baseCollection.products[0],
          product: { ...baseCollection.products[0].product, primaryImageUrl: null },
        },
      ],
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'romantic-getaways' }),
    });

    expect(metadata.openGraph?.images).toBeUndefined();
  });

  it('sets openGraph type to website', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'romantic-getaways' }),
    });

    expect(metadata.openGraph?.type).toBe('website');
  });

  it('uses micrositeId from micrositeContext when available', async () => {
    mockGetSiteFromHostname.mockResolvedValue(micrositeSite);
    mockFindUnique.mockResolvedValue(baseCollection);

    await generateMetadata({
      params: Promise.resolve({ slug: 'romantic-getaways' }),
    });

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          micrositeId_slug: {
            micrositeId: 'micro-1',
            slug: 'romantic-getaways',
          },
        },
      })
    );
  });

  it('falls back to site.id when micrositeContext is null', async () => {
    await generateMetadata({
      params: Promise.resolve({ slug: 'romantic-getaways' }),
    });

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          micrositeId_slug: {
            micrositeId: 'site-1',
            slug: 'romantic-getaways',
          },
        },
      })
    );
  });
});

// --- Test the formatPrice utility logic (replicated from source) ---

function formatPrice(amount: number | null, currency: string): string {
  if (!amount) return 'Price varies';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency || 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

describe('formatPrice utility', () => {
  it('formats GBP price correctly', () => {
    expect(formatPrice(50, 'GBP')).toBe('£50');
  });

  it('formats EUR price correctly', () => {
    expect(formatPrice(100, 'EUR')).toContain('100');
  });

  it('returns "Price varies" for null amount', () => {
    expect(formatPrice(null, 'GBP')).toBe('Price varies');
  });

  it('returns "Price varies" for zero amount', () => {
    expect(formatPrice(0, 'GBP')).toBe('Price varies');
  });

  it('defaults to GBP when currency is empty string', () => {
    expect(formatPrice(75, '')).toBe('£75');
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
    expect(getCollectionTypeInfo('AUDIENCE').label).toBe('For You');
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

  it('returns default for unknown type', () => {
    expect(getCollectionTypeInfo('SPECIAL').label).toBe('Collection');
  });
});
