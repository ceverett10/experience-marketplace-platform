import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the modules
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({
    get: vi.fn().mockReturnValue('localhost:3000'),
  })),
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
const { mockGetBooking, mockGetBookingQuestions, mockCommitBooking, mockWaitForConfirmation } = vi.hoisted(() => ({
  mockGetBooking: vi.fn(),
  mockGetBookingQuestions: vi.fn(),
  mockCommitBooking: vi.fn(),
  mockWaitForConfirmation: vi.fn(),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    getBooking: mockGetBooking,
    getBookingQuestions: mockGetBookingQuestions,
    commitBooking: mockCommitBooking,
    waitForConfirmation: mockWaitForConfirmation,
  }),
}));

// Import after mocks
import { POST } from './route';

describe('Booking Commit API Route - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when bookingId is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/booking/commit', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Either bookingId or bookingCode is required');
  });

  it('commits booking successfully and waits for confirmation', async () => {
    const mockBooking = {
      id: 'booking-123',
      state: 'OPEN',
    };
    const mockBookingWithQuestions = {
      id: 'booking-123',
      canCommit: true,
    };
    const mockPendingBooking = {
      id: 'booking-123',
      state: 'PENDING',
    };
    const mockConfirmedBooking = {
      id: 'booking-123',
      state: 'CONFIRMED',
      code: 'BOOK-ABC123',
      voucherUrl: 'https://voucher.example.com/123',
    };

    mockGetBooking.mockResolvedValue(mockBooking);
    mockGetBookingQuestions.mockResolvedValue(mockBookingWithQuestions);
    mockCommitBooking.mockResolvedValue(mockPendingBooking);
    mockWaitForConfirmation.mockResolvedValue(mockConfirmedBooking);

    const request = new NextRequest('http://localhost:3000/api/booking/commit', {
      method: 'POST',
      body: JSON.stringify({
        bookingId: 'booking-123',
        waitForConfirmation: true,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.booking.state).toBe('CONFIRMED');
    expect(data.data.isConfirmed).toBe(true);
    expect(mockCommitBooking).toHaveBeenCalledWith({ id: 'booking-123' });
  });

  it('returns immediately if booking is already confirmed', async () => {
    const mockBooking = {
      id: 'booking-123',
      state: 'OPEN',
    };
    const mockBookingWithQuestions = {
      id: 'booking-123',
      canCommit: true,
    };
    const mockConfirmedBooking = {
      id: 'booking-123',
      state: 'CONFIRMED',
      code: 'BOOK-ABC123',
    };

    mockGetBooking.mockResolvedValue(mockBooking);
    mockGetBookingQuestions.mockResolvedValue(mockBookingWithQuestions);
    mockCommitBooking.mockResolvedValue(mockConfirmedBooking);

    const request = new NextRequest('http://localhost:3000/api/booking/commit', {
      method: 'POST',
      body: JSON.stringify({
        bookingId: 'booking-123',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.booking.state).toBe('CONFIRMED');
    // Should not call waitForConfirmation if not requested
    expect(mockWaitForConfirmation).not.toHaveBeenCalled();
  });

  it('returns 409 when booking is rejected', async () => {
    const mockBooking = {
      id: 'booking-123',
      state: 'OPEN',
    };
    const mockBookingWithQuestions = {
      id: 'booking-123',
      canCommit: true,
    };

    mockGetBooking.mockResolvedValue(mockBooking);
    mockGetBookingQuestions.mockResolvedValue(mockBookingWithQuestions);
    mockCommitBooking.mockRejectedValue(new Error('Booking REJECTED by supplier'));

    const request = new NextRequest('http://localhost:3000/api/booking/commit', {
      method: 'POST',
      body: JSON.stringify({
        bookingId: 'booking-123',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe('Booking was rejected by supplier');
  });

  it('returns 500 on commit failure', async () => {
    const mockBooking = {
      id: 'booking-123',
      state: 'OPEN',
    };
    const mockBookingWithQuestions = {
      id: 'booking-123',
      canCommit: true,
    };

    mockGetBooking.mockResolvedValue(mockBooking);
    mockGetBookingQuestions.mockResolvedValue(mockBookingWithQuestions);
    mockCommitBooking.mockRejectedValue(new Error('Network error'));

    const request = new NextRequest('http://localhost:3000/api/booking/commit', {
      method: 'POST',
      body: JSON.stringify({
        bookingId: 'booking-123',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to commit booking');
  });
});
