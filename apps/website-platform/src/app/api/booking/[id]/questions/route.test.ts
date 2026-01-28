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

const mockGetBookingQuestions = vi.fn();
const mockAnswerBookingQuestions = vi.fn();

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    getBookingQuestions: mockGetBookingQuestions,
    answerBookingQuestions: mockAnswerBookingQuestions,
  }),
}));

// Import after mocks
import { GET, POST } from './route';

describe('Booking Questions API Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when booking not found', async () => {
    mockGetBookingQuestions.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/booking/test-123/questions');

    const response = await GET(request, { params: Promise.resolve({ id: 'test-123' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Booking not found');
  });

  it('returns booking questions when found', async () => {
    const mockBooking = {
      id: 'booking-123',
      questionList: {
        nodes: [
          { id: 'q1', label: 'Pickup location', answerValue: null },
        ],
      },
      availabilityList: {
        nodes: [
          {
            id: 'avail-1',
            date: '2025-02-01',
            product: { name: 'London Eye' },
            questionList: { nodes: [] },
            personList: {
              nodes: [
                {
                  id: 'person-1',
                  pricingCategoryLabel: 'Adult',
                  isQuestionsComplete: false,
                  questionList: {
                    nodes: [
                      { id: 'pq1', label: 'Full name', answerValue: null },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
      canCommit: false,
    };
    mockGetBookingQuestions.mockResolvedValue(mockBooking);

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/questions');

    const response = await GET(request, { params: Promise.resolve({ id: 'booking-123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.questionsSummary.bookingQuestions).toHaveLength(1);
    expect(data.data.questionsSummary.availabilityQuestions).toHaveLength(1);
    expect(data.data.questionsSummary.canCommit).toBe(false);
  });
});

describe('Booking Questions API Route - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when request body is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/booking/test-123/questions', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'test-123' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('answers booking questions successfully', async () => {
    const mockBooking = {
      id: 'booking-123',
      canCommit: true,
      questionList: { nodes: [] },
      availabilityList: { nodes: [] },
    };
    mockAnswerBookingQuestions.mockResolvedValue(mockBooking);

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/questions', {
      method: 'POST',
      body: JSON.stringify({
        questionList: [
          { id: 'q1', value: 'Hotel lobby' },
        ],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'booking-123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.canCommit).toBe(true);
  });

  it('answers person-level questions', async () => {
    const mockBooking = {
      id: 'booking-123',
      canCommit: true,
      questionList: { nodes: [] },
      availabilityList: { nodes: [] },
    };
    mockAnswerBookingQuestions.mockResolvedValue(mockBooking);

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/questions', {
      method: 'POST',
      body: JSON.stringify({
        availabilityList: [
          {
            id: 'avail-1',
            personList: [
              {
                id: 'person-1',
                questionList: [
                  { id: 'pq1', value: 'John Doe' },
                ],
              },
            ],
          },
        ],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'booking-123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockAnswerBookingQuestions).toHaveBeenCalledWith(
      'booking-123',
      expect.objectContaining({
        availabilityList: expect.arrayContaining([
          expect.objectContaining({
            id: 'avail-1',
            personList: expect.arrayContaining([
              expect.objectContaining({
                id: 'person-1',
              }),
            ]),
          }),
        ]),
      })
    );
  });
});
