/**
 * Tickitto API TypeScript types
 * Based on the OpenAPI spec at https://dev.tickitto.tech/docs
 */

// ============================================================================
// Client Configuration
// ============================================================================

export interface TickittoClientConfig {
  /** Base API URL (e.g., https://dev.tickitto.tech) */
  apiUrl: string;
  /** API key passed in the `key` header */
  apiKey: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Number of retries on failure (default: 3) */
  retries?: number;
}

// ============================================================================
// Event Types
// ============================================================================

export interface TickittoEventImage {
  desktop: string | null;
  mobile: string | null;
  thumbnail: string | null;
}

export interface TickittoVenueLocation {
  latitude: number;
  longitude: number;
  id: string;
  venue_brand_id: string | null;
  venue_address: string;
  seatplan_images: string[];
  configuration: unknown | null;
  venue_name: string;
  venue_brand: string | null;
  venue_city: string | null;
  venue_country: string | null;
}

export interface TickittoPrice {
  amount: number;
  currency: string;
}

export interface TickittoPerformer {
  id: string;
  name: string;
  images?: TickittoEventImage[];
}

export interface TickittoEvent {
  event_id: string;
  title: string;
  slug: string;
  description: string;
  short_description: string;
  event_type: string;
  categories: string[];
  city: string;
  region: string | null;
  state: string | null;
  country: string;
  country_code: string;
  from_price: TickittoPrice;
  images: TickittoEventImage[];
  videos: unknown[];
  venue_location: TickittoVenueLocation[];
  performers: TickittoPerformer[];
  popularity: number;
  duration: number | null;
  admission_type: string;
  booking_type: string;
  delivery_methods: string[];
  cancellation_policy: string;
  cancellation_policy_information: string[];
  cancellation_allowed: boolean;
  tags: string[] | null;
  is_tbd: { time: boolean; date: boolean };
  no_fulfilment: boolean;
  addon_required: boolean;
  addons: unknown[];
  pickup_required: boolean;
  personalisations_required: unknown | null;
  delayed_fulfilment: boolean;
  soft_availability_t1: string;
  soft_availability_t2: string;
  ticket_instructions: string[];
  entry_notes: string[];
  product_highlights: string[];
  product_includes: string[];
  product_excludes: string[];
  seatplan_overview: string | null;
  pickup_points: unknown[];
}

// ============================================================================
// Search Types
// ============================================================================

export type TickittoSortBy = 'relevance' | 'price_asc' | 'price_desc' | 'date' | 'popularity';

export interface TickittoSearchParams {
  /** Start date (defaults to today) */
  t1?: string;
  /** End date (defaults to 14 days ahead) */
  t2?: string;
  /** Event categories */
  category?: string[];
  /** Cities to filter */
  city?: string[];
  /** States to filter */
  state?: string[];
  /** Regions to filter */
  region?: string[];
  /** Countries to filter */
  country?: string[];
  /** ISO 2-letter country codes */
  country_code?: string[];
  /** Performer names */
  performer?: string[];
  /** Venue names */
  venue?: string[];
  /** Event type filter */
  event_type?: string[];
  /** Minimum price threshold */
  min_price?: number;
  /** Maximum price threshold */
  max_price?: number;
  /** Display currency (default: GBP) */
  currency?: string;
  /** Search query text */
  text?: string;
  /** Distance in km from city */
  range?: number;
  /** Pagination offset */
  skip?: number;
  /** Results per page (max 100, default 100) */
  limit?: number;
  /** Enable fuzzy matching */
  partial_match?: boolean;
  /** Sort order */
  sort_by?: TickittoSortBy;
  /** Specific event IDs to retrieve */
  event_ids?: string[];
}

export interface TickittoSearchResult {
  events: TickittoEvent[];
  totalCount: number;
}

// ============================================================================
// Autocomplete Types
// ============================================================================

export interface TickittoAutocompleteResult {
  // Shape depends on actual API response - will be refined
  [key: string]: unknown;
}

// ============================================================================
// Availability Types
// ============================================================================

export interface TickittoSessionObject {
  session_id: string;
  view_url: string;
}

export interface TickittoAvailabilitySession {
  session_id: string;
  [key: string]: unknown;
}

export interface TickittoDayAvailability {
  [key: string]: unknown;
}

// ============================================================================
// Venue Types
// ============================================================================

export interface TickittoVenue {
  id: string;
  venue_name: string;
  venue_address: string;
  latitude: number;
  longitude: number;
  venue_brand: string | null;
  venue_city: string | null;
  venue_country: string | null;
  [key: string]: unknown;
}

export interface TickittoVenueSearchParams {
  skip?: number;
  limit?: number;
  venue_ids?: string[];
}

// ============================================================================
// Metadata Types
// ============================================================================

export interface TickittoMetadata {
  locations: unknown[];
  categories: unknown[];
  [key: string]: unknown;
}
