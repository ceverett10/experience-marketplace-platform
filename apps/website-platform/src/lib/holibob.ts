/**
 * Holibob API Client Utilities
 * Server-side helpers for interacting with Holibob API
 */

import { createHolibobClient, type HolibobClient } from '@experience-marketplace/holibob-api';
import type { SiteConfig } from './tenant';

// Cache clients per partner ID
const clientCache = new Map<string, HolibobClient>();

/**
 * Get or create Holibob client for a site
 */
export function getHolibobClient(site: SiteConfig): HolibobClient {
  const partnerId = site.holibobPartnerId;

  // Check cache first
  const cached = clientCache.get(partnerId);
  if (cached) {
    return cached;
  }

  // Create new client
  const client = createHolibobClient({
    apiUrl: process.env['HOLIBOB_API_URL'] ?? 'https://api.holibob.tech/graphql',
    apiKey: process.env['HOLIBOB_API_KEY'] ?? '',
    partnerId,
    timeout: 30000,
    retries: 3,
  });

  // Cache it
  clientCache.set(partnerId, client);

  return client;
}

/**
 * Helper types for Holibob responses
 */
export interface Experience {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  images: string[];
  price: {
    amount: number;
    currency: string;
    formatted: string;
  };
  duration: {
    value: number;
    unit: string;
    formatted: string;
  };
  rating: {
    average: number;
    count: number;
  } | null;
  location: {
    name: string;
    address: string;
    lat: number;
    lng: number;
  };
  categories: {
    id: string;
    name: string;
    slug: string;
  }[];
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  cancellationPolicy: string;
}

export interface ExperienceListItem {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  imageUrl: string;
  price: {
    amount: number;
    currency: string;
    formatted: string;
  };
  duration: {
    formatted: string;
  };
  rating: {
    average: number;
    count: number;
  } | null;
  location: {
    name: string;
  };
}

/**
 * Map Holibob product to Experience
 */
export function mapProductToExperience(product: {
  id: string;
  title?: string;
  name?: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  primaryImage?: { url?: string };
  imageUrl?: string;
  images?: { url?: string }[];
  pricing?: {
    retailPrice?: { amount?: number; currency?: string };
  };
  priceFrom?: number;
  currency?: string;
  duration?:
    | number
    | {
        value?: number;
        unit?: string;
      };
  durationText?: string;
  reviews?: {
    averageRating?: number;
    totalCount?: number;
  };
  rating?: number;
  reviewCount?: number;
  location?: {
    name?: string;
    address?: string;
    coordinates?: { lat?: number; lng?: number };
    lat?: number;
    lng?: number;
  };
  categories?: {
    id?: string;
    name?: string;
    slug?: string;
  }[];
  highlights?: string[];
  inclusions?: string[];
  exclusions?: string[];
  cancellationPolicy?: { description?: string } | string;
}): Experience {
  const priceAmount = product.pricing?.retailPrice?.amount ?? product.priceFrom ?? 0;
  const currency = product.pricing?.retailPrice?.currency ?? product.currency ?? 'GBP';

  // Handle duration as either number (minutes) or object
  let durationValue: number;
  let durationUnit: string;
  if (typeof product.duration === 'number') {
    durationValue = product.duration;
    durationUnit = 'minutes';
  } else {
    durationValue = product.duration?.value ?? 0;
    durationUnit = product.duration?.unit ?? 'hours';
  }

  // Handle rating from different sources
  const ratingValue = product.reviews?.averageRating ?? product.rating;
  const reviewCount = product.reviews?.totalCount ?? product.reviewCount ?? 0;

  // Handle cancellation policy as string or object
  const cancellationPolicy =
    typeof product.cancellationPolicy === 'string'
      ? product.cancellationPolicy
      : (product.cancellationPolicy?.description ?? '');

  return {
    id: product.id,
    title: product.title ?? product.name ?? 'Untitled Experience',
    slug: product.slug ?? product.id,
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    imageUrl: product.primaryImage?.url ?? product.imageUrl ?? '/placeholder-experience.jpg',
    images: product.images?.map((img) => img.url ?? '') ?? [],
    price: {
      amount: priceAmount,
      currency,
      formatted: formatPrice(priceAmount, currency),
    },
    duration: {
      value: durationValue,
      unit: durationUnit,
      formatted: product.durationText ?? formatDuration(durationValue, durationUnit),
    },
    rating: ratingValue
      ? {
          average: ratingValue,
          count: reviewCount,
        }
      : null,
    location: {
      name: product.location?.name ?? '',
      address: product.location?.address ?? '',
      lat: product.location?.coordinates?.lat ?? product.location?.lat ?? 0,
      lng: product.location?.coordinates?.lng ?? product.location?.lng ?? 0,
    },
    categories:
      product.categories?.map((cat) => ({
        id: cat.id ?? '',
        name: cat.name ?? '',
        slug: cat.slug ?? cat.id ?? '',
      })) ?? [],
    highlights: product.highlights ?? [],
    inclusions: product.inclusions ?? [],
    exclusions: product.exclusions ?? [],
    cancellationPolicy,
  };
}

/**
 * Format price for display
 */
export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount / 100); // Assuming amount is in cents/pence
}

/**
 * Format duration for display
 */
export function formatDuration(value: number, unit: string): string {
  if (unit === 'minutes') {
    if (value >= 60) {
      const hours = Math.floor(value / 60);
      const mins = value % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${value}m`;
  }
  if (unit === 'hours') {
    return value === 1 ? '1 hour' : `${value} hours`;
  }
  if (unit === 'days') {
    return value === 1 ? '1 day' : `${value} days`;
  }
  return `${value} ${unit}`;
}
