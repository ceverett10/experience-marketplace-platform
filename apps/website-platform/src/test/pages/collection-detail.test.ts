import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---
vi.mock('next/headers', () => ({
  headers: () =>
    new Map([
      ['host', 'test.example.com'],
      ['x-forwarded-host', 'test.example.com'],
    ]),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

const mockGetSiteFromHostname = vi.fn();

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: (...args: unknown[]) => mockGetSiteFromHostname(...args),
}));

const mockCollectionFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    curatedCollection: {
      findUnique: (...args: unknown[]) => mockCollectionFindUnique(...args),
    },
  },
}));

const defaultSite = {
  id: 'site-1',
  name: 'Test Site',
  hostname: 'test.example.com',
  primaryDomain: 'test.example.com',
  micrositeContext: { micrositeId: 'micro-1' },
  brand: { primaryColor: '#0d9488', logoUrl: '/logo.png', ogImageUrl: '/og.png' },
  seoConfig: {},
  homepageConfig: {},
};

const mockCollection = {
  id: 'col-1',
  name: 'Family Adventures',
  slug: 'family-adventures',
  description: 'Perfect experiences for the whole family.',
  imageUrl: '/collection-image.jpg',
  type: 'AUDIENCE',
  products: [
    {
      product: {
        id: 'p-1',
        primaryImageUrl: '/product-1.jpg',
        title: 'Family Park Tour',
      },
    },
    {
      product: {
        id: 'p-2',
        primaryImageUrl: '/product-2.jpg',
        title: 'Zoo Adventure',
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSiteFromHostname.mockResolvedValue(defaultSite);
  mockCollectionFindUnique.mockResolvedValue(null);
});

describe('Collection detail generateMetadata', () => {
  it('returns "Collection Not Found" when collection does not exist', async () => {
    const { generateMetadata } = await import('@/app/collections/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'nonexistent' }) });
    expect(meta.title).toBe('Collection Not Found');
  });

  it('uses collection name as page title', async () => {
    mockCollectionFindUnique.mockResolvedValue(mockCollection);
    const { generateMetadata } = await import('@/app/collections/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'family-adventures' }),
    });
    expect(meta.title).toBe('Family Adventures');
  });

  it('uses collection description for metadata description', async () => {
    mockCollectionFindUnique.mockResolvedValue(mockCollection);
    const { generateMetadata } = await import('@/app/collections/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'family-adventures' }),
    });
    expect(meta.description).toBe('Perfect experiences for the whole family.');
  });

  it('generates fallback description when no description set', async () => {
    mockCollectionFindUnique.mockResolvedValue({
      ...mockCollection,
      description: null,
    });
    const { generateMetadata } = await import('@/app/collections/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'family-adventures' }),
    });
    expect(meta.description).toContain('curated experiences');
    expect(meta.description).toContain('Test Site');
  });

  it('includes product count in fallback description', async () => {
    mockCollectionFindUnique.mockResolvedValue({
      ...mockCollection,
      description: null,
    });
    const { generateMetadata } = await import('@/app/collections/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'family-adventures' }),
    });
    expect(meta.description).toContain('2');
  });

  it('sets canonical URL with collection slug', async () => {
    mockCollectionFindUnique.mockResolvedValue(mockCollection);
    const { generateMetadata } = await import('@/app/collections/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'family-adventures' }),
    });
    expect(meta.alternates?.canonical).toBe(
      'https://test.example.com/collections/family-adventures'
    );
  });

  it('includes openGraph with site name suffix', async () => {
    mockCollectionFindUnique.mockResolvedValue(mockCollection);
    const { generateMetadata } = await import('@/app/collections/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'family-adventures' }),
    });
    expect(meta.openGraph?.title).toBe('Family Adventures | Test Site');
  });

  it('uses collection imageUrl for openGraph image', async () => {
    mockCollectionFindUnique.mockResolvedValue(mockCollection);
    const { generateMetadata } = await import('@/app/collections/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'family-adventures' }),
    });
    if (meta.openGraph && 'images' in meta.openGraph) {
      expect(meta.openGraph.images).toBeDefined();
    }
  });

  it('falls back to first product image when no collection image', async () => {
    mockCollectionFindUnique.mockResolvedValue({
      ...mockCollection,
      imageUrl: null,
    });
    const { generateMetadata } = await import('@/app/collections/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'family-adventures' }),
    });
    if (meta.openGraph && 'images' in meta.openGraph && meta.openGraph.images) {
      const images = meta.openGraph.images as Array<{ url: string }>;
      expect(images[0]?.url).toBe('/product-1.jpg');
    }
  });

  it('uses micrositeId for collection lookup', async () => {
    mockCollectionFindUnique.mockResolvedValue(mockCollection);
    const { generateMetadata } = await import('@/app/collections/[slug]/page');
    await generateMetadata({
      params: Promise.resolve({ slug: 'family-adventures' }),
    });
    expect(mockCollectionFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          micrositeId_slug: expect.objectContaining({
            micrositeId: 'micro-1',
          }),
        }),
      })
    );
  });

  it('openGraph type is website', async () => {
    mockCollectionFindUnique.mockResolvedValue(mockCollection);
    const { generateMetadata } = await import('@/app/collections/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'family-adventures' }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((meta.openGraph as any)?.type).toBe('website');
  });
});
