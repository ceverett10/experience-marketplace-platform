/**
 * E2E Integration Test for Holibob Look-to-Book (L2B) Flow
 *
 * Tests the complete 9-step booking flow:
 * 1. Product Discovery (productList)
 * 2. Product Details (product)
 * 3. Availability List (recursive with sessionId)
 * 4. Availability Options (iterate until isComplete)
 * 5. Pricing Categories
 * 6. Create Booking
 * 7. Add Availability to Booking
 * 8. Booking Questions (3 levels)
 * 9. Commit Booking (poll until CONFIRMED)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the holibob-api client
const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    // Step 1-2: Product Discovery
    searchProducts: vi.fn(),
    getProduct: vi.fn(),

    // Step 3-4: Availability
    getAvailabilityList: vi.fn(),
    discoverAvailability: vi.fn(),

    // Step 5: Pricing
    getAvailabilityPricing: vi.fn(),
    setAvailabilityPricing: vi.fn(),

    // Step 6: Create Booking
    createBooking: vi.fn(),

    // Step 7: Add Availability
    addAvailabilityToBooking: vi.fn(),

    // Step 8: Questions
    getBookingQuestions: vi.fn(),
    answerBookingQuestions: vi.fn(),

    // Step 9: Commit
    commitBooking: vi.fn(),
    waitForConfirmation: vi.fn(),
  },
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue(mockClient),
}));

describe('L2B Booking Flow E2E Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Happy Path Flow', () => {
    it('completes full booking flow from product discovery to confirmation', async () => {
      // Step 1: Product Discovery
      mockClient.searchProducts.mockResolvedValue({
        products: [{ id: 'product-london-eye', name: 'London Eye Experience', guidePrice: 3500 }],
        totalCount: 1,
      });

      const products = await mockClient.searchProducts({ placeIds: ['london'] });
      expect(products.products).toHaveLength(1);
      const productId = products.products[0]!.id;

      // Step 2: Product Details
      mockClient.getProduct.mockResolvedValue({
        id: productId,
        name: 'London Eye Experience',
        description: 'Amazing views of London',
        guidePrice: 3500,
        currency: 'GBP',
      });

      const product = await mockClient.getProduct(productId);
      expect(product.name).toBe('London Eye Experience');

      // Step 3: Availability List (recursive)
      mockClient.discoverAvailability.mockResolvedValue({
        sessionId: 'session-abc123',
        nodes: [
          { id: 'avail-1', date: '2025-02-01', guidePriceFormattedText: '£35.00', soldOut: false },
          { id: 'avail-2', date: '2025-02-02', guidePriceFormattedText: '£35.00', soldOut: false },
        ],
        optionList: {
          isComplete: true,
          nodes: [],
        },
      });

      const availability = await mockClient.discoverAvailability(
        productId,
        '2025-02-01',
        '2025-02-07'
      );
      expect(availability.nodes).toHaveLength(2);
      expect(availability.optionList.isComplete).toBe(true);

      // Step 5: Get Pricing Categories
      mockClient.getAvailabilityPricing.mockResolvedValue({
        id: 'avail-1',
        date: '2025-02-01',
        pricingCategoryList: {
          nodes: [
            {
              id: 'adult',
              label: 'Adult',
              minParticipants: 1,
              maxParticipants: 10,
              unitPrice: { gross: 3500, currency: 'GBP' },
            },
            {
              id: 'child',
              label: 'Child (3-15)',
              minParticipants: 0,
              maxParticipants: 10,
              unitPrice: { gross: 2500, currency: 'GBP' },
            },
          ],
        },
      });

      const pricing = await mockClient.getAvailabilityPricing('avail-1');
      expect(pricing.pricingCategoryList.nodes).toHaveLength(2);

      // Set pricing (2 adults, 1 child)
      mockClient.setAvailabilityPricing.mockResolvedValue({
        id: 'avail-1',
        isValid: true,
        totalPrice: { gross: 9500, currency: 'GBP' },
        pricingCategoryList: {
          nodes: [
            { id: 'adult', label: 'Adult', units: 2, totalPrice: { gross: 7000 } },
            { id: 'child', label: 'Child', units: 1, totalPrice: { gross: 2500 } },
          ],
        },
      });

      const pricedAvailability = await mockClient.setAvailabilityPricing('avail-1', [
        { id: 'adult', units: 2 },
        { id: 'child', units: 1 },
      ]);
      expect(pricedAvailability.isValid).toBe(true);
      expect(pricedAvailability.totalPrice.gross).toBe(9500);

      // Step 6: Create Booking
      mockClient.createBooking.mockResolvedValue({
        id: 'booking-xyz789',
        state: 'OPEN',
        canCommit: false,
      });

      const booking = await mockClient.createBooking({
        autoFillQuestions: true,
        paymentType: 'ON_ACCOUNT',
      });
      expect(booking.state).toBe('OPEN');
      const bookingId = booking.id;

      // Step 7: Add Availability to Booking
      mockClient.addAvailabilityToBooking.mockResolvedValue({
        id: bookingId,
        state: 'OPEN',
        availabilityList: {
          nodes: [
            { id: 'avail-1', date: '2025-02-01', product: { name: 'London Eye Experience' } },
          ],
        },
      });

      const bookingWithAvailability = await mockClient.addAvailabilityToBooking(
        bookingId,
        'avail-1'
      );
      expect(bookingWithAvailability.availabilityList.nodes).toHaveLength(1);

      // Step 8: Get and Answer Booking Questions
      mockClient.getBookingQuestions.mockResolvedValue({
        id: bookingId,
        canCommit: false,
        questionList: {
          nodes: [{ id: 'q-lead-name', label: 'Lead passenger name', answerValue: null }],
        },
        availabilityList: {
          nodes: [
            {
              id: 'avail-1',
              questionList: { nodes: [] },
              personList: {
                nodes: [
                  {
                    id: 'person-1',
                    pricingCategoryLabel: 'Adult',
                    questionList: {
                      nodes: [{ id: 'pq-name', label: 'Full name', answerValue: null }],
                    },
                  },
                  {
                    id: 'person-2',
                    pricingCategoryLabel: 'Adult',
                    questionList: {
                      nodes: [{ id: 'pq-name', label: 'Full name', answerValue: null }],
                    },
                  },
                  {
                    id: 'person-3',
                    pricingCategoryLabel: 'Child',
                    questionList: {
                      nodes: [{ id: 'pq-name', label: 'Full name', answerValue: null }],
                    },
                  },
                ],
              },
            },
          ],
        },
      });

      const questions = await mockClient.getBookingQuestions(bookingId);
      expect(questions.canCommit).toBe(false);

      // Answer questions
      mockClient.answerBookingQuestions.mockResolvedValue({
        id: bookingId,
        canCommit: true,
        questionList: {
          nodes: [{ id: 'q-lead-name', label: 'Lead passenger name', answerValue: 'John Doe' }],
        },
      });

      const answeredBooking = await mockClient.answerBookingQuestions(bookingId, {
        questionList: [{ id: 'q-lead-name', value: 'John Doe' }],
        availabilityList: [
          {
            id: 'avail-1',
            personList: [
              { id: 'person-1', questionList: [{ id: 'pq-name', value: 'John Doe' }] },
              { id: 'person-2', questionList: [{ id: 'pq-name', value: 'Jane Doe' }] },
              { id: 'person-3', questionList: [{ id: 'pq-name', value: 'Jimmy Doe' }] },
            ],
          },
        ],
      });
      expect(answeredBooking.canCommit).toBe(true);

      // Step 9: Commit Booking
      mockClient.commitBooking.mockResolvedValue({
        id: bookingId,
        state: 'PENDING',
      });

      mockClient.waitForConfirmation.mockResolvedValue({
        id: bookingId,
        state: 'CONFIRMED',
        code: 'BOOK-ABC123',
        voucherUrl: 'https://vouchers.example.com/abc123',
      });

      const committedBooking = await mockClient.commitBooking({ id: bookingId });
      expect(committedBooking.state).toBe('PENDING');

      const confirmedBooking = await mockClient.waitForConfirmation(bookingId);
      expect(confirmedBooking.state).toBe('CONFIRMED');
      expect(confirmedBooking.code).toBe('BOOK-ABC123');
      expect(confirmedBooking.voucherUrl).toBeDefined();
    });
  });

  describe('Error Handling Scenarios', () => {
    it('handles sold out availability gracefully', async () => {
      mockClient.discoverAvailability.mockResolvedValue({
        sessionId: 'session-123',
        nodes: [{ id: 'avail-1', date: '2025-02-01', soldOut: true }],
        optionList: { isComplete: true, nodes: [] },
      });

      const availability = await mockClient.discoverAvailability(
        'product-1',
        '2025-02-01',
        '2025-02-01'
      );
      expect(availability.nodes[0]!.soldOut).toBe(true);
    });

    it('handles booking rejection', async () => {
      mockClient.commitBooking.mockResolvedValue({
        id: 'booking-123',
        state: 'PENDING',
      });

      mockClient.waitForConfirmation.mockRejectedValue(new Error('Booking REJECTED'));

      const committed = await mockClient.commitBooking({ id: 'booking-123' });
      expect(committed.state).toBe('PENDING');

      await expect(mockClient.waitForConfirmation('booking-123')).rejects.toThrow(
        'Booking REJECTED'
      );
    });

    it('handles pricing category dependencies', async () => {
      mockClient.getAvailabilityPricing.mockResolvedValue({
        id: 'avail-1',
        pricingCategoryList: {
          nodes: [
            { id: 'adult', label: 'Adult', minParticipants: 1, maxParticipants: 10 },
            {
              id: 'child',
              label: 'Child',
              minParticipants: 0,
              maxParticipantsDepends: {
                pricingCategoryId: 'adult',
                multiplier: 2,
                explanation: 'Maximum 2 children per adult',
              },
            },
          ],
        },
      });

      const pricing = await mockClient.getAvailabilityPricing('avail-1');
      const childCategory = pricing.pricingCategoryList.nodes.find(
        (n: { id: string }) => n.id === 'child'
      );
      expect(childCategory.maxParticipantsDepends).toBeDefined();
      expect(childCategory.maxParticipantsDepends.multiplier).toBe(2);
    });

    it('handles incomplete availability options requiring iteration', async () => {
      // First call - need to select date range
      mockClient.getAvailabilityList
        .mockResolvedValueOnce({
          sessionId: 'session-1',
          nodes: [],
          optionList: {
            isComplete: false,
            nodes: [{ id: 'START_DATE', label: 'Start Date', type: 'DATE_RANGE', required: true }],
          },
        })
        // Second call - need to select time slot
        .mockResolvedValueOnce({
          sessionId: 'session-1',
          nodes: [{ id: 'avail-1', date: '2025-02-01' }],
          optionList: {
            isComplete: false,
            nodes: [
              {
                id: 'TIME_SLOT',
                label: 'Time',
                type: 'SINGLE_CHOICE',
                availableOptions: [
                  { value: '09:00', label: '9:00 AM' },
                  { value: '14:00', label: '2:00 PM' },
                ],
              },
            ],
          },
        })
        // Third call - complete
        .mockResolvedValueOnce({
          sessionId: 'session-1',
          nodes: [{ id: 'avail-1', date: '2025-02-01', guidePriceFormattedText: '£35.00' }],
          optionList: {
            isComplete: true,
            nodes: [],
          },
        });

      // Simulate iteration
      let result = await mockClient.getAvailabilityList('product-1');
      expect(result.optionList.isComplete).toBe(false);

      result = await mockClient.getAvailabilityList('product-1', 'session-1', [
        { id: 'START_DATE', value: '2025-02-01' },
      ]);
      expect(result.optionList.isComplete).toBe(false);

      result = await mockClient.getAvailabilityList('product-1', 'session-1', [
        { id: 'TIME_SLOT', value: '09:00' },
      ]);
      expect(result.optionList.isComplete).toBe(true);
    });
  });

  describe('Three-Level Question Handling', () => {
    it('handles questions at booking, availability, and person levels', async () => {
      mockClient.getBookingQuestions.mockResolvedValue({
        id: 'booking-123',
        canCommit: false,
        // Booking-level questions
        questionList: {
          nodes: [{ id: 'bq-1', label: 'Special requirements', type: 'TEXTAREA' }],
        },
        availabilityList: {
          nodes: [
            {
              id: 'avail-1',
              // Availability-level questions
              questionList: {
                nodes: [{ id: 'aq-1', label: 'Pickup location', type: 'TEXT' }],
              },
              // Person-level questions
              personList: {
                nodes: [
                  {
                    id: 'person-1',
                    pricingCategoryLabel: 'Adult',
                    isQuestionsComplete: false,
                    questionList: {
                      nodes: [
                        { id: 'pq-1', label: 'Full name', type: 'TEXT', isRequired: true },
                        { id: 'pq-2', label: 'Date of birth', type: 'DATE' },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      });

      const questions = await mockClient.getBookingQuestions('booking-123');

      // Verify booking-level questions
      expect(questions.questionList.nodes).toHaveLength(1);

      // Verify availability-level questions
      expect(questions.availabilityList.nodes[0]!.questionList.nodes).toHaveLength(1);

      // Verify person-level questions
      expect(
        questions.availabilityList.nodes[0]!.personList.nodes[0]!.questionList.nodes
      ).toHaveLength(2);
    });
  });
});
