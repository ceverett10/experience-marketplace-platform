import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the modules
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
const { mockGetBookingQuestions, mockAnswerBookingQuestions } = vi.hoisted(() => ({
  mockGetBookingQuestions: vi.fn(),
  mockAnswerBookingQuestions: vi.fn(),
}));

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
        nodes: [{ id: 'q1', label: 'Pickup location', answerValue: null }],
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
                    nodes: [{ id: 'pq1', label: 'Full name', answerValue: null }],
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
    expect(data.data.summary.bookingQuestions).toHaveLength(1);
    expect(data.data.summary.availabilityQuestions).toHaveLength(1);
    expect(data.data.summary.canCommit).toBe(false);
  });
});

describe('Booking Questions API Route - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when termsAccepted is not provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/booking/test-123/questions', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'test-123' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('You must accept the terms and conditions');
  });

  it('answers booking questions successfully', async () => {
    const mockBooking = {
      id: 'booking-123',
      canCommit: true,
      questionList: { nodes: [] },
      availabilityList: { nodes: [] },
    };
    mockGetBookingQuestions.mockResolvedValue(mockBooking);
    mockAnswerBookingQuestions.mockResolvedValue(mockBooking);

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/questions', {
      method: 'POST',
      body: JSON.stringify({
        termsAccepted: true,
        questionList: [{ id: 'q1', value: 'Hotel lobby' }],
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
      canCommit: false,
      questionList: { nodes: [] },
      availabilityList: {
        nodes: [
          {
            id: 'avail-1',
            questionList: { nodes: [] },
            personList: {
              nodes: [
                {
                  id: 'person-1',
                  questionList: {
                    nodes: [
                      { id: 'pq1', label: 'First name', answerValue: null },
                      { id: 'pq2', label: 'Last name', answerValue: null },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    const mockAnsweredBooking = {
      ...mockBooking,
      canCommit: true,
    };
    mockGetBookingQuestions.mockResolvedValue(mockBooking);
    mockAnswerBookingQuestions.mockResolvedValue(mockAnsweredBooking);

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/questions', {
      method: 'POST',
      body: JSON.stringify({
        termsAccepted: true,
        customerEmail: 'john@example.com',
        guests: [
          {
            firstName: 'John',
            lastName: 'Doe',
            isLeadGuest: true,
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
        leadPassengerName: 'John Doe',
        answerList: expect.any(Array),
      })
    );
  });

  it('merges questionAnswers into answerList', async () => {
    const mockBooking = {
      id: 'booking-123',
      canCommit: false,
      questionList: { nodes: [] },
      availabilityList: {
        nodes: [
          {
            id: 'avail-1',
            questionList: { nodes: [] },
            personList: {
              nodes: [
                {
                  id: 'person-1',
                  questionList: {
                    nodes: [
                      { id: 'pq1', label: 'First name', answerValue: null },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    const mockAnsweredBooking = { ...mockBooking, canCommit: true };
    mockGetBookingQuestions.mockResolvedValue(mockBooking);
    mockAnswerBookingQuestions.mockResolvedValue(mockAnsweredBooking);

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/questions', {
      method: 'POST',
      body: JSON.stringify({
        termsAccepted: true,
        guests: [{ firstName: 'John', lastName: 'Doe', isLeadGuest: true }],
        questionAnswers: [
          { questionId: 'aq-pickup', value: 'Hotel Lobby' },
        ],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'booking-123' }) });
    expect(response.status).toBe(200);

    // Verify questionAnswers merged into answerList
    const callArgs = mockAnswerBookingQuestions.mock.calls[0]![1];
    const answerList = callArgs.answerList as Array<{ questionId: string; value: string }>;
    expect(answerList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionId: 'aq-pickup', value: 'Hotel Lobby' }),
      ])
    );
  });

  it('deduplicates questionAnswers against label-matched answers', async () => {
    const mockBooking = {
      id: 'booking-123',
      canCommit: false,
      questionList: { nodes: [] },
      availabilityList: {
        nodes: [
          {
            id: 'avail-1',
            questionList: { nodes: [] },
            personList: {
              nodes: [
                {
                  id: 'person-1',
                  questionList: {
                    nodes: [
                      { id: 'pq1', label: 'First name', answerValue: null },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    const mockAnsweredBooking = { ...mockBooking, canCommit: true };
    mockGetBookingQuestions.mockResolvedValue(mockBooking);
    mockAnswerBookingQuestions.mockResolvedValue(mockAnsweredBooking);

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/questions', {
      method: 'POST',
      body: JSON.stringify({
        termsAccepted: true,
        guests: [{ firstName: 'John', lastName: 'Doe', isLeadGuest: true }],
        // Try to send a questionAnswer for the same question ID that label-matching would resolve
        questionAnswers: [
          { questionId: 'pq1', value: 'Manual Override' },
        ],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'booking-123' }) });
    expect(response.status).toBe(200);

    // pq1 should appear only once in answerList (from label matching, not from questionAnswers)
    const callArgs = mockAnswerBookingQuestions.mock.calls[0]![1];
    const answerList = callArgs.answerList as Array<{ questionId: string; value: string }>;
    const pq1Entries = answerList.filter((a) => a.questionId === 'pq1');
    expect(pq1Entries).toHaveLength(1);
    // The label-matched value ('John') should win over the manual override
    expect(pq1Entries[0]!.value).toBe('John');
  });

  it('merges availabilityAnswers into answerList', async () => {
    const mockBooking = {
      id: 'booking-123',
      canCommit: false,
      questionList: { nodes: [] },
      availabilityList: {
        nodes: [
          {
            id: 'avail-1',
            questionList: { nodes: [] },
            personList: {
              nodes: [
                {
                  id: 'person-1',
                  questionList: {
                    nodes: [
                      { id: 'pq1', label: 'First name', answerValue: null },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    const mockAnsweredBooking = { ...mockBooking, canCommit: true };
    mockGetBookingQuestions.mockResolvedValue(mockBooking);
    mockAnswerBookingQuestions.mockResolvedValue(mockAnsweredBooking);

    const request = new NextRequest('http://localhost:3000/api/booking/booking-123/questions', {
      method: 'POST',
      body: JSON.stringify({
        termsAccepted: true,
        guests: [{ firstName: 'John', lastName: 'Doe', isLeadGuest: true }],
        availabilityAnswers: [
          { questionId: 'aq-waiver', value: 'Yes' },
        ],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'booking-123' }) });
    expect(response.status).toBe(200);

    const callArgs = mockAnswerBookingQuestions.mock.calls[0]![1];
    const answerList = callArgs.answerList as Array<{ questionId: string; value: string }>;
    expect(answerList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionId: 'aq-waiver', value: 'Yes' }),
      ])
    );
  });
});
