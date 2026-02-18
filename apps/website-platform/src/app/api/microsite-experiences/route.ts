import { NextRequest, NextResponse } from 'next/server';
import { createHolibobClient } from '@experience-marketplace/holibob-api';
import { optimizeHolibobImageWithPreset, parseIsoDuration } from '@/lib/holibob';
import { DURATION_RANGES, parseDurationToMinutes, classifyDuration } from '@/lib/duration-utils';

const DEFAULT_PAGE_SIZE = 20;

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

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount);
}

interface TransformedExperience {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  imageUrl: string;
  price: { amount: number; currency: string; formatted: string };
  duration: { formatted: string; minutes: number };
  rating: { average: number; count: number } | null;
  location: { name: string };
  categories: string[];
  cityId: string | null;
}

interface FilterCounts {
  categories: { name: string; count: number }[];
  priceRanges: { label: string; min: number; max: number | null; count: number }[];
  durations: { label: string; value: string; count: number }[];
  ratings: { label: string; value: number; count: number }[];
  cities: { name: string; count: number }[];
}

/**
 * Compute dynamic filter counts from a set of experiences.
 * These counts reflect what's available in the CURRENT result set,
 * allowing the UI to show accurate numbers as filters are applied.
 */
function computeFilterCounts(experiences: TransformedExperience[]): FilterCounts {
  // Categories
  const categoryMap = new Map<string, number>();
  for (const exp of experiences) {
    for (const cat of exp.categories) {
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
    }
  }
  const categories = Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Price ranges
  const prices = experiences.map((e) => e.price.amount).filter((p) => p > 0);
  const priceRangeDefinitions = [
    { label: 'Under £25', min: 0, max: 25 },
    { label: '£25 – £50', min: 25, max: 50 },
    { label: '£50 – £100', min: 50, max: 100 },
    { label: '£100 – £200', min: 100, max: 200 },
    { label: '£200+', min: 200, max: null as number | null },
  ];
  const priceRanges = priceRangeDefinitions
    .map((range) => ({
      ...range,
      count: prices.filter((p) => p >= range.min && (range.max === null || p < range.max)).length,
    }))
    .filter((r) => r.count > 0);

  // Durations (using numeric classification)
  const durationCountMap: Record<string, number> = {};
  for (const exp of experiences) {
    if (exp.duration.minutes > 0) {
      const key = classifyDuration(exp.duration.minutes);
      if (key) {
        durationCountMap[key] = (durationCountMap[key] ?? 0) + 1;
      }
    }
  }
  const durations = Object.entries(DURATION_RANGES)
    .map(([value, range]) => ({
      label: range.label,
      value,
      count: durationCountMap[value] ?? 0,
    }))
    .filter((d) => d.count > 0);

  // Ratings
  const ratingDefs = [
    { label: '4.5+ Excellent', value: 4.5 },
    { label: '4.0+ Very Good', value: 4.0 },
    { label: '3.5+ Good', value: 3.5 },
  ];
  const ratings = ratingDefs
    .map((def) => ({
      ...def,
      count: experiences.filter((e) => e.rating && e.rating.average >= def.value).length,
    }))
    .filter((r) => r.count > 0);

  // Cities (from categories or place data — Holibob ProductList doesn't return city name directly)
  const cities: FilterCounts['cities'] = [];

  return { categories, priceRanges, durations, ratings, cities };
}

/**
 * GET /api/microsite-experiences
 *
 * Fetches experiences from Holibob ProductList API with server-side filtering.
 * Used by MARKETPLACE microsites for paginated, filtered product lists.
 *
 * Query params:
 * - holibobSupplierId (required) - The Holibob provider ID
 * - page (default: 1) - Page number
 * - pageSize (default: 20) - Items per page
 * - categories - Comma-separated category IDs for filtering
 * - search - Text search across name, description, keywords
 * - city / cities - Place name filter
 * - priceMin, priceMax - Price range filter (client-side)
 * - duration - Duration preset filter: short, half-day, full-day, multi-day (client-side)
 * - minRating - Minimum rating filter (client-side)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Required: Holibob supplier ID
    const holibobSupplierId = searchParams.get('holibobSupplierId');
    if (!holibobSupplierId) {
      return NextResponse.json({ error: 'holibobSupplierId is required' }, { status: 400 });
    }

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);

    // Filters that go directly to Holibob API
    const categories = searchParams.get('categories');
    const search = searchParams.get('search');
    const city = searchParams.get('city') || searchParams.get('cities')?.split(',')[0];

    // Client-side filters (Holibob ProductList API doesn't support these natively)
    const priceMin = searchParams.get('priceMin')
      ? parseFloat(searchParams.get('priceMin')!)
      : null;
    const priceMax = searchParams.get('priceMax')
      ? parseFloat(searchParams.get('priceMax')!)
      : null;
    const durationPreset = searchParams.get('duration');
    const minRating = searchParams.get('minRating')
      ? parseFloat(searchParams.get('minRating')!)
      : null;

    const hasClientFilters =
      priceMin != null || priceMax != null || durationPreset != null || minRating != null;

    // Build filter options for Holibob API
    const filters: {
      categoryIds?: string[];
      search?: string;
      placeName?: string;
    } = {};

    if (categories) {
      filters.categoryIds = categories.split(',').filter(Boolean);
    }
    if (search) {
      filters.search = search;
    }
    if (city) {
      filters.placeName = city;
    }

    console.log('[API /microsite-experiences] Request:', {
      holibobSupplierId,
      page,
      pageSize,
      filters,
      clientFilters: { priceMin, priceMax, durationPreset, minRating },
    });

    // Create Holibob client
    const client = createHolibobClient({
      apiUrl: process.env['HOLIBOB_API_URL'] || 'https://api.production.holibob.tech/graphql',
      apiKey: process.env['HOLIBOB_API_KEY'] || '',
      apiSecret: process.env['HOLIBOB_API_SECRET'],
      partnerId: process.env['HOLIBOB_PARTNER_ID'] || 'holibob',
      timeout: 30000,
    });

    // When client-side filters are active, fetch a larger batch to filter from
    const fetchPageSize = hasClientFilters ? Math.max(pageSize * 3, 100) : pageSize;

    // Fetch products with server-side filtering
    const response = await client.getProductsByProvider(holibobSupplierId, {
      page: hasClientFilters ? 1 : page,
      pageSize: fetchPageSize,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    });

    // Transform products to experience format
    const allExperiences: TransformedExperience[] = (response.nodes || []).map((product) => {
      const rawImageUrl = product.imageList?.[0]?.url ?? '/placeholder-experience.jpg';
      const primaryImage = rawImageUrl.includes('images.holibob.tech')
        ? optimizeHolibobImageWithPreset(rawImageUrl, 'card')
        : rawImageUrl;

      const priceAmount = product.guidePrice ?? 0;
      const priceCurrency = product.guidePriceCurrency ?? 'GBP';
      const priceFormatted =
        product.guidePriceFormattedText ?? formatPrice(priceAmount, priceCurrency);

      let durationMinutes = 0;
      let durationFormatted = 'Duration varies';
      if (product.maxDuration != null) {
        durationMinutes = parseIsoDuration(product.maxDuration);
        if (durationMinutes > 0) {
          durationFormatted = formatDuration(durationMinutes, 'minutes');
        }
      }

      const categoryNames = product.categoryList?.nodes?.map((c) => c.name).filter(Boolean) ?? [];

      return {
        id: product.id,
        title: product.name ?? 'Experience',
        slug: product.id,
        shortDescription: product.description?.substring(0, 200) ?? '',
        imageUrl: primaryImage,
        price: {
          amount: priceAmount,
          currency: priceCurrency,
          formatted: priceFormatted,
        },
        duration: {
          formatted: durationFormatted,
          minutes: durationMinutes,
        },
        rating:
          product.reviewRating != null
            ? { average: product.reviewRating, count: product.reviewCount ?? 0 }
            : null,
        location: { name: '' },
        categories: categoryNames,
        cityId: product.place?.cityId ?? null,
      };
    });

    // Compute filter counts from the FULL fetched set (before client-side filtering)
    // This gives the user accurate counts for available filter options
    const filterCounts = computeFilterCounts(allExperiences);

    // Apply client-side filters
    let filteredExperiences = allExperiences;

    if (priceMin != null) {
      filteredExperiences = filteredExperiences.filter((e) => e.price.amount >= priceMin);
    }
    if (priceMax != null) {
      filteredExperiences = filteredExperiences.filter((e) => e.price.amount < priceMax);
    }
    if (durationPreset && DURATION_RANGES[durationPreset]) {
      const range = DURATION_RANGES[durationPreset];
      filteredExperiences = filteredExperiences.filter(
        (e) =>
          e.duration.minutes >= range.min && (range.max === null || e.duration.minutes < range.max)
      );
    }
    if (minRating != null) {
      filteredExperiences = filteredExperiences.filter(
        (e) => e.rating && e.rating.average >= minRating
      );
    }

    // Paginate client-side filtered results
    const startIndex = hasClientFilters ? (page - 1) * pageSize : 0;
    const paginatedExperiences = hasClientFilters
      ? filteredExperiences.slice(startIndex, startIndex + pageSize)
      : filteredExperiences;

    // Determine if there are more results
    const hasMore = hasClientFilters
      ? startIndex + pageSize < filteredExperiences.length
      : response.nextPage != null && response.nextPage > page;

    const responseData = {
      experiences: paginatedExperiences,
      page,
      totalCount: response.recordCount ?? paginatedExperiences.length,
      filteredCount: hasClientFilters
        ? filteredExperiences.length
        : (response.recordCount ?? paginatedExperiences.length),
      hasMore,
      filterCounts,
    };

    console.log('[API /microsite-experiences] Response:', {
      experienceCount: paginatedExperiences.length,
      page,
      totalCount: responseData.totalCount,
      filteredCount: responseData.filteredCount,
      hasMore,
      filterCountCategories: filterCounts.categories.length,
    });

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('[API /microsite-experiences] Error:', error);
    return NextResponse.json(
      {
        experiences: [],
        page: 1,
        totalCount: 0,
        filteredCount: 0,
        hasMore: false,
        filterCounts: { categories: [], priceRanges: [], durations: [], ratings: [], cities: [] },
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
