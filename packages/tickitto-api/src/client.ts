/**
 * Tickitto REST API Client
 *
 * Provides methods for event discovery, availability widget URLs, and metadata.
 * Tickitto uses an iframe widget for the actual booking/ticket selection flow.
 */

import type {
  TickittoClientConfig,
  TickittoEvent,
  TickittoSearchParams,
  TickittoSearchResult,
  TickittoSessionObject,
  TickittoAvailabilitySession,
  TickittoDayAvailability,
  TickittoVenue,
  TickittoVenueSearchParams,
  TickittoMetadata,
  TickittoAutocompleteResult,
} from './types.js';

export class TickittoClient {
  private config: Required<TickittoClientConfig>;

  constructor(config: TickittoClientConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config,
    };
  }

  // ==========================================================================
  // EVENT SEARCH & DISCOVERY
  // ==========================================================================

  /**
   * Search events from the Tickitto inventory.
   * Returns events with availability within the specified date range.
   */
  async searchEvents(params: TickittoSearchParams = {}): Promise<TickittoSearchResult> {
    const queryParams = new URLSearchParams();

    if (params.t1) queryParams.set('t1', params.t1);
    if (params.t2) queryParams.set('t2', params.t2);
    if (params.text) queryParams.set('text', params.text);
    if (params.currency) queryParams.set('currency', params.currency);
    if (params.min_price != null) queryParams.set('min_price', String(params.min_price));
    if (params.max_price != null) queryParams.set('max_price', String(params.max_price));
    if (params.skip != null) queryParams.set('skip', String(params.skip));
    if (params.limit != null) queryParams.set('limit', String(params.limit));
    if (params.sort_by) queryParams.set('sort_by', params.sort_by);
    if (params.range != null) queryParams.set('range', String(params.range));
    if (params.partial_match != null) queryParams.set('partial_match', String(params.partial_match));

    // Array params
    for (const key of [
      'category',
      'city',
      'state',
      'region',
      'country',
      'country_code',
      'performer',
      'venue',
      'event_type',
      'event_ids',
    ] as const) {
      const values = params[key];
      if (values && values.length > 0) {
        for (const value of values) {
          queryParams.append(key, value);
        }
      }
    }

    const response = await this.request<TickittoEvent[]>(`/api/events/?${queryParams.toString()}`);

    return {
      events: response.data,
      totalCount: response.totalCount ?? response.data.length,
    };
  }

  /**
   * Get a single event by ID.
   */
  async getEvent(eventId: string, currency: string = 'GBP'): Promise<TickittoEvent | null> {
    try {
      const response = await this.request<TickittoEvent>(
        `/api/events/${encodeURIComponent(eventId)}?currency=${currency}`
      );
      return response.data;
    } catch (error) {
      if (error instanceof TickittoApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // ==========================================================================
  // SEARCH WITH METADATA
  // ==========================================================================

  /**
   * Search events with supplementary metadata about results.
   */
  async search(params: TickittoSearchParams = {}): Promise<TickittoSearchResult> {
    const queryParams = new URLSearchParams();

    if (params.t1) queryParams.set('t1', params.t1);
    if (params.t2) queryParams.set('t2', params.t2);
    if (params.text) queryParams.set('text', params.text);
    if (params.currency) queryParams.set('currency', params.currency);
    if (params.skip != null) queryParams.set('skip', String(params.skip));
    if (params.limit != null) queryParams.set('limit', String(params.limit));

    // Array params
    for (const key of ['category', 'city', 'country', 'country_code'] as const) {
      const values = params[key];
      if (values && values.length > 0) {
        for (const value of values) {
          queryParams.append(key, value);
        }
      }
    }

    const response = await this.request<TickittoEvent[]>(`/api/search/?${queryParams.toString()}`);

    return {
      events: response.data,
      totalCount: response.totalCount ?? response.data.length,
    };
  }

  /**
   * Autocomplete suggestions for event search.
   */
  async autocomplete(
    text: string,
    options?: { skip?: number; limit?: number }
  ): Promise<TickittoAutocompleteResult> {
    const queryParams = new URLSearchParams({ text });
    if (options?.skip != null) queryParams.set('skip', String(options.skip));
    if (options?.limit != null) queryParams.set('limit', String(options.limit));

    const response = await this.request<TickittoAutocompleteResult>(
      `/api/search/autocomplete?${queryParams.toString()}`
    );
    return response.data;
  }

  // ==========================================================================
  // AVAILABILITY (Widget-based)
  // ==========================================================================

  /**
   * Get the availability widget URL for an event.
   * Returns a session_id and view_url to embed in an iframe.
   */
  async getAvailabilityWidget(
    eventId: string,
    options?: { basketId?: string; allowCache?: boolean; t1?: string; t2?: string }
  ): Promise<TickittoSessionObject> {
    const queryParams = new URLSearchParams({ event_id: eventId });
    if (options?.basketId) queryParams.set('basket_id', options.basketId);
    if (options?.allowCache != null) queryParams.set('allow_cache', String(options.allowCache));
    if (options?.t1) queryParams.set('t1', options.t1);
    if (options?.t2) queryParams.set('t2', options.t2);

    const response = await this.request<TickittoSessionObject>(
      `/api/availability/?${queryParams.toString()}`
    );
    return response.data;
  }

  /**
   * Get availability session details.
   */
  async getAvailabilitySession(
    sessionId: string,
    options?: { allowCache?: boolean; t1?: string; t2?: string }
  ): Promise<TickittoAvailabilitySession> {
    const queryParams = new URLSearchParams({ session_id: sessionId });
    if (options?.allowCache != null) queryParams.set('allow_cache', String(options.allowCache));
    if (options?.t1) queryParams.set('t1', options.t1);
    if (options?.t2) queryParams.set('t2', options.t2);

    const response = await this.request<TickittoAvailabilitySession>(
      `/api/availability/session?${queryParams.toString()}`
    );
    return response.data;
  }

  /**
   * Get daily availability updates for a session.
   */
  async getDayAvailability(
    sessionId: string,
    day: string,
    quantity?: number
  ): Promise<TickittoDayAvailability> {
    const queryParams = new URLSearchParams({ session_id: sessionId, day });
    if (quantity != null) queryParams.set('quantity', String(quantity));

    const response = await this.request<TickittoDayAvailability>(
      `/api/availability/day?${queryParams.toString()}`
    );
    return response.data;
  }

  // ==========================================================================
  // VENUES
  // ==========================================================================

  /**
   * List venues with optional filtering.
   */
  async getVenues(params?: TickittoVenueSearchParams): Promise<TickittoVenue[]> {
    const queryParams = new URLSearchParams();
    if (params?.skip != null) queryParams.set('skip', String(params.skip));
    if (params?.limit != null) queryParams.set('limit', String(params.limit));
    if (params?.venue_ids) {
      for (const id of params.venue_ids) {
        queryParams.append('venue_ids', id);
      }
    }

    const response = await this.request<TickittoVenue[]>(
      `/api/venues/?${queryParams.toString()}`
    );
    return response.data;
  }

  /**
   * Get a single venue by ID.
   */
  async getVenue(venueId: string): Promise<TickittoVenue | null> {
    try {
      const response = await this.request<TickittoVenue>(
        `/api/venues/${encodeURIComponent(venueId)}`
      );
      return response.data;
    } catch (error) {
      if (error instanceof TickittoApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // ==========================================================================
  // METADATA
  // ==========================================================================

  /**
   * Get metadata describing available event locations and categories.
   */
  async getMetadata(options?: {
    includeEmpty?: boolean;
    filterChildren?: boolean;
  }): Promise<TickittoMetadata> {
    const queryParams = new URLSearchParams();
    if (options?.includeEmpty != null) queryParams.set('include_empty', String(options.includeEmpty));
    if (options?.filterChildren != null)
      queryParams.set('filter_children', String(options.filterChildren));

    const response = await this.request<TickittoMetadata>(
      `/api/metadata/?${queryParams.toString()}`
    );
    return response.data;
  }

  // ==========================================================================
  // INTERNAL HTTP CLIENT
  // ==========================================================================

  private async request<T>(
    path: string
  ): Promise<{ data: T; totalCount?: number }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        const url = `${this.config.apiUrl}${path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            key: this.config.apiKey,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const body = await response.text();
          throw new TickittoApiError(
            `Tickitto API error ${response.status}: ${body}`,
            response.status,
            body
          );
        }

        const data = (await response.json()) as T;
        const totalCountHeader = response.headers.get('x-total-count');
        const totalCount = totalCountHeader ? parseInt(totalCountHeader, 10) : undefined;

        return { data, totalCount };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        if (error instanceof TickittoApiError && error.status >= 400 && error.status < 500) {
          throw error;
        }

        // Don't retry on abort (timeout)
        if (lastError.name === 'AbortError') {
          throw new TickittoApiError('Request timed out', 408, '');
        }

        // Exponential backoff for retries
        if (attempt < this.config.retries) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }
}

export class TickittoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = 'TickittoApiError';
  }
}

/**
 * Factory function to create a TickittoClient
 */
export function createTickittoClient(config: TickittoClientConfig): TickittoClient {
  return new TickittoClient(config);
}
