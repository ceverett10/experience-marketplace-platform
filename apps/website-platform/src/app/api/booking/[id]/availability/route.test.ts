import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the modules first before any imports
vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn().mockReturnValue('localhost:3000'),
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

// Use vi.hoisted to define mocks that can be used in vi.mock factory
const { mockAddAvailabilityToBooking, mockGetBookingQuestions } = vi.hoisted(() => ({
  mockAddAvailabilityToBooking: vi.fn(),
  mockGetBookingQuestions: vi.fn(),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    addAvailabilityToBooking: mockAddAvailabilityToBooking,
    getBookingQuestions: mockGetBookingQuestions,
  }),
}));

// Import after mocks
import { POST } from './route';

describe('Booking Add Availability API Route - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default success responses
    mockAddAvailabilityToBooking.mockResolvedValue({
      canCommit: true,
      booking: {
        id: 'booking-123',
        state: 'OPEN',
      },
    });
    mockGetBookingQuestions.mockResolvedValue({
      id: 'booking-123',
      canCommit: false,
      questionList: { nodes: [] },
      availabilityList: {
        nodes: [
          {
            id: 'avail-123',
            date: '2025-02-01',
            product: { id: 'product-1', name: 'London Eye' },
            questionList: { nodes: [] },
            personList: { nodes: [] },
          },
        ],
      },
    });
  });

  it('returns 400 when availabilityId is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/availability', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'booking-123' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('adds availability to booking successfully', async () => {
    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/availability', {
      method: 'POST',
      body: JSON.stringify({
        availabilityId: 'avail-123',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'booking-123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.canCommit).toBe(true);
    expect(data.data.booking).toBeDefined();
    expect(mockAddAvailabilityToBooking).toHaveBeenCalledWith({
      bookingSelector: { id: 'booking-123' },
      id: 'avail-123',
    });
    expect(mockGetBookingQuestions).toHaveBeenCalledWith('booking-123');
  });

  it('returns 404 when booking not found', async () => {
    mockAddAvailabilityToBooking.mockRejectedValue(new Error('Booking not found'));

    const request = new NextRequest('http://localhost:3000/api/booking/nonexistent/availability', {
      method: 'POST',
      body: JSON.stringify({
        availabilityId: 'avail-123',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Booking or availability not found');
  });

  it('returns 400 when availability is invalid', async () => {
    // The route checks for 'invalid' or 'not valid' in the error message
    mockAddAvailabilityToBooking.mockRejectedValue(new Error('Availability is not valid'));

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/availability', {
      method: 'POST',
      body: JSON.stringify({
        availabilityId: 'invalid-avail',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'booking-123' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Availability is not valid for booking (options/pricing incomplete)');
  });

  it('returns 500 on unexpected error', async () => {
    mockAddAvailabilityToBooking.mockRejectedValue(new Error('Network error'));

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/availability', {
      method: 'POST',
      body: JSON.stringify({
        availabilityId: 'avail-123',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'booking-123' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to add availability to booking');
  });
});
