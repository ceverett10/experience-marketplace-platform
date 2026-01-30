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
    apiUrl: process.env['HOLIBOB_API_URL'] ?? 'https://api.sandbox.holibob.tech/graphql',
    apiKey: process.env['HOLIBOB_API_KEY'] ?? '',
    apiSecret: process.env['HOLIBOB_API_SECRET'], // For HMAC signature auth
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
  // Cancellation policy from Holibob API
  cancellationPolicy?: {
    type?: string;
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
  // Image fields - different formats from different API endpoints
  primaryImage?: { url?: string };
  primaryImageUrl?: string; // Product Discovery API
  imageUrl?: string;
  images?: { url?: string }[];
  imageList?: { nodes: { id?: string; url?: string; altText?: string }[] }; // Product Detail API
  // Price fields
  pricing?: {
    retailPrice?: { amount?: number; currency?: string };
  };
  priceFrom?: number;
  priceFromFormatted?: string; // Product Discovery API
  priceCurrency?: string; // Product Discovery API
  guidePrice?: number; // Product Detail API
  guidePriceFormattedText?: string; // Product Detail API
  guidePriceCurrency?: string; // Product Detail API
  currency?: string;
  // Duration fields
  duration?:
    | number
    | {
        value?: number;
        unit?: string;
      };
  maxDuration?: number; // Product Discovery API
  durationText?: string;
  // Review/rating fields
  reviews?: {
    averageRating?: number;
    totalCount?: number;
  };
  rating?: number;
  reviewRating?: number; // Product Discovery/Detail API
  reviewCount?: number; // Product Discovery/Detail API
  // Location
  location?: {
    name?: string;
    address?: string;
    coordinates?: { lat?: number; lng?: number };
    lat?: number;
    lng?: number;
  };
  // Categories - different formats
  categories?: {
    id?: string;
    name?: string;
    slug?: string;
  }[];
  categoryList?: { nodes: { id?: string; name?: string; slug?: string }[] }; // Product Detail API
  // Content
  highlights?: string[];
  inclusions?: string[];
  exclusions?: string[];
  importantInfo?: string[];
  // Cancellation policy - can be string or object
  cancellationPolicy?: { type?: string; description?: string } | string;
}): Experience {
  // Handle price from different API endpoints
  const priceAmount =
    product.guidePrice ?? // Product Detail API
    product.pricing?.retailPrice?.amount ??
    product.priceFrom ?? // Product Discovery API
    0;
  const currency =
    product.guidePriceCurrency ?? // Product Detail API
    product.pricing?.retailPrice?.currency ??
    product.priceCurrency ?? // Product Discovery API
    product.currency ??
    'GBP';
  const priceFormatted =
    product.guidePriceFormattedText ??
    product.priceFromFormatted ??
    formatPrice(priceAmount, currency);

  // Handle duration as either number (minutes) or object
  // Product Discovery API uses maxDuration
  let durationValue: number;
  let durationUnit: string;
  if (product.maxDuration != null) {
    durationValue = product.maxDuration;
    durationUnit = 'minutes';
  } else if (typeof product.duration === 'number') {
    durationValue = product.duration;
    durationUnit = 'minutes';
  } else {
    durationValue = product.duration?.value ?? 0;
    durationUnit = product.duration?.unit ?? 'hours';
  }

  // Handle rating - may not be available from all API responses
  // Note: reviewRating/reviewCount fields removed from query as they may not exist in schema
  const ratingValue = product.reviews?.averageRating ?? product.rating;
  const reviewCount = product.reviews?.totalCount ?? 0;

  // Handle cancellation policy as string or object
  const cancellationPolicy =
    typeof product.cancellationPolicy === 'string'
      ? product.cancellationPolicy
      : (product.cancellationPolicy?.description ?? '');

  // Handle images from different API formats
  // Product Detail API: imageList.nodes[].url
  // Other formats: images[].url or primaryImage.url
  const imageListUrls = product.imageList?.nodes?.map((img) => img.url ?? '').filter(Boolean) ?? [];
  const legacyImageUrls = product.images?.map((img) => img.url ?? '').filter(Boolean) ?? [];
  const allImages = imageListUrls.length > 0 ? imageListUrls : legacyImageUrls;

  // Primary image URL
  const primaryImageUrl =
    allImages[0] ??
    product.primaryImage?.url ??
    product.primaryImageUrl ??
    product.imageUrl ??
    '/placeholder-experience.jpg';

  // Handle categories from different API formats
  // Product Detail API: categoryList.nodes[]
  // Other formats: categories[]
  const categoryListNodes = product.categoryList?.nodes ?? [];
  const legacyCategories = product.categories ?? [];
  const allCategories = categoryListNodes.length > 0 ? categoryListNodes : legacyCategories;

  return {
    id: product.id,
    title: product.title ?? product.name ?? 'Untitled Experience',
    slug: product.slug ?? product.id,
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    imageUrl: primaryImageUrl,
    images: allImages.length > 0 ? allImages : [primaryImageUrl],
    price: {
      amount: priceAmount,
      currency,
      formatted: priceFormatted,
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
    categories: allCategories.map((cat) => ({
      id: cat.id ?? '',
      name: cat.name ?? '',
      slug: cat.slug ?? cat.id ?? '',
    })),
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
