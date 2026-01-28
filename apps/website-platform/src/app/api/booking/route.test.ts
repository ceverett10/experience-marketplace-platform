import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the modules
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({
    get: vi.fn().mockReturnValue('localhost:3000'),
  })),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn().mockReturnValue({
    id: 'test-site',
    name: 'Test Site',
    holibobPartnerId: 'partner-123',
    brand: { primaryColor: '#6366f1' },
  }),
}));

const mockCreateBooking = vi.fn();
const mockGetBooking = vi.fn();

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    createBooking: mockCreateBooking,
    getBooking: mockGetBooking,
  }),
}));

// Import after mocks
import { GET, POST } from './route';
import { NextRequest } from 'next/server';

describe('Booking API Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when booking ID is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/booking');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Booking ID is required');
  });

  it('returns 404 when booking not found', async () => {
    mockGetBooking.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/booking?id=nonexistent');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Booking not found');
  });

  it('returns booking data when found', async () => {
    const mockBooking = {
      id: 'booking-123',
      status: 'PENDING',
      items: [],
      total: 7000,
      currency: 'GBP',
      customerEmail: 'test@example.com',
      createdAt: '2025-01-28T12:00:00Z',
      updatedAt: '2025-01-28T12:00:00Z',
    };
    mockGetBooking.mockResolvedValue(mockBooking);

    const request = new NextRequest('http://localhost:3000/api/booking?id=booking-123');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('booking-123');
  });
});

describe('Booking API Route - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when request body is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/booking', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('returns 400 when email is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/booking', {
      method: 'POST',
      body: JSON.stringify({
        customerEmail: 'invalid-email',
        items: [
          {
            availabilityId: 'avail-1',
            guests: [
              { guestTypeId: 'adult', firstName: 'John', lastName: 'Doe' },
            ],
          },
        ],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('returns 400 when no items provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/booking', {
      method: 'POST',
      body: JSON.stringify({
        customerEmail: 'test@example.com',
        items: [],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('returns 400 when guest names are missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/booking', {
      method: 'POST',
      body: JSON.stringify({
        customerEmail: 'test@example.com',
        items: [
          {
            availabilityId: 'avail-1',
            guests: [
              { guestTypeId: 'adult', firstName: '', lastName: '' },
            ],
          },
        ],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('creates booking with valid data', async () => {
    const mockBooking = {
      id: 'booking-123',
      status: 'PENDING',
      items: [
        {
          availabilityId: 'avail-1',
          productId: 'product-1',
          productName: 'London Eye',
          date: '2025-02-01',
          startTime: '10:00',
          guests: [
            { guestTypeId: 'adult', firstName: 'John', lastName: 'Doe' },
          ],
          unitPrice: 3500,
          totalPrice: 3500,
          currency: 'GBP',
        },
      ],
      total: 3500,
      currency: 'GBP',
      customerEmail: 'test@example.com',
      createdAt: '2025-01-28T12:00:00Z',
      updatedAt: '2025-01-28T12:00:00Z',
    };
    mockCreateBooking.mockResolvedValue(mockBooking);

    const request = new NextRequest('http://localhost:3000/api/booking', {
      method: 'POST',
      body: JSON.stringify({
        customerEmail: 'test@example.com',
        customerPhone: '+44123456789',
        items: [
          {
            availabilityId: 'avail-1',
            guests: [
              { guestTypeId: 'adult', firstName: 'John', lastName: 'Doe' },
            ],
          },
        ],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('booking-123');
    expect(mockCreateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: 'test@example.com',
        customerPhone: '+44123456789',
        items: expect.arrayContaining([
          expect.objectContaining({
            availabilityId: 'avail-1',
            guests: expect.arrayContaining([
              expect.objectContaining({
                firstName: 'John',
                lastName: 'Doe',
              }),
            ]),
          }),
        ]),
      })
    );
  });

  it('returns 409 when availability error occurs', async () => {
    mockCreateBooking.mockRejectedValue(new Error('No availability'));

    const request = new NextRequest('http://localhost:3000/api/booking', {
      method: 'POST',
      body: JSON.stringify({
        customerEmail: 'test@example.com',
        items: [
          {
            availabilityId: 'avail-1',
            guests: [
              { guestTypeId: 'adult', firstName: 'John', lastName: 'Doe' },
            ],
          },
        ],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to create booking');
  });
});
