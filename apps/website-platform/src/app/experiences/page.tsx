import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteFromHostname, type SiteConfig } from '@/lib/tenant';
import { getHolibobClient, type ExperienceListItem, parseIsoDuration } from '@/lib/holibob';
import { ExperiencesGrid } from '@/components/experiences/ExperiencesGrid';
import { ProductDiscoverySearch } from '@/components/search/ProductDiscoverySearch';
import { TrustBadges } from '@/components/ui/TrustSignals';
import { ExperienceListSchema, BreadcrumbSchema } from '@/components/seo/StructuredData';
import { prisma } from '@/lib/prisma';
import { MarketplaceFilteredPage } from '@/components/experiences/MarketplaceFilteredPage';
import type { FilterOptions } from '@/components/experiences/FilterSidebar';
import type { FilterCounts } from '@/hooks/useMarketplaceExperiences';
import { isTickittoSite } from '@/lib/supplier';
import { getTickittoClient, mapTickittoEventToExperienceListItem } from '@/lib/tickitto';

interface SearchParams {
  [key: string]: string | undefined;
  location?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  adults?: string;
  children?: string;
  q?: string;
  page?: string;
  when?: string;
  who?: string;
  // Filter params for microsites
  categories?: string;
  priceMin?: string;
  priceMax?: string;
  duration?: string;
  minRating?: string;
  cities?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);
  const resolvedParams = await searchParams;

  const destination = resolvedParams.destination || resolvedParams.location;
  const searchQuery = resolvedParams.q;
  const isMicrosite =
    !!site.micrositeContext?.supplierId ||
    !!site.micrositeContext?.discoveryConfig ||
    isTickittoSite(site);

  let title: string;
  let description: string;

  // For microsites, build rich title/description from site data
  if (isMicrosite) {
    const ctx = site.micrositeContext;
    const categories =
      ctx?.supplierCategories ?? site.homepageConfig?.categories?.map((c) => c.name) ?? [];
    const cities =
      ctx?.supplierCities ?? site.homepageConfig?.destinations?.map((d) => d.name) ?? [];
    const count = ctx?.cachedProductCount ?? 0;

    // Use URL filter params when present (e.g. ?cities=London) — these override DB defaults
    const urlCities = resolvedParams.cities?.split(',').filter(Boolean) ?? [];
    const urlCategories = resolvedParams.categories?.split(',').filter(Boolean) ?? [];
    const topCategory = urlCategories[0] ?? categories[0];
    const topCity =
      urlCities.length === 1
        ? urlCities[0]
        : urlCities.length > 1
          ? undefined // Multiple cities — use generic title
          : cities[0];

    // Build specific title from site data
    if (topCategory && topCity) {
      title = `${topCategory} in ${topCity}`;
    } else if (topCategory) {
      title = `${topCategory} & Experiences`;
    } else if (topCity) {
      title = `Things to Do in ${topCity}`;
    } else {
      title = 'All Experiences & Tours';
    }

    // Build rich description with trust signals
    const descParts: string[] = [];
    if (count > 0 && topCity) {
      descParts.push(
        `Browse ${count}+ ${topCategory?.toLowerCase() ?? 'experiences'} in ${topCity}.`
      );
    } else if (count > 0) {
      descParts.push(`Browse ${count}+ experiences and tours.`);
    } else if (topCity) {
      descParts.push(
        `Browse the best ${topCategory?.toLowerCase() ?? 'experiences'} in ${topCity}.`
      );
    } else {
      descParts.push(`Browse our full collection of experiences and tours.`);
    }
    if (categories.length > 1) {
      descParts.push(`Including ${categories.slice(0, 3).join(', ')}.`);
    }
    descParts.push('Free cancellation, instant confirmation & e-tickets. Book online today!');
    description = descParts.join(' ');
  } else if (searchQuery) {
    title = `${searchQuery} - ${destination || 'Experiences'}`;
    description = `Find the best ${searchQuery.toLowerCase()} experiences. ${destination ? `Tours and activities in ${destination}. ` : ''}Free cancellation, instant confirmation. Book online today!`;
  } else if (destination) {
    title = `Things to Do in ${destination}`;
    description = `Discover the best tours, activities, and experiences in ${destination}. Free cancellation, instant confirmation. Book online today!`;
  } else {
    title = 'Experiences & Tours';
    description = `Browse and book unique experiences, tours, and activities. Free cancellation, instant confirmation. Book online today!`;
  }

  // Trim description to ~160 chars
  if (description.length > 160) {
    description = description.substring(0, 157).replace(/\s+\S*$/, '') + '...';
  }

  // Build canonical URL with SEO-relevant parameters
  const baseUrl = `https://${site.primaryDomain || hostname}/experiences`;
  const canonicalParams = new URLSearchParams();

  if (destination) {
    canonicalParams.set('destination', destination);
  }
  if (searchQuery) {
    canonicalParams.set('q', searchQuery);
  }
  // For microsites, include city/category filters in canonical (distinct PPC landing pages)
  if (isMicrosite && resolvedParams.cities) {
    canonicalParams.set('cities', resolvedParams.cities);
  }
  if (isMicrosite && resolvedParams.categories) {
    canonicalParams.set('categories', resolvedParams.categories);
  }
  const pageNum = parseInt(resolvedParams.page ?? '1', 10);
  if (pageNum > 1) {
    canonicalParams.set('page', String(pageNum));
  }

  const canonicalUrl = canonicalParams.toString()
    ? `${baseUrl}?${canonicalParams.toString()}`
    : baseUrl;

  // OG image fallback chain
  const ogImage = site.brand?.ogImageUrl || site.homepageConfig?.hero?.backgroundImage;

  return {
    // Don't append site.name — the layout title template already adds it
    title,
    description,
    openGraph: {
      title: `${title} | ${site.name}`,
      description,
      type: 'website',
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${site.name}`,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

// Revalidate every 5 minutes for fresh content
export const revalidate = 300;

const ITEMS_PER_PAGE = 12;

async function getExperiences(
  site: SiteConfig,
  searchParams: SearchParams
): Promise<{
  experiences: ExperienceListItem[];
  totalCount: number;
  filteredCount: number;
  hasMore: boolean;
  isUsingMockData: boolean;
  apiError?: string;
  recommendedTags?: { id: string; name: string }[];
  recommendedSearchTerms?: string[];
}> {
  const page = parseInt(searchParams.page ?? '1', 10);
  const offset = (page - 1) * ITEMS_PER_PAGE;

  // For Tickitto microsites, fetch from Tickitto API
  if (isTickittoSite(site)) {
    return getExperiencesFromTickitto(searchParams, page, offset);
  }

  // For microsites (operator-specific), fetch from Holibob API or local database
  if (site.micrositeContext?.supplierId) {
    // Parse filter params
    const filters: LocalDBFilters = {
      categories: searchParams.categories?.split(',').filter(Boolean),
      priceMin: searchParams.priceMin ? parseFloat(searchParams.priceMin) : undefined,
      priceMax: searchParams.priceMax ? parseFloat(searchParams.priceMax) : undefined,
      duration: searchParams.duration,
      minRating: searchParams.minRating ? parseFloat(searchParams.minRating) : undefined,
      cities: searchParams.cities?.split(',').filter(Boolean),
    };

    // First try local database
    const localResult = await getExperiencesFromLocalDB(site.micrositeContext.supplierId, {
      offset,
      filters,
    });

    // If we have local products, use them
    if (localResult.totalCount > 0) {
      return localResult;
    }

    // Fallback to Holibob API when no local products exist
    // This is common for suppliers whose products haven't been synced yet
    if (site.micrositeContext.holibobSupplierId) {
      console.log(
        `[Experiences] No local products for supplier ${site.micrositeContext.supplierId}, using Holibob API`
      );
      return getExperiencesFromHolibobAPI(site, site.micrositeContext.holibobSupplierId, {
        page,
        filters,
        cachedProductCount: site.micrositeContext.cachedProductCount,
      });
    }

    return localResult;
  }

  // For main site, use Holibob Product Discovery API
  try {
    const client = getHolibobClient(site);

    // Product Discovery API requires a location input (where.freeText, destinationId, circle, or boundingBox).
    // When no destination is provided in search params, fall back to the site's configured destination.
    const freeText =
      searchParams.destination ||
      searchParams.location ||
      site.homepageConfig?.popularExperiences?.destination ||
      site.homepageConfig?.destinations?.[0]?.name;

    // Product Discovery API filters: where (freeText), when (dates), who (travelers), what (searchTerm)
    // Note: Category/price filters are not supported by Product Discovery
    // For themed sites (e.g., harry-potter-tours.com), use the site's configured search terms
    // so the API returns relevant experiences, not just generic destination results.
    const searchTerm = searchParams.q || site.homepageConfig?.popularExperiences?.searchTerms?.[0];

    const response = await client.discoverProducts(
      {
        currency: 'GBP',
        freeText,
        searchTerm,
        adults: searchParams.adults ? parseInt(searchParams.adults, 10) : 2,
        children: searchParams.children ? parseInt(searchParams.children, 10) : undefined,
        dateFrom: searchParams.startDate,
        dateTo: searchParams.endDate,
      },
      { pageSize: ITEMS_PER_PAGE }
    );

    const experiences = response.products.map((product) => {
      // Get primary image from imageList (Product Detail API format - direct array)
      const primaryImage =
        product.imageList?.[0]?.url ?? product.imageUrl ?? '/placeholder-experience.jpg';

      // Get price - Product Detail API uses guidePrice, Product Discovery uses priceFrom
      const priceAmount = product.guidePrice ?? product.priceFrom ?? 0;
      const priceCurrency =
        product.guidePriceCurrency ?? product.priceCurrency ?? product.currency ?? 'GBP';
      const priceFormatted =
        product.guidePriceFormattedText ??
        product.priceFromFormatted ??
        formatPrice(priceAmount, priceCurrency);

      // Get duration - Product Discovery API returns maxDuration as ISO 8601 (e.g., "PT210M")
      // Product Detail API returns durationText as a string
      let durationFormatted = 'Duration varies';
      if (product.durationText) {
        durationFormatted = product.durationText;
      } else if (product.maxDuration != null) {
        // Parse ISO 8601 duration from Product Discovery API
        const minutes = parseIsoDuration(product.maxDuration);
        if (minutes > 0) {
          durationFormatted = formatDuration(minutes, 'minutes');
        }
      } else if (typeof product.duration === 'number' && product.duration > 0) {
        durationFormatted = formatDuration(product.duration, 'minutes');
      } else if (typeof product.duration === 'string') {
        const minutes = parseIsoDuration(product.duration);
        if (minutes > 0) {
          durationFormatted = formatDuration(minutes, 'minutes');
        }
      }

      return {
        id: product.id,
        title: product.name ?? 'Experience',
        slug: product.id,
        shortDescription: product.shortDescription ?? '',
        imageUrl: primaryImage,
        price: {
          amount: priceAmount,
          currency: priceCurrency,
          formatted: priceFormatted,
        },
        duration: {
          formatted: durationFormatted,
        },
        // Rating data from Holibob Product Discovery API
        rating: product.reviewRating
          ? {
              average: product.reviewRating,
              count: product.reviewCount ?? 0,
            }
          : null,
        location: {
          name: product.location?.name ?? '',
        },
        // Cancellation policy from Holibob API
        cancellationPolicy: product.cancellationPolicy
          ? {
              type: product.cancellationPolicy.type,
            }
          : undefined,
      };
    });

    // hasMore is true if we got a full page (likely more available)
    // Holibob doesn't return accurate pagination info, so we always show "See More"
    // if we have a reasonable number of products (the API will return empty when exhausted)
    const hasMore = experiences.length >= ITEMS_PER_PAGE;
    const totalCount = response.totalCount ?? experiences.length;

    return {
      experiences,
      totalCount,
      filteredCount: totalCount, // No filters for main site
      hasMore,
      isUsingMockData: false,
      // These will be populated when the API returns recommended data
      recommendedTags: undefined,
      recommendedSearchTerms: undefined,
    };
  } catch (error) {
    // Log detailed error info for debugging (no mock data fallback)
    console.error('Error fetching experiences:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      partnerId: site.holibobPartnerId,
      apiUrl: process.env['HOLIBOB_API_URL'] ?? 'not set',
      hasApiKey: !!process.env['HOLIBOB_API_KEY'],
      hasApiSecret: !!process.env['HOLIBOB_API_SECRET'],
    });
    // Return empty results with error - no mock data
    return {
      experiences: [],
      totalCount: 0,
      filteredCount: 0,
      hasMore: false,
      isUsingMockData: false,
      apiError: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface LocalDBFilters {
  categories?: string[];
  priceMin?: number;
  priceMax?: number;
  duration?: string;
  minRating?: number;
  cities?: string[];
}

/**
 * Fetch experiences from local database for operator microsites
 * Only shows products from the specific operator (supplier)
 * Supports filtering for MARKETPLACE layouts
 */
async function getExperiencesFromLocalDB(
  supplierId: string,
  options: { offset: number; filters?: LocalDBFilters }
): Promise<{
  experiences: ExperienceListItem[];
  totalCount: number;
  filteredCount: number;
  hasMore: boolean;
  isUsingMockData: boolean;
  apiError?: string;
}> {
  try {
    // Build where clause with filters using Prisma's ProductWhereInput type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = { supplierId };

    if (options.filters?.categories && options.filters.categories.length > 0) {
      // Products have categories as String[], filter if any category matches
      whereClause.categories = { hasSome: options.filters.categories };
    }

    if (options.filters?.priceMin != null || options.filters?.priceMax != null) {
      whereClause.priceFrom = {};
      if (options.filters.priceMin != null) {
        whereClause.priceFrom.gte = options.filters.priceMin;
      }
      if (options.filters.priceMax != null) {
        whereClause.priceFrom.lte = options.filters.priceMax;
      }
    }

    if (options.filters?.minRating != null) {
      whereClause.rating = { gte: options.filters.minRating };
    }

    if (options.filters?.cities && options.filters.cities.length > 0) {
      whereClause.city = { in: options.filters.cities };
    }

    // Duration filter - parse duration ranges
    if (options.filters?.duration) {
      const durationFilter = parseDurationFilter(options.filters.duration);
      if (durationFilter) {
        whereClause.duration = durationFilter;
      }
    }

    const [products, filteredCount, totalCount] = await Promise.all([
      prisma.product.findMany({
        where: whereClause,
        take: ITEMS_PER_PAGE,
        skip: options.offset,
        orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
        select: {
          id: true,
          holibobProductId: true,
          slug: true,
          title: true,
          shortDescription: true,
          primaryImageUrl: true,
          priceFrom: true,
          currency: true,
          duration: true,
          rating: true,
          reviewCount: true,
          city: true,
        },
      }),
      prisma.product.count({ where: whereClause }),
      prisma.product.count({ where: { supplierId } }), // Total without filters
    ]);

    const experiences: ExperienceListItem[] = products.map((product) => ({
      id: product.holibobProductId, // Use Holibob ID for booking links
      title: product.title,
      slug: product.slug,
      shortDescription: product.shortDescription ?? '',
      imageUrl: product.primaryImageUrl ?? '/placeholder-experience.jpg',
      price: {
        amount: product.priceFrom ? Number(product.priceFrom) : 0,
        currency: product.currency,
        formatted: formatPrice(product.priceFrom ? Number(product.priceFrom) : 0, product.currency),
      },
      duration: {
        formatted: product.duration ?? 'Duration varies',
      },
      rating: product.rating
        ? {
            average: product.rating,
            count: product.reviewCount,
          }
        : null,
      location: {
        name: product.city ?? '',
      },
    }));

    return {
      experiences,
      totalCount,
      filteredCount,
      hasMore: options.offset + ITEMS_PER_PAGE < filteredCount,
      isUsingMockData: false,
    };
  } catch (error) {
    console.error('Error fetching experiences from local DB:', error);
    return {
      experiences: [],
      totalCount: 0,
      filteredCount: 0,
      hasMore: false,
      isUsingMockData: false,
      apiError: error instanceof Error ? error.message : 'Database error',
    };
  }
}

/**
 * Fetch experiences from Holibob API for microsites
 * Used when local products haven't been synced yet
 */
async function getExperiencesFromHolibobAPI(
  site: SiteConfig,
  holibobSupplierId: string,
  options: { page: number; filters?: LocalDBFilters; cachedProductCount?: number }
): Promise<{
  experiences: ExperienceListItem[];
  totalCount: number;
  filteredCount: number;
  hasMore: boolean;
  isUsingMockData: boolean;
  apiError?: string;
  isApproximate?: boolean;
}> {
  try {
    const client = getHolibobClient(site);
    const hasFilters =
      options.filters &&
      ((options.filters.categories && options.filters.categories.length > 0) ||
        options.filters.priceMin != null ||
        options.filters.priceMax != null ||
        options.filters.duration ||
        options.filters.minRating != null ||
        (options.filters.cities && options.filters.cities.length > 0));

    // When filters are applied, we need to fetch more products for client-side filtering
    // When no filters, use true server-side pagination for efficiency
    const pageSize = hasFilters ? 500 : ITEMS_PER_PAGE;
    const page = hasFilters ? 1 : options.page;

    const response = await client.getProductsByProvider(holibobSupplierId, {
      pageSize,
      page,
      filters: {
        placeName: options.filters?.cities?.[0],
        // Note: categories from URL are names (e.g. "Watersports"), not IDs.
        // Holibob API expects categoryIds (UUIDs). Client-side filtering handles category names.
      },
    });

    // Map Holibob products to ExperienceListItem format
    let experiences: ExperienceListItem[] = response.nodes.map((product) => {
      const primaryImage = product.imageList?.[0]?.url ?? '/placeholder-experience.jpg';

      // ProductList API returns guidePrice in MAJOR units (e.g., 71 EUR, not cents)
      const priceAmount = product.guidePrice ?? 0;
      const priceCurrency = product.guidePriceCurrency ?? 'GBP';
      const priceFormatted =
        product.guidePriceFormattedText ??
        new Intl.NumberFormat('en-GB', { style: 'currency', currency: priceCurrency }).format(
          priceAmount
        );

      // Parse ISO 8601 duration
      let durationFormatted = 'Duration varies';
      if (product.maxDuration != null) {
        const minutes = parseIsoDuration(product.maxDuration);
        if (minutes > 0) {
          durationFormatted = formatDuration(minutes, 'minutes');
        }
      }

      // Get location name: use city filter value when filtering (API doesn't return place.name),
      // otherwise empty (no regression from previous behavior)
      const locationName = options.filters?.cities?.[0] ?? '';

      return {
        id: product.id,
        title: product.name ?? 'Experience',
        slug: product.id,
        shortDescription: product.description?.slice(0, 200) ?? '',
        imageUrl: primaryImage,
        price: {
          amount: priceAmount,
          currency: priceCurrency,
          formatted: priceFormatted,
        },
        duration: {
          formatted: durationFormatted,
        },
        rating: product.reviewRating
          ? {
              average: product.reviewRating,
              count: product.reviewCount ?? 0,
            }
          : null,
        location: {
          name: locationName,
        },
      };
    });

    // Use cached product count from database (accurate per-supplier count)
    // Fall back to recordCount from API response (NOT unfilteredRecordCount which is ALL products across all providers)
    const totalCount = options.cachedProductCount ?? response.recordCount ?? experiences.length;
    let filteredCount = totalCount;
    let hasMore: boolean;
    let isApproximate = false;

    if (hasFilters) {
      // Apply client-side filtering when filters are active
      experiences = applyClientSideFilters(experiences, options.filters!);
      filteredCount = experiences.length;
      isApproximate = totalCount > 500; // Filters are approximate if we didn't fetch all products

      // Sort by rating (highest first)
      experiences.sort((a, b) => {
        const ratingA = a.rating?.average ?? 0;
        const ratingB = b.rating?.average ?? 0;
        return ratingB - ratingA;
      });

      // Apply client-side pagination for filtered results
      const startIndex = (options.page - 1) * ITEMS_PER_PAGE;
      experiences = experiences.slice(startIndex, startIndex + ITEMS_PER_PAGE);
      hasMore = startIndex + ITEMS_PER_PAGE < filteredCount;
    } else {
      // No filters - API already returned the correct page
      // Sort by rating (highest first)
      experiences.sort((a, b) => {
        const ratingA = a.rating?.average ?? 0;
        const ratingB = b.rating?.average ?? 0;
        return ratingB - ratingA;
      });
      hasMore = response.nextPage != null;
    }

    return {
      experiences,
      totalCount,
      filteredCount,
      hasMore,
      isUsingMockData: false,
      isApproximate,
    };
  } catch (error) {
    console.error('Error fetching experiences from Holibob API:', error);
    return {
      experiences: [],
      totalCount: 0,
      filteredCount: 0,
      hasMore: false,
      isUsingMockData: false,
      apiError: error instanceof Error ? error.message : 'API error',
    };
  }
}

/**
 * Fetch experiences from Tickitto API
 * Used for microsites with supplierType=TICKITTO
 */
async function getExperiencesFromTickitto(
  searchParams: SearchParams,
  page: number,
  offset: number
): Promise<{
  experiences: ExperienceListItem[];
  totalCount: number;
  filteredCount: number;
  hasMore: boolean;
  isUsingMockData: boolean;
  apiError?: string;
}> {
  try {
    const client = getTickittoClient();

    const result = await client.searchEvents({
      text: searchParams.q ?? undefined,
      category: searchParams.categories?.split(',').filter(Boolean),
      city: searchParams.cities?.split(',').filter(Boolean),
      currency: 'GBP',
      skip: offset,
      limit: ITEMS_PER_PAGE,
    });

    const experiences = result.events.map(mapTickittoEventToExperienceListItem);

    return {
      experiences,
      totalCount: result.totalCount,
      filteredCount: result.totalCount,
      hasMore: offset + ITEMS_PER_PAGE < result.totalCount,
      isUsingMockData: false,
    };
  } catch (error) {
    console.error('Error fetching experiences from Tickitto API:', error);
    return {
      experiences: [],
      totalCount: 0,
      filteredCount: 0,
      hasMore: false,
      isUsingMockData: false,
      apiError: error instanceof Error ? error.message : 'Tickitto API error',
    };
  }
}

/**
 * Apply client-side filtering to experiences
 * Used when the API doesn't support server-side filtering
 */
function applyClientSideFilters(
  experiences: ExperienceListItem[],
  filters: LocalDBFilters
): ExperienceListItem[] {
  return experiences.filter((exp) => {
    // Price filter
    if (filters.priceMin != null && exp.price.amount < filters.priceMin) {
      return false;
    }
    if (filters.priceMax != null && exp.price.amount > filters.priceMax) {
      return false;
    }

    // Rating filter
    if (filters.minRating != null) {
      const rating = exp.rating?.average ?? 0;
      if (rating < filters.minRating) {
        return false;
      }
    }

    // Duration filter (basic string matching)
    if (filters.duration) {
      const duration = exp.duration.formatted.toLowerCase();
      switch (filters.duration) {
        case 'short':
          if (!duration.includes('hour') && !duration.includes('min')) return false;
          if (duration.includes('hours')) return false; // More than 1 hour
          break;
        case 'half-day':
          if (!duration.includes('hours')) return false;
          break;
        case 'full-day':
          if (!duration.includes('day')) return false;
          break;
        case 'multi-day':
          if (!duration.includes('days')) return false;
          break;
      }
    }

    // Location/city filter
    if (filters.cities && filters.cities.length > 0) {
      const location = exp.location.name.toLowerCase();
      const matchesCity = filters.cities.some((city) => location.includes(city.toLowerCase()));
      if (!matchesCity) return false;
    }

    // Category filter would require category data on experiences
    // Not currently available from ProductList API response

    return true;
  });
}

/**
 * Parse duration filter string into Prisma query
 */
function parseDurationFilter(duration: string): Record<string, unknown> | null {
  // Duration values: 'short' (<2h), 'half-day' (2-4h), 'full-day' (4-8h), 'multi-day' (>8h)
  // We'll do a simple contains check on the duration string
  // This is a simplified approach - in production you'd normalize durations
  switch (duration) {
    case 'short':
      // Less than 2 hours - contains "hour" or "min" but not "hours"
      return { contains: 'hour' };
    case 'half-day':
      // 2-4 hours
      return { contains: 'hours' };
    case 'full-day':
      // Full day tours
      return { contains: 'day' };
    case 'multi-day':
      // Multi-day tours
      return { contains: 'days' };
    default:
      return null;
  }
}

/**
 * Get filter options for a supplier's products
 */
async function getFilterOptions(supplierId: string): Promise<FilterOptions> {
  const products = await prisma.product.findMany({
    where: { supplierId },
    select: {
      categories: true,
      priceFrom: true,
      duration: true,
      rating: true,
      city: true,
    },
  });

  // Aggregate categories
  const categoryMap = new Map<string, number>();
  for (const product of products) {
    for (const cat of product.categories) {
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
    }
  }
  const categories = Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 categories

  // Aggregate cities
  const cityMap = new Map<string, number>();
  for (const product of products) {
    if (product.city) {
      cityMap.set(product.city, (cityMap.get(product.city) ?? 0) + 1);
    }
  }
  const cities = Array.from(cityMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Calculate price ranges based on actual data
  const prices = products.map((p) => Number(p.priceFrom ?? 0)).filter((p) => p > 0);
  const maxPrice = Math.max(...prices, 0);
  const priceRanges: FilterOptions['priceRanges'] = [];

  if (maxPrice > 0) {
    // Dynamic price ranges based on data distribution
    const ranges = [
      { label: 'Under £50', min: 0, max: 50 },
      { label: '£50 - £100', min: 50, max: 100 },
      { label: '£100 - £200', min: 100, max: 200 },
      { label: '£200+', min: 200, max: null },
    ];

    for (const range of ranges) {
      const count = prices.filter(
        (p) => p >= range.min && (range.max === null || p < range.max)
      ).length;
      if (count > 0) {
        priceRanges.push({ ...range, count });
      }
    }
  }

  // Aggregate durations (simplified)
  const durations: FilterOptions['durations'] = [
    {
      label: 'Under 2 hours',
      value: 'short',
      count: products.filter((p) => p.duration?.includes('hour') && !p.duration?.includes('hours'))
        .length,
    },
    {
      label: 'Half day (2-4h)',
      value: 'half-day',
      count: products.filter((p) => p.duration?.includes('hours')).length,
    },
    {
      label: 'Full day',
      value: 'full-day',
      count: products.filter((p) => p.duration?.toLowerCase().includes('day')).length,
    },
  ].filter((d) => d.count > 0);

  // Rating filters
  const ratings: FilterOptions['ratings'] = [
    {
      label: '4.5+ Excellent',
      value: 4.5,
      count: products.filter((p) => (p.rating ?? 0) >= 4.5).length,
    },
    {
      label: '4.0+ Very Good',
      value: 4.0,
      count: products.filter((p) => (p.rating ?? 0) >= 4.0).length,
    },
    {
      label: '3.5+ Good',
      value: 3.5,
      count: products.filter((p) => (p.rating ?? 0) >= 3.5).length,
    },
  ].filter((r) => r.count > 0);

  return {
    categories,
    priceRanges,
    durations,
    ratings,
    cities,
  };
}

/**
 * Get filter options from Holibob API
 * Used when local products haven't been synced yet
 * Fetches a sample of products (200) to build approximate filter options
 */
async function getFilterOptionsFromAPI(
  site: SiteConfig,
  holibobSupplierId: string,
  cachedProductCount?: number
): Promise<FilterOptions & { isApproximate?: boolean }> {
  try {
    const client = getHolibobClient(site);
    // Fetch a sample of 200 products for filter options (prevents timeout for large catalogs)
    const response = await client.getProductsByProvider(holibobSupplierId, {
      pageSize: 200,
      page: 1,
    });
    // Use cached product count from database (accurate per-supplier count)
    const totalProducts = cachedProductCount ?? response.recordCount ?? response.nodes.length;
    const isApproximate = totalProducts > 200;

    // Extract filter options from API products
    const categoryMap = new Map<string, number>();
    const cityMap = new Map<string, number>();
    const prices: number[] = [];
    const durations: { label: string; value: string; count: number }[] = [];
    const durationCounts = { short: 0, halfDay: 0, fullDay: 0 };
    const ratingCounts = { excellent: 0, veryGood: 0, good: 0 };

    for (const product of response.nodes) {
      // Categories
      if (product.categoryList?.nodes) {
        for (const cat of product.categoryList.nodes) {
          categoryMap.set(cat.name, (categoryMap.get(cat.name) ?? 0) + 1);
        }
      }

      // Prices
      if (product.guidePrice != null && product.guidePrice > 0) {
        prices.push(product.guidePrice);
      }

      // Durations
      if (product.maxDuration != null) {
        const minutes = parseIsoDuration(product.maxDuration);
        if (minutes > 0) {
          if (minutes < 120) durationCounts.short++;
          else if (minutes < 480) durationCounts.halfDay++;
          else durationCounts.fullDay++;
        }
      }

      // Ratings
      if (product.reviewRating != null) {
        if (product.reviewRating >= 4.5) ratingCounts.excellent++;
        if (product.reviewRating >= 4.0) ratingCounts.veryGood++;
        if (product.reviewRating >= 3.5) ratingCounts.good++;
      }

      // Collect unique cityIds from place field for resolution
      if (product.place?.cityId) {
        cityMap.set(product.place.cityId, (cityMap.get(product.place.cityId) ?? 0) + 1);
      }
    }

    // Resolve cityIds to city names via Places API
    const cityIds = Array.from(cityMap.keys());
    let resolvedCities: { name: string; count: number }[] = [];
    if (cityIds.length > 0) {
      try {
        const places = await client.getPlaces({ type: 'CITY' });
        const placeMap = new Map(places.map((p) => [p.id, p.name]));
        resolvedCities = cityIds
          .map((cityId) => ({
            name: placeMap.get(cityId) ?? cityId,
            count: cityMap.get(cityId) ?? 0,
          }))
          .filter((c) => c.name !== c.name.match(/^[a-f0-9-]+$/)?.[0]) // skip unresolved UUIDs
          .sort((a, b) => b.count - a.count);
      } catch {
        // Places API failed - skip city filter options
      }
    }

    const categories = Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const cities = resolvedCities;

    // Build price ranges
    const priceRanges: FilterOptions['priceRanges'] = [];
    if (prices.length > 0) {
      const ranges = [
        { label: 'Under £50', min: 0, max: 50 },
        { label: '£50 - £100', min: 50, max: 100 },
        { label: '£100 - £200', min: 100, max: 200 },
        { label: '£200+', min: 200, max: null },
      ];

      for (const range of ranges) {
        const count = prices.filter(
          (p) => p >= range.min && (range.max === null || p < range.max)
        ).length;
        if (count > 0) {
          priceRanges.push({ ...range, count });
        }
      }
    }

    // Build duration options
    if (durationCounts.short > 0) {
      durations.push({ label: 'Under 2 hours', value: 'short', count: durationCounts.short });
    }
    if (durationCounts.halfDay > 0) {
      durations.push({
        label: 'Half day (2-4h)',
        value: 'half-day',
        count: durationCounts.halfDay,
      });
    }
    if (durationCounts.fullDay > 0) {
      durations.push({ label: 'Full day', value: 'full-day', count: durationCounts.fullDay });
    }

    // Build rating options
    const ratings: FilterOptions['ratings'] = [];
    if (ratingCounts.excellent > 0) {
      ratings.push({ label: '4.5+ Excellent', value: 4.5, count: ratingCounts.excellent });
    }
    if (ratingCounts.veryGood > 0) {
      ratings.push({ label: '4.0+ Very Good', value: 4.0, count: ratingCounts.veryGood });
    }
    if (ratingCounts.good > 0) {
      ratings.push({ label: '3.5+ Good', value: 3.5, count: ratingCounts.good });
    }

    return {
      categories,
      priceRanges,
      durations,
      ratings,
      cities,
      isApproximate,
    };
  } catch (error) {
    console.error('Error fetching filter options from API:', error);
    return {
      categories: [],
      priceRanges: [],
      durations: [],
      ratings: [],
      cities: [],
      isApproximate: false,
    };
  }
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount);
}

function formatDuration(value: number, unit: string): string {
  if (unit === 'minutes') {
    if (value >= 60) {
      const hours = Math.floor(value / 60);
      const mins = value % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours !== 1 ? 's' : ''}`;
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

// No mock data - all data comes from Holibob API

export default async function ExperiencesPage({ searchParams }: Props) {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);
  const resolvedSearchParams = await searchParams;

  const { experiences, totalCount, filteredCount, hasMore, apiError } = await getExperiences(
    site,
    resolvedSearchParams
  );

  // PPC fallback: if filtered page returns 0 results and traffic is from PPC, redirect to homepage
  const hasFilters = resolvedSearchParams['cities'] || resolvedSearchParams['categories'];
  const isPpcTraffic =
    resolvedSearchParams['utm_source'] ||
    resolvedSearchParams['utm_medium'] ||
    resolvedSearchParams['utm_campaign'] ||
    resolvedSearchParams['fbclid'] ||
    resolvedSearchParams['gclid'];

  if (hasFilters && isPpcTraffic && experiences.length === 0) {
    // Preserve UTM params on redirect so attribution isn't lost
    const utmParams = new URLSearchParams();
    for (const key of [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'fbclid',
      'gclid',
    ]) {
      if (resolvedSearchParams[key]) {
        utmParams.set(key, resolvedSearchParams[key]!);
      }
    }
    const query = utmParams.toString();
    redirect(query ? `/?${query}` : '/');
  }

  const destination = resolvedSearchParams.destination || resolvedSearchParams.location;
  const isMicrosite =
    !!site.micrositeContext?.supplierId ||
    !!site.micrositeContext?.discoveryConfig ||
    isTickittoSite(site);

  // For MARKETPLACE microsites (50+ products), show horizontal filter bar
  if (isMicrosite && site.micrositeContext?.supplierId) {
    const layoutType = site.micrositeContext.layoutConfig?.resolvedType;

    if (layoutType === 'MARKETPLACE') {
      // Try local DB filter options first, fallback to API-based filter options
      let filterOptions = await getFilterOptions(site.micrositeContext.supplierId);

      // If no local products, fetch all from API to build filter options
      if (filterOptions.categories.length === 0 && filterOptions.priceRanges.length === 0) {
        if (site.micrositeContext.holibobSupplierId) {
          filterOptions = await getFilterOptionsFromAPI(
            site,
            site.micrositeContext.holibobSupplierId,
            site.micrositeContext.cachedProductCount
          );
        }
      }

      // Convert FilterOptions to FilterCounts for the new component
      const initialFilterCounts: FilterCounts = {
        categories: filterOptions.categories,
        priceRanges: filterOptions.priceRanges,
        durations: filterOptions.durations,
        ratings: filterOptions.ratings,
        cities: filterOptions.cities,
      };

      // Build page title for marketplace — use URL filter params when present
      const ctx = site.micrositeContext;
      const urlCities = resolvedSearchParams.cities?.split(',').filter(Boolean) ?? [];
      const urlCategories = resolvedSearchParams.categories?.split(',').filter(Boolean) ?? [];

      const topCity =
        urlCities.length === 1
          ? urlCities[0]
          : urlCities.length > 1
            ? undefined
            : (ctx?.supplierCities?.[0] ?? site.homepageConfig?.destinations?.[0]?.name);
      const topCategory =
        urlCategories.length === 1
          ? urlCategories[0]
          : urlCategories.length > 1
            ? undefined
            : (ctx?.supplierCategories?.[0] ??
              site.homepageConfig?.categories?.map((c) => c.name)?.[0]);

      let marketplaceTitle = 'All Experiences & Tours';
      let marketplaceSubtitle = `Explore our curated collection of tours and activities`;

      if (urlCities.length > 1 && topCategory) {
        marketplaceTitle = `${topCategory} in ${urlCities.length} Cities`;
        marketplaceSubtitle = `Browse ${topCategory.toLowerCase()} in ${urlCities.join(', ')}`;
      } else if (urlCities.length > 1) {
        marketplaceTitle = `Experiences in ${urlCities.length} Cities`;
        marketplaceSubtitle = `Browse experiences in ${urlCities.join(', ')}`;
      } else if (topCategory && topCity) {
        marketplaceTitle = `${topCategory} in ${topCity}`;
        marketplaceSubtitle = `Browse the best ${topCategory.toLowerCase()} and more in ${topCity}`;
      } else if (topCity) {
        marketplaceTitle = `Things to Do in ${topCity}`;
        marketplaceSubtitle = `Explore tours, activities, and unique experiences in ${topCity}`;
      } else if (topCategory) {
        marketplaceTitle = `${topCategory} & Experiences`;
        marketplaceSubtitle = `Browse our collection of ${topCategory.toLowerCase()} and more`;
      }

      // Build extra API params for the client-side fetch hook
      const extraApiParams: Record<string, string> = {};
      if (site.micrositeContext['holibobSupplierId']) {
        extraApiParams['holibobSupplierId'] = site.micrositeContext['holibobSupplierId'];
      }

      return (
        <MarketplaceFilteredPage
          siteName={site.name}
          primaryColor={site.brand?.primaryColor ?? '#0F766E'}
          hostname={hostname}
          pageTitle={marketplaceTitle}
          pageSubtitle={marketplaceSubtitle}
          initialExperiences={experiences}
          initialTotalCount={totalCount}
          initialFilteredCount={filteredCount}
          initialHasMore={hasMore}
          initialFilterCounts={initialFilterCounts}
          extraApiParams={extraApiParams}
          apiError={apiError}
          supplierCities={ctx?.supplierCities ?? []}
          supplierCategories={ctx?.supplierCategories ?? []}
        />
      );
    }
  }

  // Build page title based on context
  let pageTitle = 'Discover Experiences';
  let pageSubtitle = 'Browse tours, activities, and unique experiences';

  // For microsites, show operator-specific messaging
  if (isMicrosite) {
    pageTitle = 'Our Experiences';
    pageSubtitle = `Explore our curated collection of tours and activities`;
  } else if (destination) {
    pageTitle = `Things to Do in ${destination}`;
    pageSubtitle = `Explore tours, activities, and unique experiences in ${destination}`;
  }

  if (resolvedSearchParams.q && !isMicrosite) {
    pageTitle = `${resolvedSearchParams.q}`;
    pageSubtitle = destination
      ? `Explore ${resolvedSearchParams.q.toLowerCase()} experiences in ${destination}`
      : `Explore ${resolvedSearchParams.q.toLowerCase()} experiences`;
  }

  // Build breadcrumbs for SEO
  const breadcrumbs = [
    { name: 'Home', url: `https://${hostname}` },
    { name: 'Experiences', url: `https://${hostname}/experiences` },
  ];

  if (destination) {
    breadcrumbs.push({
      name: destination,
      url: `https://${hostname}/experiences?destination=${encodeURIComponent(destination)}`,
    });
  }

  return (
    <>
      {/* SEO Structured Data */}
      <ExperienceListSchema
        experiences={experiences}
        listName={pageTitle}
        url={`https://${hostname}/experiences`}
        siteName={site.name}
        description={pageSubtitle}
      />
      <BreadcrumbSchema items={breadcrumbs} />

      <div className="min-h-screen bg-gray-50">
        {/* API Error Banner - shown to all users so they know something is wrong */}
        {apiError && (
          <div className="border-b border-amber-200 bg-amber-50">
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  We&apos;re having trouble loading experiences right now. Please try refreshing the
                  page.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Page Header */}
        <header className="bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Breadcrumb */}
            <nav className="mb-4" aria-label="Breadcrumb">
              <ol className="flex items-center gap-2 text-sm text-gray-500">
                <li>
                  <a href="/" className="hover:text-gray-700">
                    Home
                  </a>
                </li>
                <li>
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </li>
                <li className="font-medium text-gray-900">Experiences</li>
                {destination && (
                  <>
                    <li>
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </li>
                    <li className="font-medium text-gray-900">{destination}</li>
                  </>
                )}
              </ol>
            </nav>

            {/* Title */}
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {pageTitle}
            </h1>
            <p className="mt-2 text-lg text-gray-600">{pageSubtitle}</p>

            {/* Search Bar - Only show on main site, not on operator microsites */}
            {!isMicrosite && (
              <div className="mt-6">
                <ProductDiscoverySearch
                  variant="hero"
                  defaultDestination={destination}
                  defaultWhat={resolvedSearchParams.q}
                  defaultDates={{
                    startDate: resolvedSearchParams.startDate,
                    endDate: resolvedSearchParams.endDate,
                  }}
                />
              </div>
            )}

            {/* Trust Badges */}
            <div className="mt-6">
              <TrustBadges />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <ExperiencesGrid
            key={Object.entries(resolvedSearchParams)
              .filter(([, v]) => v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => `${k}=${v}`)
              .join('&')}
            initialExperiences={experiences}
            hasMore={hasMore}
            searchParams={resolvedSearchParams}
          />
        </main>
      </div>
    </>
  );
}
