/**
 * Tickitto Events Search API Route
 *
 * GET /api/tickitto-events - Search Tickitto events
 *
 * Query params:
 * - text: Search text
 * - category: Category filter (comma-separated)
 * - city: City filter (comma-separated)
 * - country: Country filter
 * - t1: Start date (YYYY-MM-DD)
 * - t2: End date (YYYY-MM-DD)
 * - min_price: Minimum price
 * - max_price: Maximum price
 * - currency: Currency (default: GBP)
 * - skip: Pagination offset (default: 0)
 * - limit: Results per page (default: 20, max: 100)
 * - sort_by: Sort order
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTickittoClient, mapTickittoEventToExperienceListItem } from '@/lib/tickitto';

const DEFAULT_LIMIT = 20;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const text = searchParams.get('text') ?? searchParams.get('q') ?? undefined;
    const category = searchParams.get('category');
    const city = searchParams.get('city');
    const country = searchParams.get('country');
    const t1 = searchParams.get('t1') ?? undefined;
    const t2 = searchParams.get('t2') ?? undefined;
    const minPrice = searchParams.get('min_price');
    const maxPrice = searchParams.get('max_price');
    const currency = searchParams.get('currency') ?? 'GBP';
    const skip = parseInt(searchParams.get('skip') ?? '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10), 100);
    const sortBy = searchParams.get('sort_by') ?? undefined;

    const client = getTickittoClient();

    const result = await client.searchEvents({
      text,
      category: category ? category.split(',').filter(Boolean) : undefined,
      city: city ? city.split(',').filter(Boolean) : undefined,
      country: country ? [country] : undefined,
      t1,
      t2,
      min_price: minPrice ? parseFloat(minPrice) : undefined,
      max_price: maxPrice ? parseFloat(maxPrice) : undefined,
      currency,
      skip,
      limit,
      sort_by: sortBy as 'relevance' | 'price_asc' | 'price_desc' | 'date' | 'popularity' | undefined,
    });

    const experiences = result.events.map(mapTickittoEventToExperienceListItem);

    return NextResponse.json(
      {
        experiences,
        hasMore: skip + limit < result.totalCount,
        totalCount: result.totalCount,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('[API /tickitto-events] Error:', error);
    return NextResponse.json(
      {
        experiences: [],
        hasMore: false,
        totalCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
