import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn().mockReturnValue('localhost:3000'),
    })
  ),
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    })
  ),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn().mockResolvedValue({
    id: 'test-site',
    name: 'Test Site',
    holibobPartnerId: 'partner-123',
    brand: { primaryColor: '#6366f1' },
  }),
}));

const { mockGetBookingQuestions, mockGetStripePaymentIntent } = vi.hoisted(() => ({
  mockGetBookingQuestions: vi.fn(),
  mockGetStripePaymentIntent: vi.fn(),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    getBookingQuestions: mockGetBookingQuestions,
    getStripePaymentIntent: mockGetStripePaymentIntent,
  }),
}));

const { mockTrackFunnelEvent } = vi.hoisted(() => ({
  mockTrackFunnelEvent: vi.fn(),
}));

vi.mock('@/lib/funnel-tracking', () => ({
  trackFunnelEvent: mockTrackFunnelEvent,
  BookingFunnelStep: {
    LANDING_PAGE_VIEW: 'LANDING_PAGE_VIEW',
    EXPERIENCE_CLICKED: 'EXPERIENCE_CLICKED',
    PAYMENT_STARTED: 'PAYMENT_STARTED',
  },
}));

// Import after mocks
import { GET } from './route';

describe('Payment Intent Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when booking not found', async () => {
    mockGetBookingQuestions.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/payment-intent');

    const response = await GET(request, {
      params: Promise.resolve({ id: 'booking-123' }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Booking not found');
  });

  it('returns 400 when booking cannot be committed', async () => {
    mockGetBookingQuestions.mockResolvedValue({
      id: 'booking-123',
      canCommit: false,
    });

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/payment-intent');

    const response = await GET(request, {
      params: Promise.resolve({ id: 'booking-123' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('complete all required information');
  });

  it('returns payment intent data for ready booking', async () => {
    mockGetBookingQuestions.mockResolvedValue({
      id: 'booking-123',
      canCommit: true,
      totalPrice: 5000,
    });
    mockGetStripePaymentIntent.mockResolvedValue({
      id: 'pi_abc123',
      clientSecret: 'pi_abc123_secret_xyz',
      apiKey: 'pk_test_xxx',
      amount: 5000,
    });

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/payment-intent');

    const response = await GET(request, {
      params: Promise.resolve({ id: 'booking-123' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.clientSecret).toBe('pi_abc123_secret_xyz');
    expect(data.data.apiKey).toBe('pk_test_xxx');
    expect(data.data.amount).toBe(5000);
    expect(data.data.paymentIntentId).toBe('pi_abc123');
    expect(data.data.booking.id).toBe('booking-123');
    expect(data.data.booking.totalPrice).toBe(5000);
  });

  it('tracks PAYMENT_STARTED funnel event on success', async () => {
    mockGetBookingQuestions.mockResolvedValue({
      id: 'booking-123',
      canCommit: true,
      totalPrice: 5000,
    });
    mockGetStripePaymentIntent.mockResolvedValue({
      id: 'pi_abc123',
      clientSecret: 'secret',
      apiKey: 'pk_test',
      amount: 5000,
    });

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/payment-intent');

    await GET(request, { params: Promise.resolve({ id: 'booking-123' }) });

    expect(mockTrackFunnelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'PAYMENT_STARTED',
        siteId: 'test-site',
        bookingId: 'booking-123',
      })
    );
  });

  it('returns 404 for "not found" errors from Holibob', async () => {
    mockGetBookingQuestions.mockRejectedValue(new Error('Booking not found'));

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/payment-intent');

    const response = await GET(request, {
      params: Promise.resolve({ id: 'booking-123' }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Booking not found');
  });

  it('returns 400 with skipPayment for ON_ACCOUNT bookings', async () => {
    mockGetBookingQuestions.mockResolvedValue({
      id: 'booking-123',
      canCommit: true,
    });
    mockGetStripePaymentIntent.mockRejectedValue(new Error('No stripe payment intent available'));

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/payment-intent');

    const response = await GET(request, {
      params: Promise.resolve({ id: 'booking-123' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.skipPayment).toBe(true);
  });

  it('returns 500 for unknown errors', async () => {
    mockGetBookingQuestions.mockRejectedValue(new Error('Network timeout'));

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/payment-intent');

    const response = await GET(request, {
      params: Promise.resolve({ id: 'booking-123' }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to get payment intent');
  });

  it('tracks funnel event with error on failure', async () => {
    mockGetBookingQuestions.mockRejectedValue(new Error('Network timeout'));

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/payment-intent');

    await GET(request, { params: Promise.resolve({ id: 'booking-123' }) });

    expect(mockTrackFunnelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'PAYMENT_STARTED',
        errorCode: 'PAYMENT_ERROR',
        errorMessage: 'Network timeout',
      })
    );
  });
});
