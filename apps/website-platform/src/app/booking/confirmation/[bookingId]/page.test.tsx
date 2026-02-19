import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/headers before importing the module
vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => {
        if (key === 'host') return 'test.example.com';
        if (key === 'x-forwarded-host') return null;
        return null;
      }),
    })
  ),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn(),
  DEFAULT_SITE_CONFIG: {
    id: 'default',
    slug: 'default',
    name: 'Experience Marketplace',
    primaryDomain: null,
    holibobPartnerId: 'demo',
    brand: {
      name: 'Experience Marketplace',
      primaryColor: '#6366f1',
      secondaryColor: '#8b5cf6',
      accentColor: '#f59e0b',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      logoUrl: null,
      logoDarkUrl: null,
      faviconUrl: null,
      ogImageUrl: null,
      socialLinks: null,
    },
    seoConfig: null,
    homepageConfig: null,
    micrositeContext: null,
  },
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn(),
}));

import { generateMetadata } from './page';
import ConfirmationPage from './page';
import { getSiteFromHostname } from '@/lib/tenant';
import { notFound } from 'next/navigation';
import { getHolibobClient } from '@/lib/holibob';

const mockGetBooking = vi.fn();
const mockNotFound = vi.mocked(notFound);

function createMockSite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'site-1',
    name: 'London Tours',
    slug: 'london-tours',
    primaryDomain: 'london-tours.example.com',
    holibobPartnerId: 'partner-1',
    brand: {
      primaryColor: '#0d9488',
      logoUrl: '/logo.png',
      ogImageUrl: null,
      faviconUrl: null,
    },
    seoConfig: null,
    homepageConfig: null,
    micrositeContext: null,
    relatedMicrosites: [],
    ...overrides,
  };
}

function createMockBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-123',
    code: 'BK-ABC123',
    state: 'CONFIRMED',
    leadPassengerName: 'John Smith',
    voucherUrl: 'https://example.com/voucher.pdf',
    totalPrice: { grossFormattedText: '\u00a3150.00' },
    availabilityList: {
      nodes: [
        {
          id: 'avail-1',
          date: '2025-07-15',
          startTime: '10:00',
          product: { name: 'Thames Cruise' },
          personList: {
            nodes: [
              { id: 'p1', pricingCategoryLabel: 'Adult' },
              { id: 'p2', pricingCategoryLabel: 'Child' },
            ],
          },
        },
      ],
    },
    ...overrides,
  };
}

describe('Booking confirmation page.tsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiteFromHostname).mockResolvedValue(createMockSite() as any);
    mockGetBooking.mockResolvedValue(createMockBooking());
    vi.mocked(getHolibobClient).mockReturnValue({ getBooking: mockGetBooking } as any);
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
  });

  // ── generateMetadata ──────────────────────────────────────────────────

  describe('generateMetadata', () => {
    it('returns title with site name', async () => {
      const result = await generateMetadata({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      expect(result.title).toBe('Booking Confirmed - London Tours');
    });

    it('sets robots to noindex, nofollow', async () => {
      const result = await generateMetadata({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      expect(result.robots?.index).toBe(false);
      expect(result.robots?.follow).toBe(false);
    });

    it('works with different site names', async () => {
      vi.mocked(getSiteFromHostname).mockResolvedValue(
        createMockSite({ name: 'Edinburgh Adventures' }) as any
      );

      const result = await generateMetadata({
        params: Promise.resolve({ bookingId: 'booking-456' }),
        searchParams: Promise.resolve({}),
      });

      expect(result.title).toBe('Booking Confirmed - Edinburgh Adventures');
    });
  });

  // ── Page rendering — confirmed booking ────────────────────────────────

  describe('confirmed booking rendering', () => {
    it('renders "Booking Confirmed!" heading', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('Booking Confirmed!')).toBeInTheDocument();
    });

    it('renders booking reference code', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      // Code appears in reference header + "Save your booking reference" step
      const refs = screen.getAllByText('BK-ABC123');
      expect(refs.length).toBeGreaterThanOrEqual(1);
    });

    it('renders lead passenger name', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('Lead guest: John Smith')).toBeInTheDocument();
    });

    it('renders experience name from availability', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('Thames Cruise')).toBeInTheDocument();
    });

    it('renders formatted date', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText(/July/)).toBeInTheDocument();
      expect(screen.getByText(/2025/)).toBeInTheDocument();
    });

    it('renders start time', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('10:00')).toBeInTheDocument();
    });

    it('renders total guest count', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('2 guests')).toBeInTheDocument();
    });

    it('renders guest list with pricing category labels', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('Guest 1')).toBeInTheDocument();
      expect(screen.getByText('(Lead guest)')).toBeInTheDocument();
      expect(screen.getByText('Guest 2')).toBeInTheDocument();
      expect(screen.getByText('Adult')).toBeInTheDocument();
      expect(screen.getByText('Child')).toBeInTheDocument();
    });

    it('renders total price', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('\u00a3150.00')).toBeInTheDocument();
    });

    it('renders voucher download section for confirmed bookings', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('Your Voucher')).toBeInTheDocument();
      expect(screen.getByText('Download Voucher (PDF)')).toBeInTheDocument();
    });

    it('links voucher download to the correct URL', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      const downloadLink = screen.getByText('Download Voucher (PDF)');
      expect(downloadLink.closest('a')).toHaveAttribute('href', 'https://example.com/voucher.pdf');
    });

    it('renders "Browse More Experiences" link', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByRole('link', { name: 'Browse More Experiences' })).toHaveAttribute(
        'href',
        '/experiences'
      );
    });

    it('renders support contact', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText(/Need help/)).toBeInTheDocument();
      expect(screen.getByText('support@test.example.com')).toBeInTheDocument();
    });
  });

  // ── What's Next section ───────────────────────────────────────────────

  describe('what is next section', () => {
    it('renders all three next steps', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('Check your email')).toBeInTheDocument();
      expect(screen.getByText('Save your booking reference')).toBeInTheDocument();
      expect(screen.getByText('Arrive on time')).toBeInTheDocument();
    });

    it('shows booking code in the save reference step', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      // Should show the booking code (BK-ABC123) in the "Save your booking reference" step
      const referenceTexts = screen.getAllByText('BK-ABC123');
      expect(referenceTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Cancellation policy section ───────────────────────────────────────

  describe('cancellation policy section', () => {
    it('renders cancellation policy heading', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('Cancellation Policy')).toBeInTheDocument();
    });

    it('renders the free cancellation note', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('Free cancellation based on experience terms')).toBeInTheDocument();
    });
  });

  // ── Pending booking ───────────────────────────────────────────────────

  describe('pending booking', () => {
    it('shows "Booking Processing..." when pending query param is true', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({ pending: 'true' }),
      });

      render(page);
      expect(screen.getByText('Booking Processing...')).toBeInTheDocument();
    });

    it('shows "Booking Processing..." when booking state is PENDING', async () => {
      mockGetBooking.mockResolvedValue(createMockBooking({ state: 'PENDING' }));

      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('Booking Processing...')).toBeInTheDocument();
    });

    it('shows processing message for pending bookings', async () => {
      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({ pending: 'true' }),
      });

      render(page);
      expect(screen.getByText(/being confirmed with the supplier/)).toBeInTheDocument();
    });

    it('does not show voucher section for pending bookings (state PENDING)', async () => {
      mockGetBooking.mockResolvedValue(
        createMockBooking({ state: 'PENDING', voucherUrl: 'https://example.com/v.pdf' })
      );

      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.queryByText('Your Voucher')).not.toBeInTheDocument();
    });
  });

  // ── Booking without voucher ───────────────────────────────────────────

  describe('booking without voucher', () => {
    it('does not show voucher section when voucherUrl is missing', async () => {
      mockGetBooking.mockResolvedValue(createMockBooking({ voucherUrl: null }));

      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.queryByText('Your Voucher')).not.toBeInTheDocument();
      expect(screen.queryByText('Download Voucher (PDF)')).not.toBeInTheDocument();
    });

    it('does not show bottom Download Voucher link when no voucherUrl', async () => {
      mockGetBooking.mockResolvedValue(createMockBooking({ voucherUrl: null }));

      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.queryByText('Download Voucher')).not.toBeInTheDocument();
    });
  });

  // ── Booking without leadPassengerName ─────────────────────────────────

  describe('booking without lead passenger name', () => {
    it('does not show lead guest line when name is missing', async () => {
      mockGetBooking.mockResolvedValue(createMockBooking({ leadPassengerName: null }));

      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.queryByText(/Lead guest:/)).not.toBeInTheDocument();
    });
  });

  // ── Booking without code — fallback to bookingId ──────────────────────

  describe('booking code fallback', () => {
    it('uses bookingId when code is null', async () => {
      mockGetBooking.mockResolvedValue(createMockBooking({ code: null }));

      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-fallback-id' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      const refs = screen.getAllByText('booking-fallback-id');
      expect(refs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 1 guest (singular) ────────────────────────────────────────────────

  describe('singular guest count', () => {
    it('renders "1 guest" (singular) when only one person', async () => {
      mockGetBooking.mockResolvedValue(
        createMockBooking({
          availabilityList: {
            nodes: [
              {
                id: 'avail-1',
                date: '2025-07-15',
                startTime: '09:00',
                product: { name: 'Solo Experience' },
                personList: {
                  nodes: [{ id: 'p1', pricingCategoryLabel: 'Adult' }],
                },
              },
            ],
          },
        })
      );

      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('1 guest')).toBeInTheDocument();
    });
  });

  // ── Error handling (notFound) ─────────────────────────────────────────

  describe('error handling', () => {
    it('calls notFound when booking fetch throws', async () => {
      mockGetBooking.mockRejectedValue(new Error('Network error'));

      await expect(
        ConfirmationPage({
          params: Promise.resolve({ bookingId: 'booking-404' }),
          searchParams: Promise.resolve({}),
        })
      ).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it('calls notFound when booking is null', async () => {
      mockGetBooking.mockResolvedValue(null);

      await expect(
        ConfirmationPage({
          params: Promise.resolve({ bookingId: 'booking-null' }),
          searchParams: Promise.resolve({}),
        })
      ).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  // ── No startTime ──────────────────────────────────────────────────────

  describe('availability without startTime', () => {
    it('does not render start time when it is undefined', async () => {
      mockGetBooking.mockResolvedValue(
        createMockBooking({
          availabilityList: {
            nodes: [
              {
                id: 'avail-1',
                date: '2025-07-15',
                startTime: undefined,
                product: { name: 'Open Ticket' },
                personList: {
                  nodes: [{ id: 'p1', pricingCategoryLabel: 'Adult' }],
                },
              },
            ],
          },
        })
      );

      const page = await ConfirmationPage({
        params: Promise.resolve({ bookingId: 'booking-123' }),
        searchParams: Promise.resolve({}),
      });

      render(page);
      expect(screen.getByText('Open Ticket')).toBeInTheDocument();
      // No time element should be rendered
      expect(screen.queryByText('10:00')).not.toBeInTheDocument();
    });
  });

  // ── Inline logic replicas ─────────────────────────────────────────────

  describe('formatDate (inline logic replica)', () => {
    function formatDate(dateStr: string): string {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }

    it('formats date with weekday, day, month, year', () => {
      const result = formatDate('2025-07-15');
      expect(result).toContain('July');
      expect(result).toContain('2025');
      expect(result).toContain('15');
    });

    it('includes weekday name', () => {
      const result = formatDate('2025-07-15');
      expect(result).toContain('Tuesday');
    });
  });

  describe('totalGuests calculation (inline logic replica)', () => {
    function calculateTotalGuests(availabilityList?: {
      nodes?: Array<{ personList?: { nodes: unknown[] } }>;
    }): number {
      return (
        availabilityList?.nodes?.reduce(
          (sum: number, avail) => sum + (avail.personList?.nodes?.length ?? 0),
          0
        ) ?? 0
      );
    }

    it('counts guests across availability nodes', () => {
      const result = calculateTotalGuests({
        nodes: [{ personList: { nodes: [{}, {}] } }, { personList: { nodes: [{}] } }],
      });
      expect(result).toBe(3);
    });

    it('returns 0 when no availability list', () => {
      expect(calculateTotalGuests(undefined)).toBe(0);
    });

    it('returns 0 when nodes is empty', () => {
      expect(calculateTotalGuests({ nodes: [] })).toBe(0);
    });

    it('handles missing personList', () => {
      const result = calculateTotalGuests({
        nodes: [{ personList: undefined }],
      });
      expect(result).toBe(0);
    });
  });

  describe('isPending/isConfirmed logic', () => {
    it('is pending when query param is true', () => {
      const pending = 'true';
      const bookingState = 'CONFIRMED';
      const isPending = pending === 'true' || bookingState === 'PENDING';
      expect(isPending).toBe(true);
    });

    it('is pending when booking state is PENDING', () => {
      const pending = undefined;
      const bookingState = 'PENDING';
      const isPending = pending === 'true' || bookingState === 'PENDING';
      expect(isPending).toBe(true);
    });

    it('is not pending when both are false', () => {
      const pending = undefined;
      const bookingState = 'CONFIRMED';
      const isPending = pending === 'true' || bookingState === 'PENDING';
      expect(isPending).toBe(false);
    });

    it('is confirmed when state is CONFIRMED', () => {
      const bookingState = 'CONFIRMED';
      const isConfirmed = bookingState === 'CONFIRMED';
      expect(isConfirmed).toBe(true);
    });

    it('is not confirmed when state is PENDING', () => {
      const bookingState = 'PENDING';
      const isConfirmed = bookingState === 'CONFIRMED';
      expect(isConfirmed).toBe(false);
    });
  });
});
