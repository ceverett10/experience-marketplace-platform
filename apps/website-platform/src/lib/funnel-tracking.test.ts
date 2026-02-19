import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCookiesGet, mockPrismaCreate } = vi.hoisted(() => ({
  mockCookiesGet: vi.fn(),
  mockPrismaCreate: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: mockCookiesGet,
  })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    bookingFunnelEvent: {
      create: mockPrismaCreate,
    },
  },
}));

// Mock the Prisma enum
vi.mock('@prisma/client', () => ({
  BookingFunnelStep: {
    LANDING_PAGE_VIEW: 'LANDING_PAGE_VIEW',
    EXPERIENCE_CLICKED: 'EXPERIENCE_CLICKED',
    AVAILABILITY_SELECTED: 'AVAILABILITY_SELECTED',
    BOOKING_CREATED: 'BOOKING_CREATED',
    PAYMENT_STARTED: 'PAYMENT_STARTED',
    BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  },
}));

import { trackFunnelEvent, BookingFunnelStep } from './funnel-tracking';

describe('funnel-tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaCreate.mockResolvedValue({ id: 'event-1' });
  });

  it('creates a funnel event with required fields', () => {
    mockCookiesGet.mockReturnValue(undefined);

    trackFunnelEvent({
      step: BookingFunnelStep.LANDING_PAGE_VIEW,
      siteId: 'site-123',
    });

    expect(mockPrismaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        step: 'LANDING_PAGE_VIEW',
        siteId: 'site-123',
        sessionId: 'unknown',
        productId: null,
        bookingId: null,
        errorCode: null,
        errorMessage: null,
        durationMs: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        landingPage: null,
      }),
    });
  });

  it('reads funnel_session cookie', () => {
    mockCookiesGet.mockImplementation((key: string) => {
      if (key === 'funnel_session') return { value: 'sess-abc-123' };
      return undefined;
    });

    trackFunnelEvent({
      step: BookingFunnelStep.EXPERIENCE_CLICKED,
      siteId: 'site-123',
      productId: 'prod-456',
    });

    expect(mockPrismaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'sess-abc-123',
        productId: 'prod-456',
      }),
    });
  });

  it('parses UTM params from cookie', () => {
    mockCookiesGet.mockImplementation((key: string) => {
      if (key === 'funnel_session') return { value: 'sess-1' };
      if (key === 'utm_params')
        return {
          value: JSON.stringify({
            source: 'facebook_ads',
            medium: 'cpc',
            campaign: 'summer-2025',
          }),
        };
      return undefined;
    });

    trackFunnelEvent({
      step: BookingFunnelStep.LANDING_PAGE_VIEW,
      siteId: 'site-123',
    });

    expect(mockPrismaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        utmSource: 'facebook_ads',
        utmMedium: 'cpc',
        utmCampaign: 'summer-2025',
      }),
    });
  });

  it('handles malformed UTM cookie JSON gracefully', () => {
    mockCookiesGet.mockImplementation((key: string) => {
      if (key === 'utm_params') return { value: 'not-valid-json' };
      return undefined;
    });

    trackFunnelEvent({
      step: BookingFunnelStep.LANDING_PAGE_VIEW,
      siteId: 'site-123',
    });

    expect(mockPrismaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
      }),
    });
  });

  it('passes optional fields through', () => {
    mockCookiesGet.mockReturnValue(undefined);

    trackFunnelEvent({
      step: BookingFunnelStep.PAYMENT_STARTED,
      siteId: 'site-123',
      bookingId: 'booking-789',
      errorCode: 'CARD_DECLINED',
      errorMessage: 'Your card was declined',
      durationMs: 1500,
      landingPage: '/checkout/booking-789',
    });

    expect(mockPrismaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: 'booking-789',
        errorCode: 'CARD_DECLINED',
        errorMessage: 'Your card was declined',
        durationMs: 1500,
        landingPage: '/checkout/booking-789',
      }),
    });
  });

  it('truncates error messages to 2000 characters', () => {
    mockCookiesGet.mockReturnValue(undefined);

    const longMessage = 'x'.repeat(3000);
    trackFunnelEvent({
      step: BookingFunnelStep.PAYMENT_STARTED,
      siteId: 'site-123',
      errorMessage: longMessage,
    });

    const createCall = mockPrismaCreate.mock.calls[0]![0];
    expect(createCall.data.errorMessage).toHaveLength(2000);
  });

  it('handles cookies() throwing (outside request context)', async () => {
    // Simulate calling outside request context
    const { cookies } = vi.mocked(await import('next/headers'));
    (cookies as any).mockImplementation(() => {
      throw new Error('No request context');
    });

    // Should not throw
    expect(() => {
      trackFunnelEvent({
        step: BookingFunnelStep.LANDING_PAGE_VIEW,
        siteId: 'site-123',
      });
    }).not.toThrow();

    // Should still create event with defaults
    expect(mockPrismaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'unknown',
        utmSource: null,
      }),
    });

    // Restore cookies mock
    (cookies as any).mockImplementation(() => ({ get: mockCookiesGet }));
  });

  it('does not await the prisma write (fire-and-forget)', () => {
    mockCookiesGet.mockReturnValue(undefined);
    // Make prisma reject — should not throw from trackFunnelEvent
    mockPrismaCreate.mockRejectedValue(new Error('DB write failed'));

    expect(() => {
      trackFunnelEvent({
        step: BookingFunnelStep.LANDING_PAGE_VIEW,
        siteId: 'site-123',
      });
    }).not.toThrow();
  });

  it('re-exports BookingFunnelStep enum', () => {
    expect(BookingFunnelStep.LANDING_PAGE_VIEW).toBe('LANDING_PAGE_VIEW');
    expect(BookingFunnelStep.EXPERIENCE_CLICKED).toBe('EXPERIENCE_CLICKED');
    expect(BookingFunnelStep.PAYMENT_STARTED).toBe('PAYMENT_STARTED');
  });
});
