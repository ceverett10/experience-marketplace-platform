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

const mockCommitBooking = vi.fn();
const mockWaitForConfirmation = vi.fn();

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
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
    expect(data.error).toBe('Validation failed');
  });

  it('commits booking successfully and waits for confirmation', async () => {
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

    mockCommitBooking.mockResolvedValue(mockPendingBooking);
    mockWaitForConfirmation.mockResolvedValue(mockConfirmedBooking);

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
    expect(data.data.state).toBe('CONFIRMED');
    expect(data.data.code).toBe('BOOK-ABC123');
    expect(mockCommitBooking).toHaveBeenCalledWith({ id: 'booking-123' });
  });

  it('returns immediately if booking is already confirmed', async () => {
    const mockConfirmedBooking = {
      id: 'booking-123',
      state: 'CONFIRMED',
      code: 'BOOK-ABC123',
    };

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
    expect(data.data.state).toBe('CONFIRMED');
    // Should not call waitForConfirmation if already confirmed
    expect(mockWaitForConfirmation).not.toHaveBeenCalled();
  });

  it('returns 409 when booking is rejected', async () => {
    const mockPendingBooking = {
      id: 'booking-123',
      state: 'PENDING',
    };

    mockCommitBooking.mockResolvedValue(mockPendingBooking);
    mockWaitForConfirmation.mockRejectedValue(new Error('Booking REJECTED'));

    const request = new NextRequest('http://localhost:3000/api/booking/commit', {
      method: 'POST',
      body: JSON.stringify({
        bookingId: 'booking-123',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe('Booking REJECTED');
  });

  it('returns 500 on commit failure', async () => {
    mockCommitBooking.mockRejectedValue(new Error('Commit failed'));

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
