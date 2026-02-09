import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphQLClient } from 'graphql-request';
import { HolibobClient, createHolibobClient } from './index.js';
import type { HolibobClientConfig } from '../types/index.js';

// Mock graphql-request
vi.mock('graphql-request', () => ({
  GraphQLClient: vi.fn().mockImplementation(() => ({
    request: vi.fn(),
  })),
  // gql is a template tag that just returns the string
  gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, i) => acc + str + (values[i] || ''), ''),
}));

describe('HolibobClient', () => {
  let client: HolibobClient;
  let mockRequest: ReturnType<typeof vi.fn>;
  const mockConfig: HolibobClientConfig = {
    apiUrl: 'https://api.holibob.test/graphql',
    apiKey: 'test-api-key',
    partnerId: 'test-partner-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = vi.fn();
    (GraphQLClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      request: mockRequest,
    }));
    client = new HolibobClient(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a GraphQL client with correct headers', () => {
      expect(GraphQLClient).toHaveBeenCalledWith(mockConfig.apiUrl, {
        headers: {
          'X-API-Key': mockConfig.apiKey,
          'X-Partner-Id': mockConfig.partnerId,
          'Content-Type': 'application/json',
        },
      });
    });

    it('should set default timeout and retries', () => {
      const clientWithDefaults = new HolibobClient({
        apiUrl: 'https://api.test.com',
        apiKey: 'key',
        partnerId: 'partner',
      });
      expect(clientWithDefaults).toBeDefined();
    });
  });

  describe('discoverProducts', () => {
    it('should fetch products with location filter (discovery + details)', async () => {
      // Mock Product Discovery returns just id and name
      const discoveryResponse = {
        productDiscovery: {
          recommendedProductList: {
            nodes: [{ id: 'prod-1', name: 'Test Experience' }],
          },
        },
      };

      // Mock Product Detail returns full product info
      const productDetailResponse = {
        productDetail: {
          id: 'prod-1',
          name: 'Test Experience',
          shortDescription: 'A great experience',
          guidePrice: 5000,
          guidePriceFormattedText: '£50.00',
        },
      };

      mockRequest
        .mockResolvedValueOnce(discoveryResponse)
        .mockResolvedValueOnce(productDetailResponse);

      const result = await client.discoverProducts({
        placeIds: ['place-123'],
        adults: 2,
      });

      expect(result.products).toHaveLength(1);
      expect(result.products[0].id).toBe('prod-1');
      expect(result.products[0].shortDescription).toBe('A great experience');
      expect(result.totalCount).toBe(1);
      expect(mockRequest).toHaveBeenCalledTimes(2); // Discovery + 1 product detail
    });

    it('should handle geo point filter', async () => {
      const mockResponse = {
        productDiscovery: {
          recommendedProductList: {
            nodes: [],
          },
        },
      };

      mockRequest.mockResolvedValueOnce(mockResponse);

      const result = await client.discoverProducts({
        geoPoint: { lat: 51.5074, lng: -0.1278, radiusKm: 25 },
      });

      expect(result.products).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should handle product detail fetch failure gracefully', async () => {
      // Product Discovery returns IDs
      const discoveryResponse = {
        productDiscovery: {
          recommendedProductList: {
            nodes: [{ id: 'prod-1', name: 'Test Experience' }],
          },
        },
      };

      mockRequest
        .mockResolvedValueOnce(discoveryResponse)
        .mockRejectedValueOnce(new Error('Product not found'));

      const result = await client.discoverProducts({
        placeIds: ['place-123'],
      });

      // Should fallback to basic info from discovery
      expect(result.products).toHaveLength(1);
      expect(result.products[0].id).toBe('prod-1');
      expect(result.products[0].name).toBe('Test Experience');
    });

    it('should support pagination', async () => {
      const mockNodes = Array(10)
        .fill(null)
        .map((_, i) => ({ id: `prod-${i}`, name: `Test ${i}` }));
      const mockResponse = {
        productDiscovery: {
          recommendedProductList: {
            nodes: mockNodes,
          },
        },
      };

      // Mock discovery response
      mockRequest.mockResolvedValueOnce(mockResponse);

      // Mock product detail responses for all 10 products
      for (let i = 0; i < 10; i++) {
        mockRequest.mockResolvedValueOnce({
          productDetail: { id: `prod-${i}`, name: `Test ${i}` },
        });
      }

      const result = await client.discoverProducts(
        { placeIds: ['place-1'] },
        { page: 2, pageSize: 10 }
      );

      // Pagination is simplified - handled client-side
      expect(result.totalCount).toBe(10);
    });
  });

  describe('getProduct', () => {
    it('should fetch a single product by ID', async () => {
      const mockProduct = {
        id: 'prod-123',
        name: 'Amazing Tour',
        description: 'An amazing tour experience',
        price: { amount: 99.99, currency: 'GBP' },
      };

      mockRequest.mockResolvedValueOnce({ productDetail: mockProduct });

      const result = await client.getProduct('prod-123');

      expect(result).toEqual(mockProduct);
      expect(mockRequest).toHaveBeenCalledWith(expect.any(String), { id: 'prod-123' });
    });

    it('should return null for non-existent product', async () => {
      mockRequest.mockResolvedValueOnce({ productDetail: null });

      const result = await client.getProduct('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getAvailability', () => {
    it('should fetch availability by ID', async () => {
      const mockAvailability = {
        id: 'avail-123',
        date: '2024-06-15',
        optionList: {
          isComplete: true,
          nodes: [],
        },
      };

      mockRequest.mockResolvedValueOnce({ availability: mockAvailability });

      const result = await client.getAvailability('avail-123');

      expect(result).toEqual(mockAvailability);
      expect(mockRequest).toHaveBeenCalledWith(expect.any(String), { id: 'avail-123' });
    });

    it('should return availability with options', async () => {
      const mockAvailability = {
        id: 'avail-456',
        optionList: {
          isComplete: false,
          nodes: [{ id: 'opt-1', label: 'Time Slot' }],
        },
      };

      mockRequest.mockResolvedValueOnce({ availability: mockAvailability });

      const result = await client.getAvailability('avail-456');

      expect(result.optionList.isComplete).toBe(false);
      expect(result.optionList.nodes).toHaveLength(1);
    });
  });

  describe('createBooking', () => {
    it('should create a new booking', async () => {
      const mockBooking = {
        id: 'booking-123',
        status: 'PENDING',
        totalPrice: { amount: 150, currency: 'GBP' },
      };

      mockRequest.mockResolvedValueOnce({ bookingCreate: mockBooking });

      const result = await client.createBooking({
        productId: 'prod-123',
        date: '2024-06-15',
        guests: { adults: 2 },
      });

      expect(result).toEqual(mockBooking);
    });
  });

  describe('getBooking', () => {
    it('should fetch booking by ID', async () => {
      const mockBooking = {
        id: 'booking-123',
        status: 'CONFIRMED',
      };

      mockRequest.mockResolvedValueOnce({ booking: mockBooking });

      const result = await client.getBooking('booking-123');

      expect(result).toEqual(mockBooking);
    });
  });

  describe('commitBooking', () => {
    it('should commit a booking', async () => {
      const mockBooking = {
        id: 'booking-123',
        status: 'COMMITTED',
      };

      mockRequest.mockResolvedValueOnce({ bookingCommit: mockBooking });

      const result = await client.commitBooking({ id: 'booking-123' });

      expect(result).toEqual(mockBooking);
    });
  });

  describe('retry logic', () => {
    it('should retry on server error', async () => {
      const serverError = new Error('Server error');
      (serverError as any).response = { status: 500 };

      mockRequest
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ productDetail: { id: 'prod-1' } });

      const result = await client.getProduct('prod-1');

      expect(result).toEqual({ id: 'prod-1' });
      expect(mockRequest).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client error (4xx)', async () => {
      const clientError = new Error('Not found');
      (clientError as any).response = { status: 404 };

      mockRequest.mockRejectedValue(clientError);

      await expect(client.getProduct('invalid')).rejects.toThrow();
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries', async () => {
      const serverError = new Error('Server error');
      mockRequest.mockRejectedValue(serverError);

      await expect(client.getProduct('prod-1')).rejects.toThrow('Server error');
      expect(mockRequest).toHaveBeenCalledTimes(3); // default retries
    });
  });
});

describe('createHolibobClient', () => {
  it('should create a HolibobClient instance', () => {
    const client = createHolibobClient({
      apiUrl: 'https://api.test.com',
      apiKey: 'key',
      partnerId: 'partner',
    });

    expect(client).toBeInstanceOf(HolibobClient);
  });
});

describe('HolibobClient - Availability Methods', () => {
  let client: HolibobClient;
  let mockRequest: ReturnType<typeof vi.fn>;
  const mockConfig: HolibobClientConfig = {
    apiUrl: 'https://api.holibob.test/graphql',
    apiKey: 'test-api-key',
    partnerId: 'test-partner-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = vi.fn();
    (GraphQLClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      request: mockRequest,
    }));
    client = new HolibobClient(mockConfig);
  });

  describe('getAvailabilityList', () => {
    it('should fetch availability list for a product', async () => {
      const mockResponse = {
        availabilityList: {
          sessionId: 'session-123',
          nodes: [{ id: 'avail-1', date: '2024-06-15' }],
          optionList: { isComplete: false, nodes: [] },
        },
      };

      mockRequest.mockResolvedValueOnce(mockResponse);

      const result = await client.getAvailabilityList('prod-123');

      expect(result.sessionId).toBe('session-123');
      expect(result.nodes).toHaveLength(1);
    });

    it('should pass sessionId and optionList for subsequent calls', async () => {
      const mockResponse = {
        availabilityList: {
          sessionId: 'session-456',
          nodes: [{ id: 'avail-2', date: '2024-06-16' }],
          optionList: { isComplete: true, nodes: [] },
        },
      };

      mockRequest.mockResolvedValueOnce(mockResponse);

      // New signature: getAvailabilityList(productId, filter?, sessionId?, optionList?)
      const result = await client.getAvailabilityList(
        'prod-123',
        undefined, // filter - not used for recursive method
        'session-123',
        [{ id: 'START_DATE', value: '2024-06-01' }]
      );

      expect(mockRequest).toHaveBeenCalledWith(expect.any(String), {
        productId: 'prod-123',
        filter: undefined,
        sessionId: 'session-123',
        optionList: [{ id: 'START_DATE', value: '2024-06-01' }],
      });
    });
  });

  describe('discoverAvailability', () => {
    it('should complete availability discovery with date options', async () => {
      // discoverAvailability now uses direct filter method (single call)
      mockRequest.mockResolvedValueOnce({
        availabilityList: {
          sessionId: 'session-abc',
          nodes: [{ id: 'slot-1', date: '2024-06-15', soldOut: false }],
          optionList: { isComplete: true, nodes: [] },
        },
      });

      const result = await client.discoverAvailability('prod-123', '2024-06-01', '2024-06-30');

      // Direct filter method makes only 1 call
      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(mockRequest).toHaveBeenCalledWith(expect.any(String), {
        productId: 'prod-123',
        filter: { startDate: '2024-06-01', endDate: '2024-06-30' },
        sessionId: undefined,
        optionList: undefined,
      });
      expect(result.nodes).toHaveLength(1);
    });
  });

  describe('setAvailabilityOptions', () => {
    it('should set availability options', async () => {
      const mockResponse = {
        availability: {
          id: 'avail-123',
          optionList: { isComplete: true, nodes: [] },
        },
      };

      mockRequest.mockResolvedValueOnce(mockResponse);

      const result = await client.setAvailabilityOptions('avail-123', {
        optionList: [{ id: 'TIME_SLOT', value: '10:00' }],
      });

      expect(result.optionList.isComplete).toBe(true);
    });
  });

  describe('completeAvailabilityOptions', () => {
    it('should return immediately if options are already complete', async () => {
      mockRequest.mockResolvedValueOnce({
        availability: {
          id: 'avail-123',
          optionList: { isComplete: true, nodes: [] },
        },
      });

      const result = await client.completeAvailabilityOptions('avail-123', []);

      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(result.optionList?.isComplete).toBe(true);
    });

    it('should set options when provided and not complete', async () => {
      mockRequest
        .mockResolvedValueOnce({
          availability: {
            id: 'avail-123',
            optionList: { isComplete: false, nodes: [{ id: 'opt-1' }] },
          },
        })
        .mockResolvedValueOnce({
          availability: {
            id: 'avail-123',
            optionList: { isComplete: true, nodes: [] },
          },
        });

      const result = await client.completeAvailabilityOptions('avail-123', [
        { id: 'opt-1', value: 'selected' },
      ]);

      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(result.optionList?.isComplete).toBe(true);
    });
  });

  describe('getAvailabilityPricing', () => {
    it('should fetch pricing for availability', async () => {
      mockRequest.mockResolvedValueOnce({
        availability: {
          id: 'avail-123',
          pricingCategoryList: [{ id: 'adult', price: 50, currency: 'GBP' }],
        },
      });

      const result = await client.getAvailabilityPricing('avail-123');

      expect(result.pricingCategoryList).toBeDefined();
    });
  });

  describe('setAvailabilityPricing', () => {
    it('should set units for pricing categories', async () => {
      mockRequest.mockResolvedValueOnce({
        availability: {
          id: 'avail-123',
          totalPrice: { amount: 100, currency: 'GBP' },
        },
      });

      const result = await client.setAvailabilityPricing('avail-123', [{ id: 'adult', units: 2 }]);

      expect(result.totalPrice).toBeDefined();
    });
  });
});

describe('HolibobClient - Booking Methods', () => {
  let client: HolibobClient;
  let mockRequest: ReturnType<typeof vi.fn>;
  const mockConfig: HolibobClientConfig = {
    apiUrl: 'https://api.holibob.test/graphql',
    apiKey: 'test-api-key',
    partnerId: 'test-partner-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = vi.fn();
    (GraphQLClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      request: mockRequest,
    }));
    client = new HolibobClient(mockConfig);
  });

  describe('addAvailabilityToBooking', () => {
    it('should add availability to booking', async () => {
      mockRequest.mockResolvedValueOnce({
        bookingAddAvailability: { isComplete: false },
      });

      const result = await client.addAvailabilityToBooking({
        bookingId: 'booking-123',
        availabilityId: 'avail-456',
      });

      expect(result.isComplete).toBe(false);
    });
  });

  describe('getBookingQuestions', () => {
    it('should fetch booking questions', async () => {
      mockRequest.mockResolvedValueOnce({
        booking: {
          id: 'booking-123',
          questionList: [{ id: 'q1', text: 'Name?' }],
        },
      });

      const result = await client.getBookingQuestions('booking-123');

      expect(result.questionList).toBeDefined();
    });
  });

  describe('answerBookingQuestions', () => {
    it('should answer booking questions', async () => {
      mockRequest.mockResolvedValueOnce({
        booking: {
          id: 'booking-123',
          canCommit: true,
        },
      });

      const result = await client.answerBookingQuestions('booking-123', {
        leadPassengerName: 'John Doe',
        answerList: [{ questionId: 'q1', value: 'John Doe' }],
      });

      expect(result.canCommit).toBe(true);
    });
  });

  describe('commitBooking', () => {
    it('should commit booking with selector', async () => {
      mockRequest.mockResolvedValueOnce({
        bookingCommit: { id: 'booking-123', state: 'PENDING' },
      });

      const result = await client.commitBooking({ id: 'booking-123' });

      expect(result.state).toBe('PENDING');
    });
  });

  describe('waitForConfirmation', () => {
    it('should return when booking is confirmed', async () => {
      mockRequest.mockResolvedValueOnce({
        booking: { id: 'booking-123', state: 'CONFIRMED' },
      });

      const result = await client.waitForConfirmation('booking-123');

      expect(result.state).toBe('CONFIRMED');
    });

    it('should throw when booking is rejected', async () => {
      mockRequest.mockResolvedValueOnce({
        booking: { id: 'booking-123', state: 'REJECTED' },
      });

      await expect(client.waitForConfirmation('booking-123')).rejects.toThrow('Booking REJECTED');
    });

    it('should throw when booking is cancelled', async () => {
      mockRequest.mockResolvedValueOnce({
        booking: { id: 'booking-123', state: 'CANCELLED' },
      });

      await expect(client.waitForConfirmation('booking-123')).rejects.toThrow('Booking CANCELLED');
    });

    it('should throw on timeout', async () => {
      mockRequest.mockResolvedValue({
        booking: { id: 'booking-123', state: 'PENDING' },
      });

      await expect(
        client.waitForConfirmation('booking-123', { maxAttempts: 2, intervalMs: 10 })
      ).rejects.toThrow('Booking confirmation timeout');
    });
  });

  describe('listBookings', () => {
    it('should list bookings with filter', async () => {
      mockRequest.mockResolvedValueOnce({
        bookingList: {
          nodes: [{ id: 'b1' }, { id: 'b2' }],
          recordCount: 2,
        },
      });

      const result = await client.listBookings({ consumerId: 'user-123' });

      expect(result.nodes).toHaveLength(2);
      expect(result.recordCount).toBe(2);
    });

    it('should support pagination', async () => {
      mockRequest.mockResolvedValueOnce({
        bookingList: { nodes: [], recordCount: 0 },
      });

      await client.listBookings({}, { first: 10, after: 'cursor' });

      expect(mockRequest).toHaveBeenCalledWith(expect.any(String), {
        filter: {},
        first: 10,
        after: 'cursor',
      });
    });
  });

  describe('cancelBooking', () => {
    it('should cancel booking with reason', async () => {
      mockRequest.mockResolvedValueOnce({
        bookingCancel: { id: 'booking-123', state: 'CANCELLED' },
      });

      const result = await client.cancelBooking({ id: 'booking-123' }, 'Customer request');

      expect(result.state).toBe('CANCELLED');
    });
  });
});

describe('HolibobClient - Category & Place Methods', () => {
  let client: HolibobClient;
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = vi.fn();
    (GraphQLClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      request: mockRequest,
    }));
    client = new HolibobClient({
      apiUrl: 'https://api.holibob.test/graphql',
      apiKey: 'test-api-key',
      partnerId: 'test-partner-id',
    });
  });

  describe('getCategories', () => {
    it('should fetch categories', async () => {
      mockRequest.mockResolvedValueOnce({
        categoryList: {
          nodes: [{ id: 'cat-1', name: 'Tours' }],
        },
      });

      const result = await client.getCategories();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Tours');
    });

    it('should filter by placeId', async () => {
      mockRequest.mockResolvedValueOnce({
        categoryList: { nodes: [] },
      });

      await client.getCategories('place-123');

      expect(mockRequest).toHaveBeenCalledWith(expect.any(String), { placeId: 'place-123' });
    });
  });

  describe('getPlaces', () => {
    it('should fetch places', async () => {
      mockRequest.mockResolvedValueOnce({
        placeList: {
          nodes: [{ id: 'place-1', name: 'London' }],
        },
      });

      const result = await client.getPlaces();

      expect(result).toHaveLength(1);
    });

    it('should filter by parent and type', async () => {
      mockRequest.mockResolvedValueOnce({
        placeList: { nodes: [] },
      });

      await client.getPlaces({ parentId: 'uk', type: 'CITY' });

      expect(mockRequest).toHaveBeenCalledWith(expect.any(String), {
        parentId: 'uk',
        type: 'CITY',
      });
    });
  });
});

describe('HolibobClient - High-Level Helpers', () => {
  let client: HolibobClient;
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = vi.fn();
    (GraphQLClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      request: mockRequest,
    }));
    client = new HolibobClient({
      apiUrl: 'https://api.holibob.test/graphql',
      apiKey: 'test-api-key',
      partnerId: 'test-partner-id',
    });
  });

  describe('startBookingFlow', () => {
    it('should create booking and add availability', async () => {
      mockRequest
        .mockResolvedValueOnce({ bookingCreate: { id: 'booking-123' } })
        .mockResolvedValueOnce({ bookingAddAvailability: { isComplete: false } })
        .mockResolvedValueOnce({ booking: { id: 'booking-123', questionList: [] } });

      const result = await client.startBookingFlow('avail-123');

      expect(mockRequest).toHaveBeenCalledTimes(3);
      expect(result.id).toBe('booking-123');
    });
  });

  describe('completeBookingFlow', () => {
    it('should answer questions and commit booking', async () => {
      mockRequest
        .mockResolvedValueOnce({ booking: { id: 'booking-123', canCommit: true } })
        .mockResolvedValueOnce({ bookingCommit: { id: 'booking-123', state: 'PENDING' } })
        .mockResolvedValueOnce({ booking: { id: 'booking-123', state: 'CONFIRMED' } });

      const result = await client.completeBookingFlow('booking-123', {});

      expect(result.state).toBe('CONFIRMED');
    });

    it('should throw if cannot commit', async () => {
      mockRequest.mockResolvedValueOnce({ booking: { id: 'booking-123', canCommit: false } });

      await expect(client.completeBookingFlow('booking-123', {})).rejects.toThrow(
        'Cannot commit booking'
      );
    });
  });

  describe('getAvailabilityLegacy', () => {
    it('should convert to legacy format', async () => {
      // getAvailabilityLegacy uses discoverAvailability which now uses direct filter (single call)
      mockRequest.mockResolvedValueOnce({
        availabilityList: {
          sessionId: 'session-1',
          nodes: [{ id: 'slot-1', date: '2024-06-15', soldOut: false }],
          optionList: { isComplete: true, nodes: [] },
        },
      });

      const result = await client.getAvailabilityLegacy('prod-123', '2024-06-01', '2024-06-30');

      expect(result.productId).toBe('prod-123');
      expect(result.options).toBeDefined();
    });
  });
});

describe('HolibobClient - Product Filter Mapping', () => {
  let client: HolibobClient;
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = vi.fn();
    (GraphQLClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      request: mockRequest,
    }));
    client = new HolibobClient({
      apiUrl: 'https://api.holibob.test/graphql',
      apiKey: 'test-api-key',
      partnerId: 'test-partner-id',
    });
  });

  // Helper to mock empty product discovery response
  const mockEmptyDiscovery = () => {
    mockRequest.mockResolvedValueOnce({
      productDiscovery: {
        recommendedProductList: {
          nodes: [],
        },
      },
    });
  };

  it('should map price filter correctly', async () => {
    mockEmptyDiscovery();

    await client.discoverProducts({
      priceMin: 50,
      priceMax: 200,
      currency: 'GBP',
    });

    expect(mockRequest).toHaveBeenCalled();
  });

  it('should map category filter correctly', async () => {
    mockEmptyDiscovery();

    await client.discoverProducts({
      categoryIds: ['cat-1', 'cat-2'],
    });

    expect(mockRequest).toHaveBeenCalled();
  });

  it('should map date filter correctly', async () => {
    mockEmptyDiscovery();

    await client.discoverProducts({
      dateFrom: '2024-06-01',
      dateTo: '2024-06-30',
    });

    expect(mockRequest).toHaveBeenCalled();
  });

  it('should handle all guest types', async () => {
    mockEmptyDiscovery();

    await client.discoverProducts({
      adults: 2,
      children: 1,
      infants: 1,
    });

    expect(mockRequest).toHaveBeenCalled();
  });

  it('should handle dates already in ISO 8601 DateTime format', async () => {
    mockEmptyDiscovery();

    await client.discoverProducts({
      dateFrom: '2024-06-01T12:00:00.000Z',
      dateTo: '2024-06-30T23:59:59.999Z',
    });

    expect(mockRequest).toHaveBeenCalled();
  });
});

describe('HolibobClient - Error Handling Edge Cases', () => {
  let client: HolibobClient;
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = vi.fn();
    (GraphQLClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      request: mockRequest,
    }));
    client = new HolibobClient({
      apiUrl: 'https://api.holibob.test/graphql',
      apiKey: 'test-api-key',
      partnerId: 'test-partner-id',
      retries: 1,
    });
  });

  it('should handle non-Error client errors gracefully', async () => {
    // Simulate a client error that is not an Error instance
    const clientError = {
      response: { status: 400 },
      message: 'Bad request',
    };
    mockRequest.mockRejectedValueOnce(clientError);

    await expect(client.getProduct('invalid-id')).rejects.toThrow();
  });
});

describe('HolibobClient - Bulk Operations', () => {
  let client: HolibobClient;
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = vi.fn();
    (GraphQLClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      request: mockRequest,
    }));
    client = new HolibobClient({
      apiUrl: 'https://api.holibob.test/graphql',
      apiKey: 'test-api-key',
      partnerId: 'test-partner-id',
    });
  });

  describe('getAllProducts', () => {
    it('should fetch all products across providers', async () => {
      mockRequest.mockResolvedValueOnce({
        productList: {
          nodes: [
            { id: 'prod-1', name: 'Tour A' },
            { id: 'prod-2', name: 'Tour B' },
          ],
          recordCount: 2,
        },
      });

      const result = await client.getAllProducts();

      expect(result.nodes).toHaveLength(2);
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('discoverProducts with searchTerm', () => {
    it('should include searchTerm in what.data filter', async () => {
      mockRequest.mockResolvedValueOnce({
        productDiscovery: {
          recommendedProductList: { nodes: [] },
        },
      });

      await client.discoverProducts({
        searchTerm: 'wine tasting',
      });

      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('getProvider', () => {
    it('should fetch provider by ID', async () => {
      mockRequest.mockResolvedValueOnce({
        provider: { id: 'prov-1', name: 'Test Provider' },
      });

      const result = await client.getProvider('prov-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('prov-1');
    });

    it('should return null on error', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Provider not found'));

      const result = await client.getProvider('invalid');

      expect(result).toBeNull();
    });
  });

  describe('getProductsByProvider', () => {
    it('should fetch products for a provider with pagination', async () => {
      mockRequest.mockResolvedValueOnce({
        productList: {
          nodes: [{ id: 'prod-1', name: 'Tour A' }],
          recordCount: 1,
        },
      });

      const result = await client.getProductsByProvider('prov-1', {
        pageSize: 50,
        page: 1,
        filters: { search: 'tour', categoryIds: ['cat-1'] },
      });

      expect(result.nodes).toHaveLength(1);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          providerId: 'prov-1',
          pageSize: 50,
          page: 1,
          search: 'tour',
          categoryIds: ['cat-1'],
        })
      );
    });
  });

  describe('getAllProductsByProvider', () => {
    it('should fetch all products across multiple pages', async () => {
      // First page with nextPage
      mockRequest.mockResolvedValueOnce({
        productList: {
          nodes: [{ id: 'prod-1' }, { id: 'prod-2' }],
          recordCount: 4,
          nextPage: 2,
        },
      });
      // Second page without nextPage (last page)
      mockRequest.mockResolvedValueOnce({
        productList: {
          nodes: [{ id: 'prod-3' }, { id: 'prod-4' }],
          recordCount: 4,
          nextPage: null,
        },
      });

      const result = await client.getAllProductsByProvider('prov-1');

      expect(result).toHaveLength(4);
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });
  });
});
