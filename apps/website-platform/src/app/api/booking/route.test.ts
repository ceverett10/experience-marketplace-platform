import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

// Use vi.hoisted to define mocks that can be used in vi.mock factory
const { mockCreateBooking, mockGetBooking, mockGetBookingQuestions } = vi.hoisted(() => ({
  mockCreateBooking: vi.fn(),
  mockGetBooking: vi.fn(),
  mockGetBookingQuestions: vi.fn(),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    createBooking: mockCreateBooking,
    getBooking: mockGetBooking,
    getBookingQuestions: mockGetBookingQuestions,
  }),
}));

// Import after mocks
import { GET, POST } from './route';

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
      state: 'OPEN',
      availabilityList: { nodes: [] },
      canCommit: false,
    };
    mockGetBooking.mockResolvedValue(mockBooking);

    const request = new NextRequest('http://localhost:3000/api/booking?id=booking-123');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('booking-123');
    expect(mockGetBooking).toHaveBeenCalledWith('booking-123');
  });

  it('returns booking with questions when includeQuestions=true', async () => {
    const mockBookingWithQuestions = {
      id: 'booking-123',
      state: 'OPEN',
      canCommit: false,
      questionList: { nodes: [] },
      availabilityList: { nodes: [] },
    };
    mockGetBookingQuestions.mockResolvedValue(mockBookingWithQuestions);

    const request = new NextRequest('http://localhost:3000/api/booking?id=booking-123&includeQuestions=true');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.questionList).toBeDefined();
    expect(mockGetBookingQuestions).toHaveBeenCalledWith('booking-123');
    expect(mockGetBooking).not.toHaveBeenCalled();
  });
});

describe('Booking API Route - POST (L2B Step 6: Create Booking)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates empty booking with default autoFillQuestions=true', async () => {
    const mockBooking = {
      id: 'booking-123',
      state: 'OPEN',
      availabilityList: { nodes: [] },
      canCommit: false,
    };
    mockCreateBooking.mockResolvedValue(mockBooking);

    const request = new NextRequest('http://localhost:3000/api/booking', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('booking-123');
    expect(mockCreateBooking).toHaveBeenCalledWith({
      autoFillQuestions: true,
      partnerExternalReference: undefined,
      consumerTripId: undefined,
    });
  });

  it('creates booking with autoFillQuestions=false when specified', async () => {
    const mockBooking = {
      id: 'booking-123',
      state: 'OPEN',
      availabilityList: { nodes: [] },
      canCommit: false,
    };
    mockCreateBooking.mockResolvedValue(mockBooking);

    const request = new NextRequest('http://localhost:3000/api/booking', {
      method: 'POST',
      body: JSON.stringify({
        autoFillQuestions: false,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(mockCreateBooking).toHaveBeenCalledWith({
      autoFillQuestions: false,
      partnerExternalReference: undefined,
      consumerTripId: undefined,
    });
  });

  it('creates booking with optional reference IDs', async () => {
    const mockBooking = {
      id: 'booking-123',
      state: 'OPEN',
      availabilityList: { nodes: [] },
      canCommit: false,
    };
    mockCreateBooking.mockResolvedValue(mockBooking);

    const request = new NextRequest('http://localhost:3000/api/booking', {
      method: 'POST',
      body: JSON.stringify({
        partnerExternalReference: 'partner-ref-123',
        consumerTripId: 'trip-456',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(mockCreateBooking).toHaveBeenCalledWith({
      autoFillQuestions: true,
      partnerExternalReference: 'partner-ref-123',
      consumerTripId: 'trip-456',
    });
  });

  it('returns 500 on creation error', async () => {
    mockCreateBooking.mockRejectedValue(new Error('Network error'));

    const request = new NextRequest('http://localhost:3000/api/booking', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to create booking');
  });
});
