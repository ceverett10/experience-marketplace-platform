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
  type StripePaymentIntent,
  type Category,
  type Place,
  type PlaceType,
  type Provider,
  type ProviderListResponse,
  type ProductListByProviderResponse,
  type ProviderWithCount,
  type ProviderTreeResponse,
} from '../types/index.js';
import {
  PRODUCT_LIST_QUERY,
  SUGGESTIONS_QUERY,
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
  STRIPE_PAYMENT_INTENT_QUERY,
  BOOKING_COMMIT_MUTATION,
  BOOKING_STATE_QUERY,
  BOOKING_FULL_QUERY,
  BOOKING_LIST_QUERY,
  BOOKING_CANCEL_MUTATION,
  CATEGORIES_QUERY,
  PLACES_QUERY,
  PROVIDER_LIST_QUERY,
  PROVIDER_DETAIL_QUERY,
  PRODUCT_LIST_BY_PROVIDER_QUERY,
  PRODUCT_LIST_ALL_QUERY,
  PROVIDER_TREE_QUERY,
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
   * Generate signature for Holibob API request authentication
   *
   * Holibob signature format:
   * 1. Concatenate: Date + API-Key + Method + Path + Body
   * 2. Hash with SHA1 algorithm
   * 3. Base64 encode the result
   */
  private generateSignature(timestamp: string, body: string): string {
    if (!this.config.apiSecret) {
      throw new Error('API secret is required for signature generation');
    }

    // Build payload: date + apiKey + method + path + body
    // Method is always POST, path is always /graphql for GraphQL API
    const payload = `${timestamp}${this.config.apiKey}POST/graphql${body}`;

    // Generate HMAC-SHA1 signature with base64 encoding
    const hmac = createHmac('sha1', this.config.apiSecret);
    hmac.update(payload);

    return hmac.digest('base64');
  }

  // ==========================================================================
  // STEP 1: PRODUCT DISCOVERY
  // ==========================================================================

  /**
   * Search and discover products using the Product Discovery API
   * This is the correct API for searching and displaying product lists
   *
   * Note: Product Discovery only returns id and name for recommended products.
   * We fetch full product details for each recommended product.
   *
   * Pagination: Holibob doesn't support traditional pagination. Instead, pass
   * seenProductIdList with IDs of products already displayed to get new ones.
   */
  async discoverProducts(
    filter: ProductFilter,
    options?: { pageSize?: number; seenProductIdList?: string[] }
  ): Promise<ProductListResponse> {
    // API uses separate arguments (where, when, who, what), not a single input object
    const variables = this.mapProductDiscoveryInput(filter);

    // Add pagination parameters
    const productCount = options?.pageSize ?? 20;
    const seenProductIdList = options?.seenProductIdList;

    // Step 1: Get recommended product IDs from Product Discovery
    const response = await this.executeQuery<{
      productDiscovery: {
        selectedDestination?: { id: string; name: string };
        recommendedTagList?: { nodes: Array<{ id: string; name: string }> };
        recommendedSearchTermList?: { nodes: Array<{ searchTerm: string }> };
        recommendedProductList: {
          nodes: Array<{ id: string; name: string }>;
        };
      };
    }>(PRODUCT_LIST_QUERY, {
      ...variables,
      productCount,
      seenProductIdList: seenProductIdList?.length ? seenProductIdList : undefined,
    });

    const recommendedProducts = response.productDiscovery.recommendedProductList.nodes;

    console.log(
      '[HolibobClient] discoverProducts found',
      recommendedProducts.length,
      'products',
      seenProductIdList?.length ? `(excluded ${seenProductIdList.length} seen)` : ''
    );

    // Step 2: Fetch full details for each product in parallel
    const productDetailsPromises = recommendedProducts.map(async (rec) => {
      try {
        const fullProduct = await this.getProduct(rec.id);
        if (fullProduct) {
          return fullProduct;
        }
        // If full details fetch fails, return basic info
        console.log('[HolibobClient] getProduct returned null, using basic info for:', rec.id);
        return { id: rec.id, name: rec.name } as Product;
      } catch (err) {
        // If product detail fetch fails, return basic info from discovery
        console.error(
          '[HolibobClient] getProduct failed for',
          rec.id,
          ':',
          err instanceof Error ? err.message : String(err)
        );
        return { id: rec.id, name: rec.name } as Product;
      }
    });

    const products = await Promise.all(productDetailsPromises);

    // hasNextPage is true if we got the full count requested (likely more available)
    const hasNextPage = recommendedProducts.length >= productCount;

    return {
      products,
      pageInfo: {
        hasNextPage,
        hasPreviousPage: (seenProductIdList?.length ?? 0) > 0,
        startCursor: undefined,
        endCursor: undefined,
      },
      totalCount: products.length,
    };
  }

  /**
   * Get real-time suggestions from Product Discovery API
   * Returns destinations, tags, and search terms based on current input
   * This matches Holibob Hub behavior with recommendedDestinationList
   */
  async getSuggestions(filter: ProductFilter): Promise<{
    destination: { id: string; name: string } | null;
    destinations: Array<{ id: string; name: string }>;
    tags: Array<{ id: string; name: string }>;
    searchTerms: string[];
  }> {
    // Build variables matching Holibob Hub format
    const variables: Record<string, unknown> = {};

    // Where - location as free text
    if (filter.freeText) {
      variables['where'] = { freeText: filter.freeText };
    }

    // When - dates or free text (must be full ISO 8601 DateTime format)
    if (filter.dateFrom) {
      variables['when'] = {
        data: {
          startDate: this.toDateTimeString(filter.dateFrom, 'start'),
          endDate: this.toDateTimeString(filter.dateTo || filter.dateFrom, 'end'),
        },
      };
    } else {
      variables['when'] = { freeText: '' };
    }

    // Who - traveler info
    const adults = filter.adults ?? 2;
    const children = filter.children ?? 0;
    const parts: string[] = [];
    if (adults > 0) parts.push(`${adults} Adult${adults > 1 ? 's' : ''}`);
    if (children > 0) parts.push(`${children} Child${children > 1 ? 'ren' : ''}`);
    variables['who'] = { freeText: parts.length > 0 ? parts.join(' and ') : '' };

    // What - search term
    if (filter.searchTerm) {
      variables['what'] = { freeText: filter.searchTerm };
    } else {
      variables['what'] = { freeText: '' };
    }

    console.log('[HolibobClient] getSuggestions variables:', JSON.stringify(variables, null, 2));

    try {
      const response = await this.executeQuery<{
        productDiscovery: {
          selectedDestination?: { id: string; name: string };
          recommendedDestinationList?: { nodes: Array<{ id: string; name: string }> };
          recommendedTagList?: { nodes: Array<{ id: string; name: string }> };
          recommendedSearchTermList?: { nodes: Array<{ searchTerm: string }> };
        };
      }>(SUGGESTIONS_QUERY, variables);

      console.log('[HolibobClient] getSuggestions response:', JSON.stringify(response, null, 2));

      return {
        destination: response.productDiscovery.selectedDestination ?? null,
        destinations: response.productDiscovery.recommendedDestinationList?.nodes ?? [],
        tags: response.productDiscovery.recommendedTagList?.nodes ?? [],
        searchTerms:
          response.productDiscovery.recommendedSearchTermList?.nodes.map((n) => n.searchTerm) ?? [],
      };
    } catch (error) {
      console.error('[HolibobClient] getSuggestions error:', error);
      return {
        destination: null,
        destinations: [],
        tags: [],
        searchTerms: [],
      };
    }
  }

  // ==========================================================================
  // STEP 2: PRODUCT DETAILS
  // ==========================================================================

  /**
   * Get a single product by ID with full details
   * Uses the productDetail query endpoint (not product)
   */
  async getProduct(productId: string): Promise<Product | null> {
    console.log('[HolibobClient] getProduct called with ID:', productId);
    try {
      const response = await this.executeQuery<{ productDetail: Product | null }>(
        PRODUCT_DETAIL_QUERY,
        {
          id: productId,
        }
      );

      if (response.productDetail) {
        const product = response.productDetail as Record<string, unknown>;
        console.log('[HolibobClient] getProduct success:', {
          id: response.productDetail.id,
          name: response.productDetail.name,
          hasImages: !!response.productDetail.imageList,
          hasGuidePrice: !!response.productDetail.guidePrice,
          reviewRating: response.productDetail.reviewRating,
          reviewCount: response.productDetail.reviewCount,
          hasProvider: !!response.productDetail.provider,
          providerId: response.productDetail.provider?.id,
          providerName: response.productDetail.provider?.name,
          hasReviewList: !!product['reviewList'],
          reviewListRecordCount: (product['reviewList'] as { recordCount?: number })?.recordCount,
          reviewListNodes: (product['reviewList'] as { nodes?: unknown[] })?.nodes?.length ?? 0,
        });
        // Log full reviewList if present for debugging
        if (product['reviewList']) {
          console.log(
            '[HolibobClient] reviewList data:',
            JSON.stringify(product['reviewList'], null, 2)
          );
        }
      } else {
        console.log('[HolibobClient] getProduct returned null for ID:', productId);
      }

      return response.productDetail;
    } catch (error) {
      console.error('[HolibobClient] getProduct error:', {
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ==========================================================================
  // STEP 3: AVAILABILITY LIST (Recursive Method - RECOMMENDED)
  // ==========================================================================

  /**
   * Get availability list for a product.
   *
   * Supports two methods:
   * 1. Direct filter method: Pass filter with startDate/endDate (recommended)
   * 2. Recursive method: Use sessionId and optionList for iterative calls
   *
   * @param productId - The product ID
   * @param filter - Date filter { startDate, endDate }
   * @param sessionId - Session ID from previous call (for recursive method)
   * @param optionList - Answers to options from previous call (for recursive method)
   */
  async getAvailabilityList(
    productId: string,
    filter?: { startDate: string; endDate: string },
    sessionId?: string,
    optionList?: AvailabilityOptionInput[]
  ): Promise<AvailabilityListResponse> {
    const response = await this.executeQuery<{
      availabilityList: AvailabilityListResponse;
    }>(AVAILABILITY_LIST_QUERY, {
      productId,
      filter,
      sessionId,
      optionList,
    });

    return response.availabilityList;
  }

  /**
   * Get availability for a product within a date range
   * Uses the direct filter method for simplicity
   */
  async discoverAvailability(
    productId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<AvailabilityListResponse> {
    // Use direct filter method - much simpler than recursive
    const result = await this.getAvailabilityList(productId, {
      startDate: dateFrom,
      endDate: dateTo,
    });

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

  // ==========================================================================
  // STEP 9a: STRIPE PAYMENT
  // ==========================================================================

  /**
   * Get Stripe Payment Intent for a booking
   * Required when partner channel has paymentType: REQUIRED
   * Returns clientSecret needed to render Stripe payment form
   */
  async getStripePaymentIntent(selector: BookingSelectorInput): Promise<StripePaymentIntent> {
    const response = await this.executeQuery<{
      stripePaymentIntent: StripePaymentIntent;
    }>(STRIPE_PAYMENT_INTENT_QUERY, {
      bookingSelector: selector,
    });

    return response.stripePaymentIntent;
  }

  // ==========================================================================
  // STEP 9b: COMMIT BOOKING
  // ==========================================================================

  /**
   * Commit a booking (finalize)
   * Returns PENDING state initially, must poll until CONFIRMED
   * Note: If paymentType: REQUIRED, payment must succeed before calling this
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
  // PROVIDER (OPERATOR) QUERIES - For Microsite System
  // ==========================================================================

  /**
   * Get all providers (operators/suppliers)
   *
   * NOTE: This endpoint requires elevated permissions that most partners don't have.
   * Will return FORBIDDEN error for standard partner accounts.
   * Use discoverProvidersFromProducts() as an alternative.
   */
  async getProviders(): Promise<ProviderListResponse> {
    const response = await this.executeQuery<{
      providerList: ProviderListResponse;
    }>(PROVIDER_LIST_QUERY, {});

    return response.providerList;
  }

  /**
   * Discover providers from the product list using providerTree
   * This is the RECOMMENDED approach - uses a single query to get all providers
   * with their product counts, much more efficient than iterating products.
   *
   * Note: Returns Provider[] for backwards compatibility. Use getAllProvidersWithCounts()
   * to get full data including product counts.
   */
  async discoverProvidersFromProducts(): Promise<Provider[]> {
    console.log('[HolibobClient] Discovering providers using providerTree...');

    const providersWithCounts = await this.getAllProvidersWithCounts();

    // Convert to simple Provider array for backwards compatibility
    const providers: Provider[] = providersWithCounts.map((p) => ({
      id: p.id,
      name: p.name,
    }));

    console.log(`[HolibobClient] Discovered ${providers.length} unique providers`);

    return providers;
  }

  /**
   * Get all providers with their product counts using providerTree
   * This is the most efficient way to discover all providers.
   *
   * Returns providers sorted by product count (descending).
   */
  async getAllProvidersWithCounts(): Promise<ProviderWithCount[]> {
    console.log('[HolibobClient] Fetching all providers with product counts...');

    const response = await this.executeQuery<{
      productList: {
        recordCount: number;
        providerTree: {
          recordCount: number;
          nodes: Array<{ id: string; label: string; count: number }>;
        };
      };
    }>(PROVIDER_TREE_QUERY, {});

    const providers: ProviderWithCount[] = response.productList.providerTree.nodes.map((node) => ({
      id: node.id,
      name: node.label,
      productCount: node.count,
    }));

    // Sort by product count descending
    providers.sort((a, b) => b.productCount - a.productCount);

    console.log(
      `[HolibobClient] Found ${providers.length} providers across ${response.productList.recordCount} total products`
    );

    return providers;
  }

  /**
   * Get a single provider by ID
   * NOTE: This endpoint may require elevated permissions.
   */
  async getProvider(providerId: string): Promise<Provider | null> {
    try {
      const response = await this.executeQuery<{
        provider: Provider | null;
      }>(PROVIDER_DETAIL_QUERY, { id: providerId });

      return response.provider;
    } catch (error) {
      console.error('[HolibobClient] getProvider error:', {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ==========================================================================
  // PRODUCT LIST QUERIES - For Microsite System
  // ==========================================================================

  /**
   * Get products filtered by provider ID
   *
   * This is the CORRECT endpoint for microsites - NOT Product Discovery.
   * Product Discovery is for marketplace search (location/date/activity based).
   * Product List is for getting ALL products for a specific provider.
   *
   * NOTE: Holibob productList does NOT support pagination - it returns all products
   */
  async getProductsByProvider(providerId: string): Promise<ProductListByProviderResponse> {
    const response = await this.executeQuery<{
      productList: ProductListByProviderResponse;
    }>(PRODUCT_LIST_BY_PROVIDER_QUERY, {
      providerId,
    });

    return response.productList;
  }

  /**
   * Get ALL products for a provider
   * Since productList doesn't support pagination, this just calls getProductsByProvider
   */
  async getAllProductsByProvider(providerId: string): Promise<Product[]> {
    const response = await this.getProductsByProvider(providerId);
    console.log(
      `[HolibobClient] getAllProductsByProvider(${providerId}): fetched ${response.nodes.length} products`
    );
    return response.nodes;
  }

  /**
   * Get all products (for bulk sync operations)
   * Returns products across all providers
   * NOTE: productList doesn't support pagination - returns all products
   */
  async getAllProducts(): Promise<ProductListByProviderResponse> {
    const response = await this.executeQuery<{
      productList: ProductListByProviderResponse;
    }>(PRODUCT_LIST_ALL_QUERY, {});

    return response.productList;
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
    // Holibob API expects: bookingSelector (to identify booking) + id (availability ID)
    await this.addAvailabilityToBooking({
      bookingSelector: { id: booking.id },
      id: availabilityId,
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
    _guests?: { adults?: number; children?: number }
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

        // Log detailed GraphQL error info
        console.error('[HolibobClient] GraphQL query error:', {
          attempt,
          variables,
          errorMessage: lastError.message,
          // GraphQL errors often have additional details
          graphqlErrors: (error as { response?: { errors?: unknown[] } })?.response?.errors,
        });

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

  /**
   * Map ProductFilter to Product Discovery API input format
   * Product Discovery uses: where.freeText, when.data, who.freeText, what.data
   */
  private mapProductDiscoveryInput(filter: ProductFilter): Record<string, unknown> {
    const input: Record<string, unknown> = {};

    // Where - location/destination as free text
    if (filter.freeText || filter.placeIds?.length) {
      input['where'] = {
        freeText: filter.freeText || filter.placeIds?.[0] || 'London',
      };
    } else {
      // Default to a location if none specified
      input['where'] = { freeText: 'London' };
    }

    // When - dates must be full ISO 8601 DateTime format
    if (filter.dateFrom) {
      input['when'] = {
        data: {
          startDate: this.toDateTimeString(filter.dateFrom, 'start'),
          endDate: this.toDateTimeString(filter.dateTo || filter.dateFrom, 'end'),
        },
      };
    }

    // Who - traveler description as free text
    const adults = filter.adults ?? 2;
    const children = filter.children ?? 0;
    const parts: string[] = [];
    if (adults > 0) parts.push(`${adults} Adult${adults > 1 ? 's' : ''}`);
    if (children > 0) parts.push(`${children} Child${children > 1 ? 'ren' : ''}`);
    if (parts.length > 0) {
      input['who'] = { freeText: parts.join(' and ') };
    }

    // What - search term, tags, price, rating
    const whatData: Record<string, unknown> = {};
    if (filter.searchTerm) {
      whatData['searchTerm'] = filter.searchTerm;
    }
    if (filter.categoryIds?.length) {
      whatData['tagIdList'] = filter.categoryIds;
    }
    if (filter.priceMin != null || filter.priceMax != null) {
      whatData['price'] = {
        min: filter.priceMin ?? 0,
        max: filter.priceMax ?? 10000,
      };
    }
    if (Object.keys(whatData).length > 0) {
      input['what'] = { data: whatData };
    }

    return input;
  }

  // Legacy method - kept for compatibility
  private mapProductFilter(filter: ProductFilter): Record<string, unknown> {
    return this.mapProductDiscoveryInput(filter);
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

  /**
   * Convert a date string to full ISO 8601 DateTime format
   * Holibob API requires DateTime type, not just date strings
   * @param dateStr - Date string in YYYY-MM-DD format
   * @param type - 'start' for beginning of day (00:00:00), 'end' for end of day (23:59:59)
   */
  private toDateTimeString(dateStr: string, type: 'start' | 'end'): string {
    // If already in full DateTime format, return as-is
    if (dateStr.includes('T')) {
      return dateStr;
    }
    // Add time component based on type
    if (type === 'start') {
      return `${dateStr}T00:00:00.000Z`;
    } else {
      return `${dateStr}T23:59:59.999Z`;
    }
  }
}

// Factory function
export function createHolibobClient(config: HolibobClientConfig): HolibobClient {
  return new HolibobClient(config);
}

export default HolibobClient;
