/**
 * Holibob API Client Utilities
 * Server-side helpers for interacting with Holibob API
 */

import { cookies } from 'next/headers';
import { createHolibobClient, type HolibobClient } from '@experience-marketplace/holibob-api';
import type { SiteConfig } from './tenant';
import { CURRENCY_COOKIE, currencyToLocale, getEffectiveCurrency } from './currency';

// Cache clients per partner+currency combination.
// Max 50 entries — covers all realistic partnerId × currency combinations.
// If exceeded (e.g. unusual currencies), clear and rebuild from scratch.
const CLIENT_CACHE_MAX = 50;
const clientCache = new Map<string, HolibobClient>();

/**
 * Image size presets for different contexts
 * Optimized for actual display sizes to reduce bandwidth
 */
export const IMAGE_PRESETS = {
  // Cards on listing pages - optimized for typical card display
  card: { width: 400, height: 267, quality: 75 },

  // Gallery images - main image in detail page gallery
  galleryMain: { width: 800, height: 533, quality: 80 },

  // Gallery thumbnails - secondary images in gallery grid
  galleryThumbnail: { width: 300, height: 200, quality: 70 },

  // Lightbox/modal - full resolution for zoom
  lightbox: { width: 1200, height: 800, quality: 85 },

  // Compact cards (sidebars, related items)
  compact: { width: 160, height: 107, quality: 70 },
} as const;

/**
 * Get or create Holibob client for a site.
 * Reads the preferred_currency cookie so all callers automatically
 * get a client configured with the user's chosen currency.
 */
export async function getHolibobClient(site: SiteConfig): Promise<HolibobClient> {
  let currency = site.primaryCurrency ?? 'GBP';
  try {
    const cookieStore = await cookies();
    const currencyCookie = cookieStore.get(CURRENCY_COOKIE)?.value;
    currency = getEffectiveCurrency(currency, currencyCookie);
  } catch {
    // cookies() throws outside request context (e.g. build time)
  }

  const partnerId = site.holibobPartnerId;
  const cacheKey = `${partnerId}:${currency}`;

  // Check cache first (keyed by partnerId + currency)
  const cached = clientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Create new client with site's currency
  const client = createHolibobClient({
    apiUrl: process.env['HOLIBOB_API_URL'] ?? 'https://api.production.holibob.tech/graphql',
    apiKey: process.env['HOLIBOB_API_KEY'] ?? '',
    apiSecret: process.env['HOLIBOB_API_SECRET'], // For HMAC signature auth
    partnerId,
    currency,
    timeout: 30000,
    retries: 3,
  });

  // Cache it — clear all if cap exceeded to keep memory bounded
  if (clientCache.size >= CLIENT_CACHE_MAX) clientCache.clear();
  clientCache.set(cacheKey, client);

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
  lightboxImages: string[];
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
    mapImageUrl?: string;
  };
  reviews: {
    id: string;
    title: string;
    content: string;
    rating: number;
    authorName: string;
    publishedDate: string;
    images: string[];
  }[];
  categories: {
    id: string;
    name: string;
    slug: string;
  }[];
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  cancellationPolicy: string;
  /** True only when Holibob explicitly says the experience supports free cancellation */
  hasFreeCancellation: boolean;
  // New fields for complete product content
  itinerary: {
    name: string;
    description: string;
    /** True for stops the tour passes by without stopping */
    isPassBy: boolean;
    /** Optional admission-included indicator from Holibob */
    isAdmissionIncluded?: boolean;
    /** Optional day number for multi-day tours (1, 2, 3...) */
    day?: number;
    /** Optional formatted address for the stop */
    address?: string;
  }[];
  additionalInfo: string[];
  languages: string[];
  /** Optional structured "Good to know" content extracted from Holibob's
      product-level fields and content list. Each entry is a labeled chunk
      (e.g. label: "Best time to visit", body: "April–September"). */
  goodToKnow: {
    label: string;
    body: string;
  }[];
  /** Optional rendered content sections (e.g. Meeting point, Safety,
      Requirements). Sourced from contentList content types we recognise.
      Sorted by Holibob's ordinalPosition where available. */
  contentSections: {
    type: string;
    /** Holibob's translated label for the type, falling back to a humanised
        version of the enum value. */
    label: string;
    /** Optional title for the section content (e.g. specific meeting point name). */
    name?: string;
    body: string;
  }[];
  /** Provider/supplier info - used for dynamic indexing rules */
  provider?: {
    id: string;
    name: string;
  };
  /** End place when the tour ends somewhere different from the start */
  endLocation?: {
    name: string;
    address: string;
    lat: number;
    lng: number;
  };
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
  /** Provider/operator name for trust display on cards */
  providerName?: string;
  /** Top 2-3 inclusions for "What's Included" preview on cards */
  topInclusions?: string[];
  /** Category names for occasion tag derivation */
  categories?: string[];
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
  // Extended product-level content (Holibob fills these inconsistently)
  abstract?: string | null;
  bestTimeToVisit?: string | null;
  difficultyLevel?: string | null;
  cultureShockLevel?: string | null;
  dressAdvice?: string | null;
  tippingAdvice?: string | null;
  maxGroupSize?: string | null;
  isPickupAvailable?: boolean | null;
  bookingCutoffDuration?: string | null;
  advanceArrivalDuration?: string | null;
  priceType?: string | null;
  minDuration?: number | string | null;
  // Image fields - different formats from different API endpoints
  primaryImage?: { url?: string };
  primaryImageUrl?: string; // Product Discovery API
  imageUrl?: string;
  images?: { url?: string }[];
  imageList?: { id?: string; url?: string; altText?: string }[]; // Product Detail API - direct array
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
  // Duration fields - can be number, ISO 8601 string, or object
  duration?:
    | number
    | string
    | {
        value?: number;
        unit?: string;
      };
  maxDuration?: number | string; // Product Discovery API - can be ISO 8601 duration string
  durationText?: string;
  // Review/rating fields
  reviews?: {
    averageRating?: number;
    totalCount?: number;
  };
  rating?: number;
  reviewRating?: number; // Product Discovery/Detail API
  reviewCount?: number; // Product Discovery/Detail API
  // Location - different formats
  location?: {
    name?: string;
    address?: string;
    coordinates?: { lat?: number; lng?: number };
    lat?: number;
    lng?: number;
  };
  place?: {
    id?: string;
    name?: string;
    address?: string;
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
  };
  // Categories/Tags - different formats
  categories?: {
    id?: string;
    name?: string;
    slug?: string;
  }[];
  categoryList?: { nodes: { id?: string; name?: string; slug?: string }[] };
  // Content - different formats
  highlights?: string[];
  // inclusions/exclusions can be string[] or {text: string}[]
  inclusions?: string[] | { text?: string }[];
  exclusions?: string[] | { text?: string }[];
  importantInfo?: string[];
  // additionList has nested structure with nodes
  additionList?: { nodes?: { text?: string }[] } | string[];
  // contentList from Product Detail API - contains typed content items
  // Types: INCLUSION, EXCLUSION, HIGHLIGHT, NOTE, MEETING_POINT, REQUIREMENT,
  // SAFETY_MEASURE, KNOW_BEFORE_YOU_GO, etc.
  // Itinerary is NOT in contentList — see `itinerary` field below.
  contentList?: {
    nodes?: {
      type?: string;
      typeLabel?: string | null;
      ordinalPosition?: number | null;
      name?: string;
      description?: string;
    }[];
  };
  // Itinerary from Product Detail API — separate field with structured stops.
  itinerary?: {
    itemList?: {
      nodes?: {
        id?: string;
        name?: string;
        description?: { text?: string } | null;
        extraInformation?: {
          day?: number | null;
          passByWithoutStopping?: boolean | null;
          isAdmissionIncluded?: boolean | null;
        } | null;
        place?: {
          name?: string | null;
          formattedAddress?: string | null;
        } | null;
      }[];
    };
  } | null;
  // Guide languages from Product Detail API
  guideLanguageList?: {
    nodes?: {
      id?: string;
      name?: string;
    }[];
  };
  // Cancellation policy - can be string or object with description and/or penaltyList
  cancellationPolicy?:
    | {
        type?: string;
        description?: string;
        isCancellable?: boolean | null;
        hasFreeCancellation?: boolean | null;
        penaltyList?: { nodes?: { formattedText?: string }[] };
      }
    | string;
  // Start place with geo-coordinates and address
  startPlace?: {
    timeZone?: string;
    geoCoordinate?: {
      latitude?: number;
      longitude?: number;
    };
    googlePlaceId?: string;
    formattedAddress?: string;
    mapImageUrl?: string;
  };
  // End place — set when the tour ends somewhere different from the start
  endPlace?: {
    timeZone?: string;
    geoCoordinate?: {
      latitude?: number;
      longitude?: number;
    };
    googlePlaceId?: string;
    formattedAddress?: string;
    mapImageUrl?: string;
  } | null;
  // Provider/supplier info
  provider?: {
    id?: string;
    name?: string;
  };
  supplierId?: string;
  supplierName?: string;
  // Review list from Product Detail API
  reviewList?: {
    recordCount?: number;
    nodes?: {
      id?: string;
      title?: string;
      content?: string;
      rating?: number;
      authorName?: string;
      publishedDate?: string;
      imageList?: {
        nodes?: {
          url?: string;
        }[];
      };
    }[];
  };
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
    priceAmount > 0
      ? (product.guidePriceFormattedText ??
        product.priceFromFormatted ??
        formatPrice(priceAmount, currency))
      : 'Check price';

  // Handle duration as either number, ISO 8601 string, or object
  // Product Discovery API uses maxDuration which can be ISO 8601 format (e.g., "PT210M")
  let durationValue: number;
  let durationUnit: string;
  if (product.maxDuration != null) {
    // maxDuration can be a number or ISO 8601 duration string
    durationValue = parseIsoDuration(product.maxDuration);
    durationUnit = 'minutes';
  } else if (typeof product.duration === 'number') {
    durationValue = product.duration;
    durationUnit = 'minutes';
  } else if (typeof product.duration === 'string') {
    // Duration might be ISO 8601 string
    durationValue = parseIsoDuration(product.duration);
    durationUnit = 'minutes';
  } else {
    durationValue = product.duration?.value ?? 0;
    durationUnit = product.duration?.unit ?? 'hours';
  }

  // Handle rating - may not be available from all API responses
  // Product Discovery/Detail API uses reviewRating and reviewCount
  let ratingValue = product.reviewRating ?? product.reviews?.averageRating ?? product.rating;
  let reviewCount = product.reviewCount ?? product.reviews?.totalCount ?? 0;

  // Fallback: if no aggregate rating but individual reviews exist, compute from reviewList.nodes
  if (ratingValue == null && product.reviewList?.nodes && product.reviewList.nodes.length > 0) {
    const validReviews = product.reviewList.nodes.filter((r) => r.rating != null && r.rating > 0);
    if (validReviews.length > 0) {
      ratingValue = validReviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / validReviews.length;
      reviewCount = validReviews.length;
    }
  }

  // Handle cancellation policy - can be string or object with description and/or penaltyList
  let cancellationPolicy = '';
  if (typeof product.cancellationPolicy === 'string') {
    cancellationPolicy = product.cancellationPolicy;
  } else if (product.cancellationPolicy) {
    // Try penaltyList first (newer API format with formatted text)
    if (
      product.cancellationPolicy.penaltyList?.nodes &&
      product.cancellationPolicy.penaltyList.nodes.length > 0
    ) {
      const policyTexts = product.cancellationPolicy.penaltyList.nodes
        .map((n) => n.formattedText || '')
        .filter(Boolean);
      cancellationPolicy = policyTexts.join('\n');
    } else if (product.cancellationPolicy.description) {
      // Fall back to description if no penalty list
      cancellationPolicy = product.cancellationPolicy.description;
    }
  }

  // Handle images from different API formats
  // Product Detail API: imageList.nodes[].url
  // Other formats: images[].url or primaryImage.url
  const imageListUrls = product.imageList?.map((img) => img.url ?? '').filter(Boolean) ?? [];
  const legacyImageUrls = product.images?.map((img) => img.url ?? '').filter(Boolean) ?? [];
  const allImages = imageListUrls.length > 0 ? imageListUrls : legacyImageUrls;

  // Primary image URL - optimize for card display (400x267px, quality 75)
  const rawPrimaryImageUrl =
    allImages[0] ??
    product.primaryImage?.url ??
    product.primaryImageUrl ??
    product.imageUrl ??
    '/placeholder-experience.jpg';

  const primaryImageUrl = optimizeHolibobImageWithPreset(rawPrimaryImageUrl, 'card');

  // Handle categories from different API formats
  // categoryList.nodes[] or categories[]
  const categoryListNodes = product.categoryList?.nodes ?? [];
  const legacyCategories = product.categories ?? [];
  const allCategories = categoryListNodes.length > 0 ? categoryListNodes : legacyCategories;

  // Handle content lists from Product Detail API
  // contentList contains typed content items with type, name, description
  // Types: INCLUSION, EXCLUSION, HIGHLIGHT, MEETING_POINT, ITINERARY, etc.
  const contentNodes = product.contentList?.nodes ?? [];

  // Extract highlights from contentList (HIGHLIGHT type) or fall back to other sources
  let highlights: string[] = [];
  const highlightNodes = contentNodes.filter((n) => n.type === 'HIGHLIGHT');
  if (highlightNodes.length > 0) {
    highlights = highlightNodes.map((n) => n.name || n.description || '').filter(Boolean);
  } else if (product.additionList) {
    if (Array.isArray(product.additionList)) {
      highlights = product.additionList as string[];
    } else if (product.additionList.nodes) {
      highlights = product.additionList.nodes.map((n) => n.text ?? '').filter(Boolean);
    }
  } else if (product.highlights) {
    highlights = product.highlights;
  }

  // Extract inclusions from contentList (INCLUSION type) or fall back to other sources
  let inclusions: string[] = [];
  const inclusionNodes = contentNodes.filter((n) => n.type === 'INCLUSION');
  if (inclusionNodes.length > 0) {
    inclusions = inclusionNodes.map((n) => n.name || n.description || '').filter(Boolean);
  } else if (product.inclusions) {
    if (typeof product.inclusions[0] === 'string') {
      inclusions = product.inclusions as string[];
    } else {
      inclusions = (product.inclusions as { text?: string }[])
        .map((i) => i.text ?? '')
        .filter(Boolean);
    }
  }

  // Extract exclusions from contentList (EXCLUSION type) or fall back to other sources
  let exclusions: string[] = [];
  const exclusionNodes = contentNodes.filter((n) => n.type === 'EXCLUSION');
  if (exclusionNodes.length > 0) {
    exclusions = exclusionNodes.map((n) => n.name || n.description || '').filter(Boolean);
  } else if (product.exclusions) {
    if (typeof product.exclusions[0] === 'string') {
      exclusions = product.exclusions as string[];
    } else {
      exclusions = (product.exclusions as { text?: string }[])
        .map((e) => e.text ?? '')
        .filter(Boolean);
    }
  }

  // Extract cancellation policy from contentList if available
  const cancellationNodes = contentNodes.filter((n) => n.type === 'CANCELLATION_POLICY');
  if (cancellationNodes.length > 0 && !cancellationPolicy) {
    cancellationPolicy = cancellationNodes
      .map((n) => n.description || n.name || '')
      .filter(Boolean)
      .join(' ');
  }

  // Extract itinerary from the dedicated `itinerary.itemList.nodes` field.
  // Each stop carries its own location name, "(Pass By)" flag, address, and
  // an HBML description (we read .text). The legacy contentList ITINERARY
  // path was missing the location name on most products, leaving the section
  // showing four numbered "View from cruise" lines — see the schema notes in
  // packages/holibob-api/src/queries/index.ts.
  const itineraryNodes = product.itinerary?.itemList?.nodes ?? [];
  const itinerary = itineraryNodes
    .map((n) => {
      const locationName = n.name || n.place?.name || '';
      const description = n.description?.text || '';
      return {
        name: locationName,
        description,
        isPassBy: !!n.extraInformation?.passByWithoutStopping,
        ...(n.extraInformation?.isAdmissionIncluded != null && {
          isAdmissionIncluded: n.extraInformation.isAdmissionIncluded,
        }),
        ...(n.extraInformation?.day != null && { day: n.extraInformation.day }),
        ...(n.place?.formattedAddress && { address: n.place.formattedAddress }),
      };
    })
    .filter((item) => item.name || item.description);

  // Extract additional information from contentList. NOTE has historically
  // been the catch-all bucket; KNOW_BEFORE_YOU_GO carries the same kind of
  // free-form pre-trip info on newer products. Treat both the same way.
  const additionalInfoNodes = contentNodes.filter(
    (n) => n.type === 'NOTE' || n.type === 'KNOW_BEFORE_YOU_GO'
  );
  const additionalInfo = additionalInfoNodes
    .map((n) => n.description || n.name || '')
    .filter(Boolean);

  // Build the structured "Good to know" block from the product-level fields
  // Holibob fills inconsistently — we emit only entries that have a value so
  // empty rows never show. ISO 8601 durations are humanised for display.
  const goodToKnow: { label: string; body: string }[] = [];
  const pushGtk = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) goodToKnow.push({ label, body: value.trim() });
  };
  pushGtk('Best time to visit', product.bestTimeToVisit);
  pushGtk('Difficulty', product.difficultyLevel);
  pushGtk('Culture shock', product.cultureShockLevel);
  pushGtk('Dress advice', product.dressAdvice);
  pushGtk('Tipping advice', product.tippingAdvice);
  pushGtk('Max group size', product.maxGroupSize);
  if (product.isPickupAvailable) {
    goodToKnow.push({ label: 'Pickup', body: 'Pickup available — confirm at booking' });
  }
  if (product.bookingCutoffDuration) {
    const minutes = parseIsoDuration(product.bookingCutoffDuration);
    if (minutes > 0) {
      const hours = Math.round(minutes / 60);
      goodToKnow.push({
        label: 'Booking cutoff',
        body: `Book at least ${hours >= 24 ? `${Math.round(hours / 24)} day${hours >= 48 ? 's' : ''}` : `${hours} hour${hours !== 1 ? 's' : ''}`} ahead`,
      });
    }
  }
  if (product.advanceArrivalDuration) {
    const minutes = parseIsoDuration(product.advanceArrivalDuration);
    if (minutes > 0) {
      goodToKnow.push({
        label: 'Arrival',
        body: `Arrive ${minutes} minutes before start time`,
      });
    }
  }

  // Surface other recognised content types as labelled sections, sorted by
  // Holibob's ordinalPosition so they render in the supplier's intended order.
  // These are the types we display today; the full enum has 30 values but most
  // are admin/structural. Itinerary/Inclusion/Exclusion/Highlight/Note are
  // handled separately above.
  const sectionTypes = new Set([
    'MEETING_POINT',
    'STARTING_POINT',
    'FINISHING_POINT',
    'OPENING_HOURS',
    'REQUIREMENT',
    'SAFETY_MEASURE',
    'TIMING_NOTE',
    'PRE_ARRIVAL_INSTRUCTIONS',
    'VOUCHER_NOTE',
    'VENUE',
  ]);
  const humaniseType = (t: string): string =>
    t
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const contentSections = contentNodes
    .filter((n) => n.type && sectionTypes.has(n.type))
    .map((n) => ({
      type: n.type ?? '',
      label: n.typeLabel || humaniseType(n.type ?? ''),
      ...(n.name ? { name: n.name } : {}),
      body: n.description || '',
      _ord: n.ordinalPosition ?? Number.MAX_SAFE_INTEGER,
    }))
    .filter((s) => s.body || s.name)
    .sort((a, b) => a._ord - b._ord)
    .map(({ _ord: _ord, ...s }) => s);

  // Free cancellation flag — prefer Holibob's structured boolean. Falls back
  // to a substring check on the policy text for older products that only
  // populate the description.
  const hasFreeCancellationFlag =
    typeof product.cancellationPolicy === 'object' &&
    product.cancellationPolicy?.hasFreeCancellation === true
      ? true
      : /free cancellation|full refund/i.test(cancellationPolicy);

  // End place — only set if Holibob explicitly provides one (most tours
  // start and end at the same place, in which case endPlace is null).
  const endLocation = product.endPlace?.formattedAddress
    ? {
        name: '',
        address: product.endPlace.formattedAddress ?? '',
        lat: product.endPlace.geoCoordinate?.latitude ?? 0,
        lng: product.endPlace.geoCoordinate?.longitude ?? 0,
      }
    : undefined;

  // Extract guide languages from guideLanguageList
  const languages =
    product.guideLanguageList?.nodes?.map((lang) => lang.name || '').filter(Boolean) ?? [];

  return {
    id: product.id,
    title: product.title ?? product.name ?? 'Untitled Experience',
    slug: product.slug ?? product.id,
    // Prefer Holibob's `abstract` (curated short summary) when present, then
    // the discovery-API `shortDescription`, then a clipped form of the full
    // description as a last resort.
    shortDescription:
      product.abstract?.trim() ||
      product.shortDescription ||
      (product.description ? product.description.slice(0, 200) : ''),
    description: product.description ?? '',
    imageUrl: primaryImageUrl,
    images:
      allImages.length > 0
        ? allImages.map((img) => optimizeHolibobImageWithPreset(img, 'galleryMain'))
        : primaryImageUrl === '/placeholder-experience.jpg'
          ? []
          : [primaryImageUrl],
    lightboxImages:
      allImages.length > 0
        ? allImages.map((img) => optimizeHolibobImageWithPreset(img, 'lightbox'))
        : primaryImageUrl === '/placeholder-experience.jpg'
          ? []
          : [primaryImageUrl],
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
      name: product.place?.name ?? product.place?.city ?? product.location?.name ?? '',
      // Try startPlace first (from Product Detail API), then fall back to other sources
      address:
        product.startPlace?.formattedAddress ??
        product.place?.address ??
        product.location?.address ??
        '',
      lat:
        product.startPlace?.geoCoordinate?.latitude ??
        product.place?.latitude ??
        product.place?.lat ??
        product.location?.coordinates?.lat ??
        product.location?.lat ??
        0,
      lng:
        product.startPlace?.geoCoordinate?.longitude ??
        product.place?.longitude ??
        product.place?.lng ??
        product.location?.coordinates?.lng ??
        product.location?.lng ??
        0,
      mapImageUrl: product.startPlace?.mapImageUrl,
    },
    reviews: (product.reviewList?.nodes ?? []).map((review) => ({
      id: review.id ?? '',
      title: review.title ?? '',
      content: review.content ?? '',
      rating: review.rating ?? 0,
      authorName: review.authorName ?? 'Anonymous',
      publishedDate: review.publishedDate ?? '',
      images: review.imageList?.nodes?.map((img) => img.url ?? '').filter(Boolean) ?? [],
    })),
    categories: allCategories.map((cat) => ({
      id: cat.id ?? '',
      name: cat.name ?? '',
      slug: (cat as { slug?: string }).slug ?? cat.id ?? '',
    })),
    highlights,
    inclusions,
    exclusions,
    cancellationPolicy,
    hasFreeCancellation: hasFreeCancellationFlag,
    itinerary,
    additionalInfo,
    languages,
    goodToKnow,
    contentSections,
    ...(endLocation ? { endLocation } : {}),
    // Provider/supplier info - used for dynamic indexing rules
    provider: product.provider?.id
      ? {
          id: product.provider.id,
          name: product.provider.name ?? product.supplierName ?? '',
        }
      : product.supplierId
        ? {
            id: product.supplierId,
            name: product.supplierName ?? '',
          }
        : undefined,
  };
}

/**
 * Format price for display
 */
export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat(currencyToLocale(currency), {
    style: 'currency',
    currency,
  }).format(amount); // guidePrice and priceFrom are in major units (e.g., 43 = £43)
}

/**
 * Parse ISO 8601 duration string (e.g., "PT210M", "PT3H30M", "P1D")
 * Returns total minutes
 */
export function parseIsoDuration(duration: string | number | null | undefined): number {
  if (duration == null) return 0;
  if (typeof duration === 'number') return duration;

  const str = String(duration).toUpperCase();

  // Match ISO 8601 duration format
  const match = str.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) {
    // Not ISO 8601 format, try parsing as number
    const num = parseInt(str, 10);
    return isNaN(num) ? 0 : num;
  }

  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10);
  const minutes = parseInt(match[3] || '0', 10);
  // Ignore seconds for display purposes

  return days * 24 * 60 + hours * 60 + minutes;
}

/**
 * Format duration for display
 */
export function formatDuration(value: number, unit: string): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }
  if (unit === 'minutes') {
    if (value >= 60) {
      const hours = Math.floor(value / 60);
      const mins = value % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    return `${value} min`;
  }
  if (unit === 'hours') {
    return value === 1 ? '1 hour' : `${value} hours`;
  }
  if (unit === 'days') {
    return value === 1 ? '1 day' : `${value} days`;
  }
  return `${value} ${unit}`;
}

/**
 * Optimize Holibob image URL by adding resize and quality parameters
 * Holibob CDN (images.holibob.tech) supports base64-encoded JSON parameters
 * for dynamic image transformation (resize, crop, format, quality, etc.)
 *
 * @param url - Original image URL from Holibob API
 * @param width - Target width in pixels
 * @param height - Target height in pixels
 * @param quality - JPEG/WebP quality (1-100), default 80
 * @returns Optimized URL with resize parameters, or original URL if transformation fails
 */
export function optimizeHolibobImageUrl(
  url: string,
  width: number,
  height: number,
  quality: number = 80
): string {
  // Only transform images.holibob.tech URLs
  if (!url || !url.includes('images.holibob.tech')) {
    return url;
  }

  try {
    // Extract the base64 token from the URL
    const urlParts = url.split('/');
    const token = urlParts[urlParts.length - 1];

    if (!token) {
      return url;
    }

    // Decode the existing parameters
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));

    // Add resize and quality parameters (following Holibob Hub's approach)
    decoded.edits = {
      ...(decoded.edits || {}),
      resize: {
        width,
        height,
        fit: 'cover',
      },
      // Quality parameter for JPEG/WebP compression
      jpeg: { quality },
      webp: { quality },
    };

    // Re-encode and return the optimized URL
    const newToken = Buffer.from(JSON.stringify(decoded)).toString('base64');
    return `https://images.holibob.tech/${newToken}`;
  } catch (error) {
    // If transformation fails, return original URL
    console.warn(
      '[Holibob Image] Failed to optimize URL:',
      error instanceof Error ? error.message : error
    );
    return url;
  }
}

/**
 * Optimize Holibob image URL using a preset
 * Convenience wrapper that uses predefined size/quality combinations
 */
export function optimizeHolibobImageWithPreset(
  url: string,
  preset: keyof typeof IMAGE_PRESETS
): string {
  const { width, height, quality } = IMAGE_PRESETS[preset];
  return optimizeHolibobImageUrl(url, width, height, quality);
}
