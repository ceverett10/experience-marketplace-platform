import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

const ITEMS_PER_PAGE = 12;

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
    const hostname = headersList.get('host') ?? 'localhost';
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
    const seenProductIdList = seenProductIds ? seenProductIds.split(',').filter(Boolean) : undefined;

    console.log('[API /experiences] Request params:', {
      destination,
      searchTerm,
      seenProductIdCount: seenProductIdList?.length ?? 0,
    });

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
      const primaryImage =
        product.imageList?.[0]?.url ?? product.imageUrl ?? '/placeholder-experience.jpg';

      const priceAmount = product.guidePrice ?? product.priceFrom ?? 0;
      const priceCurrency =
        product.guidePriceCurrency ?? product.priceCurrency ?? product.currency ?? 'GBP';
      const priceFormatted =
        product.guidePriceFormattedText ??
        product.priceFromFormatted ??
        formatPrice(priceAmount, priceCurrency);

      const durationFormatted =
        product.durationText ??
        (product.duration ? formatDuration(product.duration, 'minutes') : 'Duration varies');

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

    console.log('[API /experiences] Returning', experiences.length, 'experiences, hasMore:', hasMoreResults);

    return NextResponse.json({
      experiences,
      hasMore: hasMoreResults,
      totalCount: response.totalCount ?? experiences.length,
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
