import { GraphQLClient, type RequestMiddleware } from 'graphql-request';
import { createHmac } from 'crypto';
import {
  type HolibobClientConfig,
  type Product,
  type ProductFilter,
  type ProductListResponse,
  type AvailabilityListResponse,
  type AvailabilityOptionInput,
  type AvailabilityDetail,
  type AvailabilityInput,
  type Booking,
  type BookingCreateInput,
  type BookingAddAvailabilityInput,
  type BookingInput,
  type BookingSelectorInput,
  type Category,
  type Place,
  type PlaceType,
} from '../types/index.js';
import {
  PRODUCT_LIST_QUERY,
  PRODUCT_DETAIL_QUERY,
  AVAILABILITY_LIST_QUERY,
  AVAILABILITY_QUERY,
  AVAILABILITY_SET_OPTIONS_QUERY,
  AVAILABILITY_PRICING_QUERY,
  AVAILABILITY_SET_PRICING_QUERY,
  BOOKING_CREATE_MUTATION,
  BOOKING_ADD_AVAILABILITY_MUTATION,
  BOOKING_QUESTIONS_QUERY,
  BOOKING_ANSWER_QUESTIONS_QUERY,
  BOOKING_COMMIT_MUTATION,
  BOOKING_STATE_QUERY,
  BOOKING_FULL_QUERY,
  BOOKING_LIST_QUERY,
  BOOKING_CANCEL_MUTATION,
  CATEGORIES_QUERY,
  PLACES_QUERY,
} from '../queries/index.js';

export class HolibobClient {
  private client: GraphQLClient;
  private config: HolibobClientConfig;

  constructor(config: HolibobClientConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      sandbox: false,
      ...config,
    };

    // Build headers - always include API key and partner ID
    const baseHeaders: Record<string, string> = {
      'X-API-Key': this.config.apiKey,
      'X-Partner-Id': this.config.partnerId,
      'Content-Type': 'application/json',
    };

    // If API secret is provided, use HMAC signature authentication
    if (this.config.apiSecret) {
      // Use request middleware to add signature headers dynamically
      const requestMiddleware: RequestMiddleware = async (request) => {
        const timestamp = new Date().toISOString();
        const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        const signature = this.generateSignature(timestamp, body);

        return {
          ...request,
          headers: {
            ...request.headers,
            'X-Holibob-Date': timestamp,
            'X-Holibob-Signature': signature,
          },
        };
      };

      this.client = new GraphQLClient(this.config.apiUrl, {
        headers: baseHeaders,
        requestMiddleware,
      });
    } else {
      // Simple API key authentication (for development/testing)
      this.client = new GraphQLClient(this.config.apiUrl, {
        headers: baseHeaders,
      });
    }
  }

  /**
   * Generate HMAC-SHA256 signature for request authentication
   */
  private generateSignature(timestamp: string, body: string): string {
    if (!this.config.apiSecret) {
      throw new Error('API secret is required for signature generation');
    }

    // Create signature payload: timestamp + body
    const payload = `${timestamp}${body}`;

    // Generate HMAC-SHA256 signature
    const hmac = createHmac('sha256', this.config.apiSecret);
    hmac.update(payload);

    return hmac.digest('hex');
  }

  // ==========================================================================
  // STEP 1: PRODUCT DISCOVERY
  // ==========================================================================

  /**
   * Search and discover products based on filters
   */
  async discoverProducts(
    filter: ProductFilter,
    pagination?: { first?: number; after?: string }
  ): Promise<ProductListResponse> {
    const variables = {
      filter: this.mapProductFilter(filter),
      first: pagination?.first ?? 20,
      after: pagination?.after,
    };

    const response = await this.executeQuery<{
      productList: {
        nodes: Product[];
        pageInfo: ProductListResponse['pageInfo'];
        totalCount: number;
      };
    }>(PRODUCT_LIST_QUERY, variables);

    return {
      products: response.productList.nodes,
      pageInfo: response.productList.pageInfo,
      totalCount: response.productList.totalCount,
    };
  }

  // ==========================================================================
  // STEP 2: PRODUCT DETAILS
  // ==========================================================================

  /**
   * Get a single product by ID with full details
   */
  async getProduct(productId: string): Promise<Product | null> {
    const response = await this.executeQuery<{ product: Product | null }>(PRODUCT_DETAIL_QUERY, {
      id: productId,
    });

    return response.product;
  }

  // ==========================================================================
  // STEP 3: AVAILABILITY LIST (Recursive Method - RECOMMENDED)
  // ==========================================================================

  /**
   * Get availability list for a product using the recursive method.
   *
   * Flow:
   * 1. First call returns options that must be answered (START_DATE, END_DATE, etc.)
   * 2. Subsequent calls with sessionId and optionList answers
   * 3. Continue until nodes array has availability slots
   *
   * @param productId - The product ID
   * @param sessionId - Session ID from previous call (optional for first call)
   * @param optionList - Answers to options from previous call
   */
  async getAvailabilityList(
    productId: string,
    sessionId?: string,
    optionList?: AvailabilityOptionInput[]
  ): Promise<AvailabilityListResponse> {
    const response = await this.executeQuery<{
      availabilityList: AvailabilityListResponse;
    }>(AVAILABILITY_LIST_QUERY, {
      productId,
      sessionId,
      optionList,
    });

    return response.availabilityList;
  }

  /**
   * Helper: Complete availability discovery by answering all required options
   * Returns available slots once all options are answered
   */
  async discoverAvailability(
    productId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<AvailabilityListResponse> {
    // First call - get initial options
    let result = await this.getAvailabilityList(productId);

    // Find and answer date options
    const optionAnswers: AvailabilityOptionInput[] = [];
    for (const option of result.optionList.nodes) {
      if (option.id.includes('START_DATE') || option.label?.toLowerCase().includes('start')) {
        optionAnswers.push({ id: option.id, value: dateFrom });
      } else if (option.id.includes('END_DATE') || option.label?.toLowerCase().includes('end')) {
        optionAnswers.push({ id: option.id, value: dateTo });
      }
    }

    // If we have date answers, make another call
    if (optionAnswers.length > 0) {
      result = await this.getAvailabilityList(productId, result.sessionId, optionAnswers);
    }

    return result;
  }

  // ==========================================================================
  // STEP 4: AVAILABILITY OPTIONS (Time Slots, Variants, etc.)
  // ==========================================================================

  /**
   * Get availability details including options
   * Must iterate until optionList.isComplete = true before pricing is available
   */
  async getAvailability(availabilityId: string): Promise<AvailabilityDetail> {
    const response = await this.executeQuery<{
      availability: AvailabilityDetail;
    }>(AVAILABILITY_QUERY, { id: availabilityId });

    return response.availability;
  }

  /**
   * Set options for an availability (e.g., select time slot, variant)
   */
  async setAvailabilityOptions(
    availabilityId: string,
    input: AvailabilityInput
  ): Promise<AvailabilityDetail> {
    const response = await this.executeQuery<{
      availability: AvailabilityDetail;
    }>(AVAILABILITY_SET_OPTIONS_QUERY, {
      id: availabilityId,
      input,
    });

    return response.availability;
  }

  /**
   * Helper: Complete option selection iteratively
   * Returns availability once optionList.isComplete = true
   */
  async completeAvailabilityOptions(
    availabilityId: string,
    optionSelections: AvailabilityOptionInput[]
  ): Promise<AvailabilityDetail> {
    let availability = await this.getAvailability(availabilityId);

    // If options are already complete, return
    if (availability.optionList?.isComplete) {
      return availability;
    }

    // Set the provided options
    if (optionSelections.length > 0) {
      availability = await this.setAvailabilityOptions(availabilityId, {
        optionList: optionSelections,
      });
    }

    return availability;
  }

  // ==========================================================================
  // STEP 5: PRICING CATEGORIES
  // ==========================================================================

  /**
   * Get pricing categories for an availability
   * Only available after optionList.isComplete = true
   */
  async getAvailabilityPricing(availabilityId: string): Promise<AvailabilityDetail> {
    const response = await this.executeQuery<{
      availability: AvailabilityDetail;
    }>(AVAILABILITY_PRICING_QUERY, { id: availabilityId });

    return response.availability;
  }

  /**
   * Set units for pricing categories
   */
  async setAvailabilityPricing(
    availabilityId: string,
    pricingCategories: Array<{ id: string; units: number }>
  ): Promise<AvailabilityDetail> {
    const response = await this.executeQuery<{
      availability: AvailabilityDetail;
    }>(AVAILABILITY_SET_PRICING_QUERY, {
      id: availabilityId,
      input: {
        pricingCategoryList: pricingCategories,
      },
    });

    return response.availability;
  }

  // ==========================================================================
  // STEP 6: CREATE BOOKING
  // ==========================================================================

  /**
   * Create a new booking (basket/cart)
   * STRONGLY RECOMMEND passing autoFillQuestions = true
   */
  async createBooking(input: BookingCreateInput = {}): Promise<Booking> {
    const response = await this.executeQuery<{
      bookingCreate: Booking;
    }>(BOOKING_CREATE_MUTATION, {
      input: {
        autoFillQuestions: true, // Strongly recommended
        paymentType: 'ON_ACCOUNT', // Holibob typically uses ON_ACCOUNT
        ...input,
      },
    });

    return response.bookingCreate;
  }

  // ==========================================================================
  // STEP 7: ADD AVAILABILITY TO BOOKING
  // ==========================================================================

  /**
   * Add an availability (configured with options and pricing) to a booking
   * Returns isComplete = false initially, requiring question answers
   */
  async addAvailabilityToBooking(
    input: BookingAddAvailabilityInput
  ): Promise<{ isComplete: boolean }> {
    const response = await this.executeQuery<{
      bookingAddAvailability: { isComplete: boolean };
    }>(BOOKING_ADD_AVAILABILITY_MUTATION, { input });

    return response.bookingAddAvailability;
  }

  // ==========================================================================
  // STEP 8: BOOKING QUESTIONS
  // ==========================================================================

  /**
   * Get booking with all questions at three levels:
   * - Booking level (general questions)
   * - Availability level (per-experience questions)
   * - Person level (per-guest questions)
   */
  async getBookingQuestions(bookingId: string): Promise<Booking> {
    const response = await this.executeQuery<{
      booking: Booking;
    }>(BOOKING_QUESTIONS_QUERY, { id: bookingId });

    return response.booking;
  }

  /**
   * Answer booking questions
   * Must iterate until canCommit = true
   */
  async answerBookingQuestions(bookingId: string, input: BookingInput): Promise<Booking> {
    const response = await this.executeQuery<{
      booking: Booking;
    }>(BOOKING_ANSWER_QUESTIONS_QUERY, {
      id: bookingId,
      input,
    });

    return response.booking;
  }

  // ==========================================================================
  // STEP 9: COMMIT BOOKING
  // ==========================================================================

  /**
   * Commit a booking (finalize)
   * Returns PENDING state initially, must poll until CONFIRMED
   */
  async commitBooking(selector: BookingSelectorInput): Promise<Booking> {
    const response = await this.executeQuery<{
      bookingCommit: Booking;
    }>(BOOKING_COMMIT_MUTATION, {
      bookingSelector: selector,
    });

    return response.bookingCommit;
  }

  /**
   * Poll booking state until CONFIRMED
   * Use this after commitBooking to wait for supplier confirmation
   */
  async waitForConfirmation(
    bookingId: string,
    options?: { maxAttempts?: number; intervalMs?: number }
  ): Promise<Booking> {
    const maxAttempts = options?.maxAttempts ?? 30;
    const intervalMs = options?.intervalMs ?? 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await this.executeQuery<{
        booking: Booking;
      }>(BOOKING_STATE_QUERY, { id: bookingId });

      const booking = response.booking;

      if (booking.state === 'CONFIRMED') {
        return booking;
      }

      if (booking.state === 'REJECTED' || booking.state === 'CANCELLED') {
        throw new Error(`Booking ${booking.state}: ${bookingId}`);
      }

      await this.delay(intervalMs);
    }

    throw new Error(`Booking confirmation timeout after ${maxAttempts} attempts`);
  }

  // ==========================================================================
  // BOOKING RETRIEVAL
  // ==========================================================================

  /**
   * Get booking by ID with full details
   */
  async getBooking(bookingId: string): Promise<Booking | null> {
    const response = await this.executeQuery<{
      booking: Booking | null;
    }>(BOOKING_FULL_QUERY, { id: bookingId });

    return response.booking;
  }

  /**
   * List bookings with optional filters
   */
  async listBookings(
    filter?: { consumerTripId?: string; consumerId?: string },
    pagination?: { first?: number; after?: string }
  ): Promise<{ nodes: Booking[]; recordCount: number }> {
    const response = await this.executeQuery<{
      bookingList: { nodes: Booking[]; recordCount: number };
    }>(BOOKING_LIST_QUERY, {
      filter,
      first: pagination?.first ?? 20,
      after: pagination?.after,
    });

    return response.bookingList;
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(selector: BookingSelectorInput, reason?: string): Promise<Booking> {
    const response = await this.executeQuery<{
      bookingCancel: Booking;
    }>(BOOKING_CANCEL_MUTATION, {
      bookingSelector: selector,
      reason,
    });

    return response.bookingCancel;
  }

  // ==========================================================================
  // CATEGORY & PLACE QUERIES
  // ==========================================================================

  /**
   * Get categories, optionally filtered by place
   */
  async getCategories(placeId?: string): Promise<Category[]> {
    const response = await this.executeQuery<{
      categoryList: { nodes: Category[] };
    }>(CATEGORIES_QUERY, { placeId });

    return response.categoryList.nodes;
  }

  /**
   * Get places, optionally filtered by parent or type
   */
  async getPlaces(options?: { parentId?: string; type?: PlaceType }): Promise<Place[]> {
    const response = await this.executeQuery<{
      placeList: { nodes: Place[] };
    }>(PLACES_QUERY, options);

    return response.placeList.nodes;
  }

  // ==========================================================================
  // HIGH-LEVEL BOOKING FLOW HELPERS
  // ==========================================================================

  /**
   * Complete Look-to-Book flow helper:
   * Creates booking → Adds availability → Returns booking ready for questions
   */
  async startBookingFlow(
    availabilityId: string,
    bookingInput?: BookingCreateInput
  ): Promise<Booking> {
    // Create booking
    const booking = await this.createBooking(bookingInput);

    // Add availability to booking
    await this.addAvailabilityToBooking({
      bookingId: booking.id,
      availabilityId,
    });

    // Return booking with questions
    return this.getBookingQuestions(booking.id);
  }

  /**
   * Complete booking flow helper:
   * Answers questions → Commits → Waits for confirmation
   */
  async completeBookingFlow(bookingId: string, questionAnswers: BookingInput): Promise<Booking> {
    // Answer questions
    let booking = await this.answerBookingQuestions(bookingId, questionAnswers);

    // Verify can commit
    if (!booking.canCommit) {
      throw new Error('Cannot commit booking: questions incomplete');
    }

    // Commit booking
    booking = await this.commitBooking({ id: bookingId });

    // Wait for confirmation
    return this.waitForConfirmation(bookingId);
  }

  // ==========================================================================
  // LEGACY METHODS (for backwards compatibility)
  // ==========================================================================

  /**
   * @deprecated Use discoverAvailability instead
   */
  async getAvailabilityLegacy(
    productId: string,
    dateFrom: string,
    dateTo: string,
    guests?: { adults?: number; children?: number }
  ) {
    // Map to new availability flow
    const result = await this.discoverAvailability(productId, dateFrom, dateTo);

    // Convert to legacy format
    return {
      productId,
      options: result.nodes.map((slot) => ({
        id: slot.id,
        date: slot.date,
        price: 0, // Would need pricing call to get this
        currency: 'GBP',
        remainingCapacity: slot.soldOut ? 0 : undefined,
      })),
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private async executeQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= (this.config.retries ?? 3); attempt++) {
      try {
        const response = await this.client.request<T>(query, variables);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        if (this.isClientError(error)) {
          throw this.formatError(error);
        }

        // Exponential backoff for retries
        if (attempt < (this.config.retries ?? 3)) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  private mapProductFilter(filter: ProductFilter): Record<string, unknown> {
    return {
      where: filter.placeIds
        ? { placeIds: filter.placeIds }
        : filter.geoPoint
          ? {
              geoPoint: {
                lat: filter.geoPoint.lat,
                lng: filter.geoPoint.lng,
                radiusKm: filter.geoPoint.radiusKm ?? 50,
              },
            }
          : undefined,
      when: filter.dateFrom
        ? {
            dateFrom: filter.dateFrom,
            dateTo: filter.dateTo,
          }
        : undefined,
      who: {
        adults: filter.adults ?? 2,
        children: filter.children ?? 0,
        infants: filter.infants ?? 0,
      },
      what: filter.categoryIds ? { categoryIds: filter.categoryIds } : undefined,
      price:
        filter.priceMin || filter.priceMax
          ? {
              min: filter.priceMin,
              max: filter.priceMax,
              currency: filter.currency,
            }
          : undefined,
    };
  }

  private isClientError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response?: { status?: number } }).response;
      return response?.status !== undefined && response.status >= 400 && response.status < 500;
    }
    return false;
  }

  private formatError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Factory function
export function createHolibobClient(config: HolibobClientConfig): HolibobClient {
  return new HolibobClient(config);
}

export default HolibobClient;
