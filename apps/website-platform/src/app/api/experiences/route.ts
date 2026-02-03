import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient, parseIsoDuration, optimizeHolibobImageUrl } from '@/lib/holibob';

const ITEMS_PER_PAGE = 12;

// In-memory cache for Holibob API responses
// Cache key: "destination|searchTerm|adults|children|startDate|endDate|seenIds"
// Cache expires after 10 minutes
const apiCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCacheKey(params: {
  destination?: string | null;
  searchTerm?: string | null;
  adults?: string | null;
  children?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  seenProductIds?: string | null;
}): string {
  return `${params.destination || ''}|${params.searchTerm || ''}|${params.adults || ''}|${params.children || ''}|${params.startDate || ''}|${params.endDate || ''}|${params.seenProductIds || ''}`;
}

function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, value] of apiCache.entries()) {
    if (value.expiresAt < now) {
      apiCache.delete(key);
    }
  }
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount / 100);
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

export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
    const site = await getSiteFromHostname(hostname);
    const client = getHolibobClient(site);

    const searchParams = request.nextUrl.searchParams;
    const destination = searchParams.get('destination') || searchParams.get('location');
    const searchTerm = searchParams.get('q');
    const adults = searchParams.get('adults');
    const children = searchParams.get('children');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Get seen product IDs for "Load More" pagination
    // Holibob doesn't support traditional pagination - instead we pass IDs of products
    // we've already shown so the API returns new recommendations
    const seenProductIds = searchParams.get('seenProductIds');
    const seenProductIdList = seenProductIds
      ? seenProductIds.split(',').filter(Boolean)
      : undefined;

    console.log('[API /experiences] Request params:', {
      destination,
      searchTerm,
      seenProductIdCount: seenProductIdList?.length ?? 0,
    });

    // Generate cache key and check cache
    const cacheKey = getCacheKey({
      destination,
      searchTerm,
      adults,
      children,
      startDate,
      endDate,
      seenProductIds,
    });

    // Clean expired cache entries periodically
    cleanExpiredCache();

    // Check if we have cached data
    const cached = apiCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log('[API /experiences] Returning cached data');
      const cachedResponse = cached.data as { experiences: unknown[]; hasMore: boolean; totalCount: number };
      return NextResponse.json(cachedResponse, {
        headers: {
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300',
        },
      });
    }

    const response = await client.discoverProducts(
      {
        currency: 'GBP',
        freeText: destination || undefined,
        searchTerm: searchTerm || undefined,
        adults: adults ? parseInt(adults, 10) : 2,
        children: children ? parseInt(children, 10) : undefined,
        dateFrom: startDate || undefined,
        dateTo: endDate || undefined,
      },
      {
        pageSize: ITEMS_PER_PAGE,
        seenProductIdList,
      }
    );

    const experiences = response.products.map((product) => {
      const rawImageUrl =
        product.imageList?.[0]?.url ?? product.imageUrl ?? '/placeholder-experience.jpg';

      // Optimize Holibob images to request card-sized versions (550x366px like Holibob Hub)
      const primaryImage = rawImageUrl.includes('images.holibob.tech')
        ? optimizeHolibobImageUrl(rawImageUrl, 550, 366)
        : rawImageUrl;

      const priceAmount = product.guidePrice ?? product.priceFrom ?? 0;
      const priceCurrency =
        product.guidePriceCurrency ?? product.priceCurrency ?? product.currency ?? 'GBP';
      const priceFormatted =
        product.guidePriceFormattedText ??
        product.priceFromFormatted ??
        formatPrice(priceAmount, priceCurrency);

      // Get duration - Product Discovery API returns maxDuration as ISO 8601 (e.g., "PT210M")
      let durationFormatted = 'Duration varies';
      if (product.durationText) {
        durationFormatted = product.durationText;
      } else if (product.maxDuration != null) {
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
        rating: product.rating
          ? {
              average: product.rating,
              count: 0,
            }
          : null,
        location: {
          name: product.location?.name ?? '',
        },
        cancellationPolicy: product.cancellationPolicy
          ? {
              type: product.cancellationPolicy.type,
            }
          : undefined,
      };
    });

    // hasMore is determined by whether we got a full page of results
    const hasMoreResults = response.pageInfo?.hasNextPage ?? experiences.length >= ITEMS_PER_PAGE;

    console.log(
      '[API /experiences] Returning',
      experiences.length,
      'experiences, hasMore:',
      hasMoreResults
    );

    const responseData = {
      experiences,
      hasMore: hasMoreResults,
      totalCount: response.totalCount ?? experiences.length,
    };

    // Store in cache
    apiCache.set(cacheKey, {
      data: responseData,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Error fetching experiences:', error);
    return NextResponse.json(
      {
        experiences: [],
        hasMore: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
