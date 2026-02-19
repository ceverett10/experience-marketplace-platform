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
  redirect: vi.fn(),
}));

const mockIsParentDomain = vi.fn();

vi.mock('@/lib/parent-domain', () => ({
  isParentDomain: (...args: unknown[]) => mockIsParentDomain(...args),
  getFeaturedSuppliers: vi.fn(async () => []),
  getSupplierCategories: vi.fn(async () => []),
  getSupplierCities: vi.fn(async () => []),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    supplier: {
      findMany: vi.fn(async () => []),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockIsParentDomain.mockReturnValue(true);
});

describe('Providers page generateMetadata', () => {
  it('returns default title when no filters', async () => {
    const { generateMetadata } = await import('@/app/providers/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toBe('Experience Providers');
  });

  it('returns city-filtered title', async () => {
    const { generateMetadata } = await import('@/app/providers/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ city: 'London' }),
    });
    expect(meta.title).toBe('Experience Providers in London');
  });

  it('returns category-filtered title', async () => {
    const { generateMetadata } = await import('@/app/providers/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ category: 'Walking Tours' }),
    });
    expect(meta.title).toBe('Walking Tours Providers');
  });

  it('city filter takes precedence over category in title', async () => {
    const { generateMetadata } = await import('@/app/providers/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ city: 'London', category: 'Tours' }),
    });
    expect(meta.title).toBe('Experience Providers in London');
  });

  it('city-filtered description mentions the city', async () => {
    const { generateMetadata } = await import('@/app/providers/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ city: 'London' }),
    });
    expect(meta.description).toContain('London');
  });

  it('category-filtered description mentions the category', async () => {
    const { generateMetadata } = await import('@/app/providers/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ category: 'Food Tours' }),
    });
    expect(meta.description).toContain('Food Tours');
  });

  it('default description mentions network', async () => {
    const { generateMetadata } = await import('@/app/providers/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({}),
    });
    expect(meta.description).toContain('network');
  });

  it('sets canonical URL', async () => {
    const { generateMetadata } = await import('@/app/providers/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({}),
    });
    expect(meta.alternates?.canonical).toContain('/providers');
  });

  it('description mentions free cancellation for city filter', async () => {
    const { generateMetadata } = await import('@/app/providers/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ city: 'London' }),
    });
    expect(meta.description).toContain('free cancellation');
  });

  it('description mentions instant confirmation for category filter', async () => {
    const { generateMetadata } = await import('@/app/providers/page');
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ category: 'Boat Rides' }),
    });
    expect(meta.description).toContain('instant confirmation');
  });
});
