import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphQLClient } from 'graphql-request';
import { HolibobClient, createHolibobClient } from './index.js';
import type { HolibobClientConfig } from '../types/index.js';

// Mock graphql-request
vi.mock('graphql-request', () => ({
  GraphQLClient: vi.fn().mockImplementation(() => ({
    request: vi.fn(),
  })),
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
    it('should fetch products with location filter', async () => {
      const mockResponse = {
        productDiscovery: {
          edges: [
            {
              node: {
                id: 'prod-1',
                name: 'Test Experience',
                description: 'A test experience',
              },
            },
          ],
          pageInfo: {
            hasNextPage: false,
            endCursor: null,
          },
          totalCount: 1,
        },
      };

      mockRequest.mockResolvedValueOnce(mockResponse);

      const result = await client.discoverProducts({
        placeIds: ['place-123'],
        adults: 2,
      });

      expect(result).toEqual(mockResponse.productDiscovery);
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('should handle geo point filter', async () => {
      const mockResponse = {
        productDiscovery: {
          edges: [],
          pageInfo: { hasNextPage: false, endCursor: null },
          totalCount: 0,
        },
      };

      mockRequest.mockResolvedValueOnce(mockResponse);

      const result = await client.discoverProducts({
        geoPoint: { lat: 51.5074, lng: -0.1278, radiusKm: 25 },
      });

      expect(result).toEqual(mockResponse.productDiscovery);
    });

    it('should support pagination', async () => {
      const mockResponse = {
        productDiscovery: {
          edges: [],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-abc' },
          totalCount: 100,
        },
      };

      mockRequest.mockResolvedValueOnce(mockResponse);

      const result = await client.discoverProducts(
        { placeIds: ['place-1'] },
        { first: 10, after: 'cursor-xyz' }
      );

      expect(result.pageInfo.endCursor).toBe('cursor-abc');
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

      mockRequest.mockResolvedValueOnce({ product: mockProduct });

      const result = await client.getProduct('prod-123');

      expect(result).toEqual(mockProduct);
      expect(mockRequest).toHaveBeenCalledWith(expect.any(String), { id: 'prod-123' });
    });

    it('should return null for non-existent product', async () => {
      mockRequest.mockResolvedValueOnce({ product: null });

      const result = await client.getProduct('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getAvailability', () => {
    it('should fetch availability for a product', async () => {
      const mockAvailability = {
        slots: [
          {
            date: '2024-06-15',
            available: true,
            price: { amount: 50, currency: 'GBP' },
          },
        ],
      };

      mockRequest.mockResolvedValueOnce({ availability: mockAvailability });

      const result = await client.getAvailability('prod-123', '2024-06-01', '2024-06-30', {
        adults: 2,
        children: 1,
      });

      expect(result).toEqual(mockAvailability);
    });

    it('should use default guest counts', async () => {
      mockRequest.mockResolvedValueOnce({ availability: { slots: [] } });

      await client.getAvailability('prod-123', '2024-06-01', '2024-06-30');

      expect(mockRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          adults: 2,
          children: 0,
        })
      );
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

      const result = await client.commitBooking('booking-123');

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
        .mockResolvedValueOnce({ product: { id: 'prod-1' } });

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
