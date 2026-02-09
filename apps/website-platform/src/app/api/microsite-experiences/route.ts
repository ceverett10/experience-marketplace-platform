import { NextRequest, NextResponse } from 'next/server';
import { createHolibobClient } from '@experience-marketplace/holibob-api';
import { optimizeHolibobImageWithPreset, parseIsoDuration } from '@/lib/holibob';

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
  }).format(amount / 100);
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
 * - city - Place name filter
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Required: Holibob supplier ID
    const holibobSupplierId = searchParams.get('holibobSupplierId');
    if (!holibobSupplierId) {
      return NextResponse.json(
        { error: 'holibobSupplierId is required' },
        { status: 400 }
      );
    }

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(
      searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE),
      10
    );

    // Filters - these go directly to Holibob API
    const categories = searchParams.get('categories');
    const search = searchParams.get('search');
    const city = searchParams.get('city');

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
    });

    // Create Holibob client
    const client = createHolibobClient({
      apiUrl:
        process.env['HOLIBOB_API_URL'] || 'https://api.production.holibob.tech/graphql',
      apiKey: process.env['HOLIBOB_API_KEY'] || '',
      apiSecret: process.env['HOLIBOB_API_SECRET'],
      partnerId: process.env['HOLIBOB_PARTNER_ID'] || 'holibob',
      timeout: 30000,
    });

    // Fetch products with server-side filtering
    const response = await client.getProductsByProvider(holibobSupplierId, {
      page,
      pageSize,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    });

    // Transform products to experience format
    const experiences = (response.nodes || []).map((product) => {
      const rawImageUrl =
        product.imageList?.[0]?.url ?? '/placeholder-experience.jpg';

      // Optimize Holibob images
      const primaryImage = rawImageUrl.includes('images.holibob.tech')
        ? optimizeHolibobImageWithPreset(rawImageUrl, 'card')
        : rawImageUrl;

      const priceAmount = product.guidePrice ?? 0;
      const priceCurrency = product.guidePriceCurrency ?? 'GBP';
      const priceFormatted =
        product.guidePriceFormattedText ?? formatPrice(priceAmount, priceCurrency);

      // Get duration
      let durationFormatted = 'Duration varies';
      if (product.maxDuration != null) {
        const minutes = parseIsoDuration(product.maxDuration);
        if (minutes > 0) {
          durationFormatted = formatDuration(minutes, 'minutes');
        }
      }

      // Get categories
      const categoryNames =
        product.categoryList?.nodes?.map((c) => c.name).filter(Boolean) ?? [];

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
        },
        rating:
          product.reviewRating != null
            ? {
                average: product.reviewRating,
                count: product.reviewCount ?? 0,
              }
            : null,
        location: {
          name: '', // Holibob ProductList doesn't return location name
        },
        categories: categoryNames,
        cityId: product.place?.cityId ?? null,
      };
    });

    // Determine if there are more results
    const hasMore = response.nextPage != null && response.nextPage > page;

    const responseData = {
      experiences,
      page,
      totalCount: response.unfilteredRecordCount ?? response.recordCount ?? 0,
      filteredCount: response.recordCount ?? experiences.length,
      hasMore,
    };

    console.log('[API /microsite-experiences] Response:', {
      experienceCount: experiences.length,
      page,
      totalCount: responseData.totalCount,
      filteredCount: responseData.filteredCount,
      hasMore,
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
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
