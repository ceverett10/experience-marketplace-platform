import { GraphQLClient } from 'graphql-request';
import {
  type HolibobClientConfig,
  type HolibobApiResponse,
  type Product,
  type ProductFilter,
  type ProductListResponse,
  type AvailabilityResponse,
  type Booking,
  type CreateBookingInput,
} from '../types/index.js';
import {
  PRODUCT_DISCOVERY_QUERY,
  PRODUCT_DETAIL_QUERY,
  AVAILABILITY_QUERY,
  CREATE_BOOKING_MUTATION,
  GET_BOOKING_QUERY,
  COMMIT_BOOKING_MUTATION,
} from '../queries/index.js';

export class HolibobClient {
  private client: GraphQLClient;
  private config: HolibobClientConfig;

  constructor(config: HolibobClientConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config,
    };

    this.client = new GraphQLClient(this.config.apiUrl, {
      headers: {
        'X-API-Key': this.config.apiKey,
        'X-Partner-Id': this.config.partnerId,
        'Content-Type': 'application/json',
      },
    });
  }

  // ==========================================================================
  // PRODUCT DISCOVERY
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

    const response = await this.executeQuery<{ productDiscovery: ProductListResponse }>(
      PRODUCT_DISCOVERY_QUERY,
      variables
    );

    return response.productDiscovery;
  }

  /**
   * Get a single product by ID
   */
  async getProduct(productId: string): Promise<Product | null> {
    const response = await this.executeQuery<{ product: Product | null }>(
      PRODUCT_DETAIL_QUERY,
      { id: productId }
    );

    return response.product;
  }

  /**
   * Get availability for a product
   */
  async getAvailability(
    productId: string,
    dateFrom: string,
    dateTo: string,
    guests?: { adults?: number; children?: number }
  ): Promise<AvailabilityResponse> {
    const variables = {
      productId,
      dateFrom,
      dateTo,
      adults: guests?.adults ?? 2,
      children: guests?.children ?? 0,
    };

    const response = await this.executeQuery<{ availability: AvailabilityResponse }>(
      AVAILABILITY_QUERY,
      variables
    );

    return response.availability;
  }

  // ==========================================================================
  // BOOKING
  // ==========================================================================

  /**
   * Create a new booking (basket)
   */
  async createBooking(input: CreateBookingInput): Promise<Booking> {
    const response = await this.executeQuery<{ bookingCreate: Booking }>(
      CREATE_BOOKING_MUTATION,
      { input }
    );

    return response.bookingCreate;
  }

  /**
   * Get booking by ID
   */
  async getBooking(bookingId: string): Promise<Booking | null> {
    const response = await this.executeQuery<{ booking: Booking | null }>(
      GET_BOOKING_QUERY,
      { id: bookingId }
    );

    return response.booking;
  }

  /**
   * Commit booking (finalize before payment)
   */
  async commitBooking(bookingId: string): Promise<Booking> {
    const response = await this.executeQuery<{ bookingCommit: Booking }>(
      COMMIT_BOOKING_MUTATION,
      { id: bookingId }
    );

    return response.bookingCommit;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private async executeQuery<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
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
      what: filter.categoryIds
        ? { categoryIds: filter.categoryIds }
        : undefined,
      price: filter.priceMin || filter.priceMax
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
