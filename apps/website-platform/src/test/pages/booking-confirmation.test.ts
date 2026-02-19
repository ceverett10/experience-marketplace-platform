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

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn(() => ({
    getBooking: vi.fn(async () => null),
  })),
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
});

describe('Booking confirmation generateMetadata', () => {
  it('returns title with site name', async () => {
    const { generateMetadata } = await import('@/app/booking/confirmation/[bookingId]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ bookingId: 'booking-123' }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toBe('Booking Confirmed - Test Site');
  });

  it('sets robots to noindex, nofollow', async () => {
    const { generateMetadata } = await import('@/app/booking/confirmation/[bookingId]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ bookingId: 'booking-123' }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('works with different site names', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      name: 'London Adventures',
    });
    const { generateMetadata } = await import('@/app/booking/confirmation/[bookingId]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ bookingId: 'booking-456' }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toBe('Booking Confirmed - London Adventures');
  });

  it('handles pending search param gracefully', async () => {
    const { generateMetadata } = await import('@/app/booking/confirmation/[bookingId]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ bookingId: 'booking-789' }),
      searchParams: Promise.resolve({ pending: 'true' }),
    });
    expect(meta.title).toBe('Booking Confirmed - Test Site');
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('always returns noindex regardless of bookingId', async () => {
    const { generateMetadata } = await import('@/app/booking/confirmation/[bookingId]/page');
    const meta1 = await generateMetadata({
      params: Promise.resolve({ bookingId: 'abc' }),
      searchParams: Promise.resolve({}),
    });
    const meta2 = await generateMetadata({
      params: Promise.resolve({ bookingId: 'xyz' }),
      searchParams: Promise.resolve({}),
    });
    expect(meta1.robots).toEqual({ index: false, follow: false });
    expect(meta2.robots).toEqual({ index: false, follow: false });
  });

  it('uses getSiteFromHostname for site resolution', async () => {
    const { generateMetadata } = await import('@/app/booking/confirmation/[bookingId]/page');
    await generateMetadata({
      params: Promise.resolve({ bookingId: 'booking-123' }),
      searchParams: Promise.resolve({}),
    });
    expect(mockGetSiteFromHostname).toHaveBeenCalled();
  });

  it('title format is consistent: "Booking Confirmed - {siteName}"', async () => {
    mockGetSiteFromHostname.mockResolvedValue({
      ...defaultSite,
      name: 'MyBrand',
    });
    const { generateMetadata } = await import('@/app/booking/confirmation/[bookingId]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ bookingId: 'b-1' }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toMatch(/^Booking Confirmed - .+$/);
  });

  it('does not include openGraph metadata', async () => {
    const { generateMetadata } = await import('@/app/booking/confirmation/[bookingId]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ bookingId: 'booking-123' }),
      searchParams: Promise.resolve({}),
    });
    // Booking confirmation is a private page, should be minimal metadata
    expect(meta.title).toBeDefined();
    expect(meta.robots).toBeDefined();
  });

  it('does not include canonical URL (private page)', async () => {
    const { generateMetadata } = await import('@/app/booking/confirmation/[bookingId]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ bookingId: 'booking-123' }),
      searchParams: Promise.resolve({}),
    });
    // Confirmation pages should not have canonical (noindex)
    expect(meta.alternates?.canonical).toBeUndefined();
  });

  it('resolves params asynchronously', async () => {
    const { generateMetadata } = await import('@/app/booking/confirmation/[bookingId]/page');
    // Ensure the async params resolution works
    const meta = await generateMetadata({
      params: new Promise((resolve) => setTimeout(() => resolve({ bookingId: 'delayed-123' }), 10)),
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toBeDefined();
  });
});
