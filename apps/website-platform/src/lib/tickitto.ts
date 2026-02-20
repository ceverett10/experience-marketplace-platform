/**
 * Tickitto API Client Utilities
 * Server-side helpers for interacting with Tickitto API
 * Parallel to lib/holibob.ts for the Holibob integration
 */

import {
  createTickittoClient,
  type TickittoClient,
  type TickittoEvent,
} from '@experience-marketplace/tickitto-api';
import type { Experience, ExperienceListItem } from './holibob';

// Cache client instance
let cachedClient: TickittoClient | null = null;

/**
 * Get or create Tickitto client (singleton)
 */
export function getTickittoClient(): TickittoClient {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = createTickittoClient({
    apiUrl: process.env['TICKITTO_API_URL'] ?? 'https://dev.tickitto.tech',
    apiKey: process.env['TICKITTO_API_KEY'] ?? '',
    timeout: 30000,
    retries: 3,
  });

  return cachedClient;
}

/**
 * Map a Tickitto event to the full Experience interface
 * This allows all existing components to work unchanged with Tickitto data
 */
export function mapTickittoEventToExperience(event: TickittoEvent): Experience {
  const venue = event.venue_location[0];
  const primaryImage = event.images[0]?.desktop ?? '/placeholder-experience.jpg';

  // Tickitto prices are in major units (e.g., 194.35 GBP)
  const priceAmount = Math.round(event.from_price.amount * 100); // Convert to cents for consistency
  const currency = event.from_price.currency;
  const priceFormatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(event.from_price.amount);

  return {
    id: event.event_id,
    title: event.title,
    slug: event.event_id,
    shortDescription: event.short_description,
    description: event.description,
    imageUrl: primaryImage,
    images: event.images.map((img) => img.desktop).filter((url): url is string => url != null),
    price: {
      amount: priceAmount,
      currency,
      formatted: priceFormatted,
    },
    duration: {
      value: event.duration ?? 0,
      unit: 'minutes',
      formatted: event.duration ? formatDuration(event.duration) : '',
    },
    rating: null, // Tickitto doesn't provide ratings
    location: {
      name: venue?.venue_name ?? event.city ?? '',
      address: venue?.venue_address ?? '',
      lat: venue?.latitude ?? 0,
      lng: venue?.longitude ?? 0,
    },
    reviews: [],
    categories: event.categories.map((cat, idx) => ({
      id: String(idx),
      name: cat,
      slug: cat.toLowerCase().replace(/\s+/g, '-'),
    })),
    highlights: event.product_highlights,
    inclusions: event.product_includes,
    exclusions: event.product_excludes,
    cancellationPolicy: event.cancellation_policy,
    itinerary: [],
    additionalInfo: [...event.ticket_instructions, ...event.entry_notes],
    languages: [],
    provider: {
      id: 'tickitto',
      name: 'Tickitto',
    },
  };
}

/**
 * Map a Tickitto event to the ExperienceListItem interface (for card display)
 */
export function mapTickittoEventToExperienceListItem(event: TickittoEvent): ExperienceListItem {
  const primaryImage = event.images[0]?.desktop ?? '/placeholder-experience.jpg';

  // Tickitto prices are in major units (e.g., 194.35 GBP)
  const priceAmount = Math.round(event.from_price.amount * 100);
  const currency = event.from_price.currency;
  const priceFormatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(event.from_price.amount);

  return {
    id: event.event_id,
    title: event.title,
    slug: event.event_id,
    shortDescription: event.short_description,
    imageUrl: primaryImage,
    price: {
      amount: priceAmount,
      currency,
      formatted: priceFormatted,
    },
    duration: {
      formatted: event.duration ? formatDuration(event.duration) : '',
    },
    rating: null,
    location: {
      name: event.city ?? '',
    },
  };
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  return `${minutes} min`;
}
