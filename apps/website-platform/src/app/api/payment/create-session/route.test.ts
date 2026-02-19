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

const { mockGetBooking, mockCheckoutSessionCreate } = vi.hoisted(() => ({
  mockGetBooking: vi.fn(),
  mockCheckoutSessionCreate: vi.fn(),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    getBooking: mockGetBooking,
  }),
}));

// Mock Stripe
vi.mock('stripe', () => {
  const StripeError = class extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'StripeError';
    }
  };
  const StripeMock = vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockCheckoutSessionCreate,
      },
    },
  }));
  (StripeMock as any).errors = { StripeError };
  return { default: StripeMock };
});

// Import after mocks
import { POST } from './route';

describe('Create Payment Session Route - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when bookingId is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/payment/create-session', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('returns 400 when bookingId is empty', async () => {
    const request = new NextRequest('http://localhost:3000/api/payment/create-session', {
      method: 'POST',
      body: JSON.stringify({ bookingId: '' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('returns 404 when booking not found', async () => {
    mockGetBooking.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/payment/create-session', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'booking-123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Booking not found');
  });

  it('returns 409 when booking is not PENDING', async () => {
    mockGetBooking.mockResolvedValue({
      id: 'booking-123',
      status: 'CONFIRMED',
    });

    const request = new NextRequest('http://localhost:3000/api/payment/create-session', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'booking-123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain('CONFIRMED');
  });

  it('creates checkout session for valid booking', async () => {
    mockGetBooking.mockResolvedValue({
      id: 'booking-123',
      status: 'PENDING',
      customerEmail: 'john@example.com',
      items: [
        {
          productName: 'London Eye Tour',
          currency: 'GBP',
          date: '2025-03-01',
          startTime: '10:00',
          guests: [{ name: 'John' }],
          unitPrice: 3500,
        },
      ],
      fees: 0,
    });
    mockCheckoutSessionCreate.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.com/cs_123',
    });

    const request = new NextRequest('http://localhost:3000/api/payment/create-session', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'booking-123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.url).toBe('https://checkout.stripe.com/cs_123');
    expect(data.sessionId).toBe('cs_123');
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: 'john@example.com',
        metadata: { bookingId: 'booking-123', siteId: 'test-site' },
      })
    );
  });

  it('includes service fee in line items', async () => {
    mockGetBooking.mockResolvedValue({
      id: 'booking-123',
      status: 'PENDING',
      customerEmail: 'jane@example.com',
      items: [
        {
          productName: 'Big Ben Tour',
          currency: 'GBP',
          date: '2025-03-01',
          guests: [{ name: 'Jane' }],
          unitPrice: 2500,
        },
      ],
      fees: 250,
      currency: 'GBP',
    });
    mockCheckoutSessionCreate.mockResolvedValue({
      id: 'cs_456',
      url: 'https://checkout.stripe.com/cs_456',
    });

    const request = new NextRequest('http://localhost:3000/api/payment/create-session', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'booking-123' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const createArgs = mockCheckoutSessionCreate.mock.calls[0]![0];
    // Should have 2 line items: product + service fee
    expect(createArgs.line_items).toHaveLength(2);
    expect(createArgs.line_items[1].price_data.product_data.name).toBe('Service Fee');
    expect(createArgs.line_items[1].price_data.unit_amount).toBe(250);
  });

  it('builds correct line item descriptions', async () => {
    mockGetBooking.mockResolvedValue({
      id: 'booking-123',
      status: 'PENDING',
      items: [
        {
          productName: 'Walking Tour',
          currency: 'GBP',
          date: '2025-03-01',
          startTime: '14:00',
          guests: [{ name: 'A' }, { name: 'B' }],
          unitPrice: 2000,
        },
      ],
    });
    mockCheckoutSessionCreate.mockResolvedValue({ id: 'cs_789', url: 'url' });

    const request = new NextRequest('http://localhost:3000/api/payment/create-session', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'booking-123' }),
    });

    await POST(request);

    const createArgs = mockCheckoutSessionCreate.mock.calls[0]![0];
    const lineItem = createArgs.line_items[0];
    expect(lineItem.price_data.product_data.description).toBe('2025-03-01 at 14:00 - 2 guests');
    expect(lineItem.quantity).toBe(2);
  });

  it('handles single guest description (no plural)', async () => {
    mockGetBooking.mockResolvedValue({
      id: 'booking-123',
      status: 'PENDING',
      items: [
        {
          productName: 'Solo Tour',
          currency: 'GBP',
          date: '2025-03-01',
          guests: [{ name: 'Solo' }],
          unitPrice: 1500,
        },
      ],
    });
    mockCheckoutSessionCreate.mockResolvedValue({ id: 'cs_solo', url: 'url' });

    const request = new NextRequest('http://localhost:3000/api/payment/create-session', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'booking-123' }),
    });

    await POST(request);

    const createArgs = mockCheckoutSessionCreate.mock.calls[0]![0];
    expect(createArgs.line_items[0].price_data.product_data.description).toContain('1 guest');
    expect(createArgs.line_items[0].price_data.product_data.description).not.toContain('guests');
  });

  it('returns 500 on generic error', async () => {
    mockGetBooking.mockRejectedValue(new Error('Network error'));

    const request = new NextRequest('http://localhost:3000/api/payment/create-session', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'booking-123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to create payment session');
  });
});
