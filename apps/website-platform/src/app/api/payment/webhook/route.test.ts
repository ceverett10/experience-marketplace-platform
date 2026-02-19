import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock next/headers
const mockHeadersGet = vi.fn();
vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: mockHeadersGet,
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
  DEFAULT_SITE_CONFIG: {
    id: 'default',
    name: 'Test Site',
    holibobPartnerId: 'partner-123',
    brand: { primaryColor: '#6366f1' },
  },
}));

// Use vi.hoisted for mocks referenced in vi.mock factories
const { mockGetBooking, mockConstructEvent } = vi.hoisted(() => ({
  mockGetBooking: vi.fn(),
  mockConstructEvent: vi.fn(),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    getBooking: mockGetBooking,
  }),
}));

// Mock Stripe
vi.mock('stripe', () => {
  const StripeMock = vi.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }));
  // Add errors namespace for StripeError
  (StripeMock as any).errors = { StripeError: class StripeError extends Error {} };
  return { default: StripeMock };
});

// Import after mocks
import { POST } from './route';

describe('Stripe Webhook Route - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeadersGet.mockReturnValue('localhost:3000');
  });

  it('returns 400 when stripe-signature header is missing', async () => {
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === 'stripe-signature') return null;
      return 'localhost:3000';
    });

    const request = new NextRequest('http://localhost:3000/api/payment/webhook', {
      method: 'POST',
      body: '{}',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing Stripe signature');
  });

  it('returns 400 when signature verification fails', async () => {
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === 'stripe-signature') return 'sig_invalid';
      return 'localhost:3000';
    });
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Signature verification failed');
    });

    const request = new NextRequest('http://localhost:3000/api/payment/webhook', {
      method: 'POST',
      body: '{}',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid signature');
  });

  it('handles checkout.session.completed with valid booking', async () => {
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === 'stripe-signature') return 'sig_valid';
      return 'localhost:3000';
    });
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { bookingId: 'booking-123', siteId: 'site-1' },
          payment_intent: 'pi_123',
          amount_total: 5000,
          currency: 'gbp',
        },
      },
    });
    mockGetBooking.mockResolvedValue({
      id: 'booking-123',
      status: 'PENDING',
    });

    const request = new NextRequest('http://localhost:3000/api/payment/webhook', {
      method: 'POST',
      body: '{"type":"checkout.session.completed"}',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);
    expect(mockGetBooking).toHaveBeenCalledWith('booking-123');
  });

  it('skips already confirmed bookings', async () => {
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === 'stripe-signature') return 'sig_valid';
      return 'localhost:3000';
    });
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { bookingId: 'booking-123' },
          payment_intent: 'pi_123',
          amount_total: 5000,
          currency: 'gbp',
        },
      },
    });
    mockGetBooking.mockResolvedValue({
      id: 'booking-123',
      status: 'CONFIRMED',
    });

    const request = new NextRequest('http://localhost:3000/api/payment/webhook', {
      method: 'POST',
      body: '{}',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('handles checkout.session.completed without bookingId', async () => {
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === 'stripe-signature') return 'sig_valid';
      return 'localhost:3000';
    });
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {},
        },
      },
    });

    const request = new NextRequest('http://localhost:3000/api/payment/webhook', {
      method: 'POST',
      body: '{}',
    });

    const response = await POST(request);
    // Should still return 200 (webhook received)
    expect(response.status).toBe(200);
    expect(mockGetBooking).not.toHaveBeenCalled();
  });

  it('handles checkout.session.expired', async () => {
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === 'stripe-signature') return 'sig_valid';
      return 'localhost:3000';
    });
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.expired',
      data: {
        object: {
          metadata: { bookingId: 'booking-456' },
        },
      },
    });

    const request = new NextRequest('http://localhost:3000/api/payment/webhook', {
      method: 'POST',
      body: '{}',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('handles payment_intent.payment_failed', async () => {
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === 'stripe-signature') return 'sig_valid';
      return 'localhost:3000';
    });
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          metadata: { bookingId: 'booking-789' },
          last_payment_error: { message: 'Card declined' },
        },
      },
    });

    const request = new NextRequest('http://localhost:3000/api/payment/webhook', {
      method: 'POST',
      body: '{}',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('handles unrecognized event types gracefully', async () => {
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === 'stripe-signature') return 'sig_valid';
      return 'localhost:3000';
    });
    mockConstructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: {} },
    });

    const request = new NextRequest('http://localhost:3000/api/payment/webhook', {
      method: 'POST',
      body: '{}',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);
  });

  it('returns 500 when handler throws', async () => {
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === 'stripe-signature') return 'sig_valid';
      return 'localhost:3000';
    });
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { bookingId: 'booking-err' },
        },
      },
    });
    mockGetBooking.mockRejectedValue(new Error('DB timeout'));

    const request = new NextRequest('http://localhost:3000/api/payment/webhook', {
      method: 'POST',
      body: '{}',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Webhook handler failed');
  });
});
