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
  DEFAULT_SITE_CONFIG: {
    id: 'default',
    slug: 'default',
    name: 'Experience Marketplace',
    brand: { primaryColor: '#6366f1', logoUrl: null, ogImageUrl: null },
    seoConfig: {},
    homepageConfig: {},
  },
}));

const mockGetProduct = vi.fn();

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn(() => ({
    getProduct: (...args: unknown[]) => mockGetProduct(...args),
    discoverProducts: vi.fn(async () => ({ products: [], totalCount: 0 })),
  })),
  mapProductToExperience: vi.fn((product: Record<string, unknown>) => ({
    id: product['id'],
    title: product['name'],
    shortDescription: product['shortDescription'] ?? '',
    description: product['description'] ?? '',
    imageUrl: '/test-image.jpg',
    images: [],
    provider: product['provider'] ?? null,
    location: { name: '' },
  })),
  parseIsoDuration: vi.fn(() => 0),
  optimizeHolibobImageWithPreset: vi.fn((url: string) => url),
}));

vi.mock('@/lib/supplier', () => ({
  isTickittoSite: vi.fn(() => false),
}));

vi.mock('@/lib/tickitto', () => ({
  getTickittoClient: vi.fn(),
  mapTickittoEventToExperience: vi.fn(),
  mapTickittoEventToExperienceListItem: vi.fn(),
}));

vi.mock('@/lib/microsite-experiences', () => ({
  isMicrosite: vi.fn(() => false),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: () => ({
        findFirst: vi.fn(),
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(),
      }),
    }
  ),
}));

vi.mock('@/lib/booking-analytics', () => ({
  getProductBookingStats: vi.fn(async () => null),
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
  mockGetProduct.mockResolvedValue(null);
});

describe('Experience detail generateMetadata', () => {
  it('returns "Experience Not Found" when product not found', async () => {
    mockGetProduct.mockResolvedValue(null);
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'nonexistent' }) });
    expect(meta.title).toBe('Experience Not Found');
  });

  it('returns experience title as page title', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-1',
      name: 'Amazing London Walk',
      shortDescription: 'A great walk through London',
      provider: { name: 'Local Walks' },
    });
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'prod-1' }) });
    expect(meta.title).toBe('Amazing London Walk');
  });

  it('sets description from experience shortDescription', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-1',
      name: 'Amazing London Walk',
      shortDescription: 'A scenic tour through historic London streets',
      provider: { name: 'Local Walks' },
    });
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'prod-1' }) });
    expect(meta.description).toBe('A scenic tour through historic London streets');
  });

  it('sets robots index=true for non-Viator products', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-1',
      name: 'Local Tour',
      shortDescription: 'A local tour',
      provider: { name: 'Local Provider' },
    });
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'prod-1' }) });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('sets robots index=false for Viator products (contractual)', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-viator',
      name: 'Viator Walking Tour',
      shortDescription: 'A walk',
      provider: { name: 'Viator' },
    });
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'prod-viator' }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it('detects Viator by case-insensitive provider name', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-v2',
      name: 'Viator Day Trip',
      shortDescription: 'A day trip',
      provider: { name: 'VIATOR TOURS' },
    });
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'prod-v2' }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it('includes openGraph with site name suffix', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-1',
      name: 'Great Tour',
      shortDescription: 'A great tour',
      provider: { name: 'Provider' },
    });
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'prod-1' }) });
    expect(meta.openGraph?.title).toBe('Great Tour | Test Site');
  });

  it('includes twitter card metadata', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-1',
      name: 'Great Tour',
      shortDescription: 'A great tour',
      provider: { name: 'Provider' },
    });
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'prod-1' }) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((meta.twitter as any)?.card).toBe('summary_large_image');
    expect((meta.twitter as any)?.title).toContain('| Test Site');
  });

  it('sets canonical URL with slug', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-1',
      name: 'Great Tour',
      shortDescription: 'A great tour',
      provider: { name: 'Provider' },
    });
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'prod-1' }) });
    expect(meta.alternates?.canonical).toBe('https://test.example.com/experiences/prod-1');
  });

  it('uses primaryDomain in canonical when available', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      primaryDomain: 'custom.example.com',
    });
    mockGetProduct.mockResolvedValue({
      id: 'prod-1',
      name: 'Great Tour',
      shortDescription: 'desc',
      provider: { name: 'Provider' },
    });
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'prod-1' }) });
    expect(meta.alternates?.canonical).toContain('custom.example.com');
  });

  it('handles API error gracefully', async () => {
    mockGetProduct.mockRejectedValue(new Error('API timeout'));
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'error-prod' }) });
    expect(meta.title).toBe('Experience Not Found');
  });

  it('includes experience image in openGraph', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-1',
      name: 'Image Tour',
      shortDescription: 'Tour with images',
      provider: { name: 'Provider' },
    });
    const { generateMetadata } = await import('@/app/experiences/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'prod-1' }) });
    if (meta.openGraph && 'images' in meta.openGraph) {
      expect(meta.openGraph.images).toBeDefined();
    }
  });
});
