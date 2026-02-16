/**
 * Mock data fixtures for booking flow E2E tests.
 * These mock the Next.js API route responses (not the upstream Holibob GraphQL).
 */

export const MOCK_BOOKING_ID = 'mock-booking-001';
export const MOCK_AVAILABILITY_ID = 'mock-avail-001';
export const MOCK_PRODUCT_ID = 'mock-product-001';

export const mockAvailabilitySlots = {
  success: true,
  data: {
    sessionId: 'session-001',
    nodes: [
      {
        id: MOCK_AVAILABILITY_ID,
        date: '2026-03-15',
        guidePriceFormattedText: '£25.00',
        soldOut: false,
      },
      {
        id: 'mock-avail-002',
        date: '2026-03-16',
        guidePriceFormattedText: '£25.00',
        soldOut: false,
      },
    ],
    optionList: { nodes: [] },
  },
};

export const mockAvailabilityDetail = {
  success: true,
  data: {
    id: MOCK_AVAILABILITY_ID,
    date: '2026-03-15',
    optionList: {
      isComplete: false,
      nodes: [
        {
          id: 'opt-time',
          label: 'Time Slot',
          dataType: 'STRING',
          availableOptions: [
            { label: '09:00 AM', value: '09:00' },
            { label: '02:00 PM', value: '14:00' },
          ],
        },
      ],
    },
  },
};

export const mockAvailabilityOptionsComplete = {
  success: true,
  data: {
    id: MOCK_AVAILABILITY_ID,
    date: '2026-03-15',
    optionList: {
      isComplete: true,
      nodes: [
        {
          id: 'opt-time',
          label: 'Time Slot',
          dataType: 'STRING',
          answerValue: '09:00',
          availableOptions: [
            { label: '09:00 AM', value: '09:00' },
            { label: '02:00 PM', value: '14:00' },
          ],
        },
      ],
    },
  },
};

export const mockAvailabilityPricing = {
  success: true,
  data: {
    id: MOCK_AVAILABILITY_ID,
    date: '2026-03-15',
    optionList: { isComplete: true, nodes: [] },
    isValid: true,
    totalPrice: {
      grossFormattedText: '£50.00',
      netFormattedText: '£45.00',
      gross: 5000,
      net: 4500,
      currency: 'GBP',
    },
    pricingCategoryList: {
      nodes: [
        {
          id: 'cat-adult',
          label: 'Adult',
          minParticipants: 1,
          maxParticipants: 10,
          units: 2,
          unitPrice: {
            netFormattedText: '£22.50',
            grossFormattedText: '£25.00',
            gross: 2500,
            net: 2250,
            currency: 'GBP',
          },
          totalPrice: {
            grossFormattedText: '£50.00',
            gross: 5000,
            currency: 'GBP',
          },
        },
        {
          id: 'cat-child',
          label: 'Child',
          minParticipants: 0,
          maxParticipants: 10,
          units: 0,
          unitPrice: {
            netFormattedText: '£15.00',
            grossFormattedText: '£15.00',
            gross: 1500,
            net: 1500,
            currency: 'GBP',
          },
        },
      ],
    },
  },
};

export const mockBookingCreate = {
  success: true,
  data: {
    id: MOCK_BOOKING_ID,
    code: 'BK-001',
    state: 'OPEN',
    isComplete: false,
    paymentState: 'PENDING',
  },
};

export const mockAddAvailability = {
  success: true,
  data: {
    canCommit: false,
    booking: {
      id: MOCK_BOOKING_ID,
      code: 'BK-001',
      state: 'OPEN',
      canCommit: false,
      totalPrice: {
        grossFormattedText: '£50.00',
        gross: 5000,
        currency: 'GBP',
      },
    },
  },
};

/** Standard booking questions - only name/email/phone at person level */
export const mockBookingQuestions = {
  success: true,
  data: {
    booking: {
      id: MOCK_BOOKING_ID,
      code: 'BK-001',
      state: 'OPEN',
      canCommit: false,
      leadPassengerName: null,
      totalPrice: {
        grossFormattedText: '£50.00',
        gross: 5000,
        currency: 'GBP',
      },
      questionList: { nodes: [] },
      availabilityList: {
        nodes: [
          {
            id: MOCK_AVAILABILITY_ID,
            date: '2026-03-15',
            product: { id: MOCK_PRODUCT_ID, name: 'Sunset Kayak Tour' },
            totalPrice: {
              grossFormattedText: '£50.00',
              gross: 5000,
              currency: 'GBP',
            },
            questionList: { nodes: [] },
            personList: {
              nodes: [
                {
                  id: 'person-1',
                  pricingCategoryLabel: 'Adult',
                  isQuestionsComplete: false,
                  questionList: {
                    nodes: [
                      {
                        id: 'pq-fn',
                        label: 'First name',
                        type: 'TEXT',
                        dataType: 'STRING',
                        answerValue: null,
                        isRequired: true,
                      },
                      {
                        id: 'pq-ln',
                        label: 'Last name',
                        type: 'TEXT',
                        dataType: 'STRING',
                        answerValue: null,
                        isRequired: true,
                      },
                      {
                        id: 'pq-em',
                        label: 'Email',
                        type: 'EMAIL',
                        dataType: 'STRING',
                        answerValue: null,
                        isRequired: true,
                      },
                      {
                        id: 'pq-ph',
                        label: 'Phone number',
                        type: 'PHONE',
                        dataType: 'STRING',
                        answerValue: null,
                        isRequired: true,
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    summary: {
      bookingQuestions: [],
      availabilityQuestions: [
        {
          availabilityId: MOCK_AVAILABILITY_ID,
          productName: 'Sunset Kayak Tour',
          date: '2026-03-15',
          questions: [],
          personQuestions: [
            {
              personId: 'person-1',
              category: 'Adult',
              isComplete: false,
              questions: [
                {
                  id: 'pq-fn',
                  label: 'First name',
                  type: 'TEXT',
                  dataType: 'STRING',
                  answerValue: null,
                  isRequired: true,
                },
                {
                  id: 'pq-ln',
                  label: 'Last name',
                  type: 'TEXT',
                  dataType: 'STRING',
                  answerValue: null,
                  isRequired: true,
                },
                {
                  id: 'pq-em',
                  label: 'Email',
                  type: 'EMAIL',
                  dataType: 'STRING',
                  answerValue: null,
                  isRequired: true,
                },
                {
                  id: 'pq-ph',
                  label: 'Phone number',
                  type: 'PHONE',
                  dataType: 'STRING',
                  answerValue: null,
                  isRequired: true,
                },
              ],
            },
          ],
        },
      ],
      canCommit: false,
    },
  },
};

/** Booking with additional SELECT + BOOLEAN dynamic questions */
export const mockBookingQuestionsWithDynamic = {
  success: true,
  data: {
    booking: {
      ...mockBookingQuestions.data.booking,
      availabilityList: {
        nodes: [
          {
            ...mockBookingQuestions.data.booking.availabilityList.nodes[0],
            questionList: {
              nodes: [
                {
                  id: 'aq-pickup',
                  label: 'Pickup Location',
                  type: 'SELECT',
                  dataType: 'STRING',
                  answerValue: null,
                  isRequired: true,
                  availableOptions: [
                    { label: 'Hotel Lobby', value: 'hotel' },
                    { label: 'Airport Terminal', value: 'airport' },
                    { label: 'City Center', value: 'city' },
                  ],
                },
                {
                  id: 'aq-waiver',
                  label: 'I accept the risk waiver for this activity',
                  type: 'BOOLEAN',
                  dataType: 'BOOLEAN',
                  answerValue: null,
                  isRequired: true,
                },
              ],
            },
          },
        ],
      },
    },
    summary: {
      ...mockBookingQuestions.data.summary,
      availabilityQuestions: [
        {
          ...mockBookingQuestions.data.summary.availabilityQuestions[0],
          questions: [
            {
              id: 'aq-pickup',
              label: 'Pickup Location',
              type: 'SELECT',
              dataType: 'STRING',
              answerValue: null,
              isRequired: true,
              availableOptions: [
                { label: 'Hotel Lobby', value: 'hotel' },
                { label: 'Airport Terminal', value: 'airport' },
                { label: 'City Center', value: 'city' },
              ],
            },
            {
              id: 'aq-waiver',
              label: 'I accept the risk waiver for this activity',
              type: 'BOOLEAN',
              dataType: 'BOOLEAN',
              answerValue: null,
              isRequired: true,
            },
          ],
        },
      ],
    },
  },
};

/** First round: has a SELECT question. After answering, a TEXT question appears. */
export const mockBookingQuestionsConditionalRound1 = {
  success: true,
  data: {
    booking: {
      ...mockBookingQuestions.data.booking,
      availabilityList: {
        nodes: [
          {
            ...mockBookingQuestions.data.booking.availabilityList.nodes[0],
            questionList: {
              nodes: [
                {
                  id: 'aq-transport',
                  label: 'Transport Type',
                  type: 'SELECT',
                  dataType: 'STRING',
                  answerValue: null,
                  isRequired: true,
                  availableOptions: [
                    { label: 'Hotel Pickup', value: 'hotel' },
                    { label: 'Self Arrival', value: 'self' },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
    summary: {
      ...mockBookingQuestions.data.summary,
      availabilityQuestions: [
        {
          ...mockBookingQuestions.data.summary.availabilityQuestions[0],
          questions: [
            {
              id: 'aq-transport',
              label: 'Transport Type',
              type: 'SELECT',
              dataType: 'STRING',
              answerValue: null,
              isRequired: true,
              availableOptions: [
                { label: 'Hotel Pickup', value: 'hotel' },
                { label: 'Self Arrival', value: 'self' },
              ],
            },
          ],
        },
      ],
    },
  },
};

/** Second round after answering transport=hotel: new TEXT question for hotel name */
export const mockBookingQuestionsConditionalRound2 = {
  success: true,
  data: {
    booking: {
      ...mockBookingQuestions.data.booking,
      availabilityList: {
        nodes: [
          {
            ...mockBookingQuestions.data.booking.availabilityList.nodes[0],
            questionList: {
              nodes: [
                {
                  id: 'aq-transport',
                  label: 'Transport Type',
                  type: 'SELECT',
                  dataType: 'STRING',
                  answerValue: 'hotel',
                  isRequired: true,
                  availableOptions: [
                    { label: 'Hotel Pickup', value: 'hotel' },
                    { label: 'Self Arrival', value: 'self' },
                  ],
                },
                {
                  id: 'aq-hotel-name',
                  label: 'Hotel Name',
                  type: 'TEXT',
                  dataType: 'STRING',
                  answerValue: null,
                  isRequired: true,
                },
              ],
            },
          },
        ],
      },
    },
    summary: {
      ...mockBookingQuestions.data.summary,
      availabilityQuestions: [
        {
          ...mockBookingQuestions.data.summary.availabilityQuestions[0],
          questions: [
            {
              id: 'aq-transport',
              label: 'Transport Type',
              type: 'SELECT',
              dataType: 'STRING',
              answerValue: 'hotel',
              isRequired: true,
              availableOptions: [
                { label: 'Hotel Pickup', value: 'hotel' },
                { label: 'Self Arrival', value: 'self' },
              ],
            },
            {
              id: 'aq-hotel-name',
              label: 'Hotel Name',
              type: 'TEXT',
              dataType: 'STRING',
              answerValue: null,
              isRequired: true,
            },
          ],
        },
      ],
      canCommit: false,
    },
  },
};

/** Booking after all answers submitted - canCommit = true */
export const mockBookingAnswered = {
  success: true,
  data: {
    canCommit: true,
    booking: {
      ...mockBookingQuestions.data.booking,
      canCommit: true,
      leadPassengerName: 'John Smith',
    },
  },
};

/** canCommit still false - used for iterative loop testing */
export const mockBookingNotReady = {
  success: true,
  data: {
    canCommit: false,
    booking: {
      ...mockBookingQuestions.data.booking,
      canCommit: false,
    },
  },
};

export const mockBookingCommitted = {
  success: true,
  data: {
    booking: {
      ...mockBookingQuestions.data.booking,
      state: 'CONFIRMED',
      status: 'CONFIRMED',
      voucherUrl: 'https://example.com/voucher/BK-001',
    },
    voucherUrl: 'https://example.com/voucher/BK-001',
    isConfirmed: true,
  },
};

/** Mock GET /api/booking response */
export const mockBookingGet = {
  success: true,
  data: {
    id: MOCK_BOOKING_ID,
    code: 'BK-001',
    state: 'OPEN',
    canCommit: false,
    totalPrice: {
      grossFormattedText: '£50.00',
      gross: 5000,
      currency: 'GBP',
    },
    availabilityList: {
      nodes: [
        {
          id: MOCK_AVAILABILITY_ID,
          date: '2026-03-15',
          product: { id: MOCK_PRODUCT_ID, name: 'Sunset Kayak Tour' },
          totalPrice: { grossFormattedText: '£50.00', gross: 5000, currency: 'GBP' },
          personList: {
            nodes: [{ id: 'person-1', pricingCategoryLabel: 'Adult' }],
          },
        },
      ],
    },
  },
};
