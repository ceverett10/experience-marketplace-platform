import { type NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
    const site = await getSiteFromHostname(hostname);
    const client = await getHolibobClient(site);

    const searchParams = request.nextUrl.searchParams;
    const where = searchParams.get('where') || '';
    const what = searchParams.get('what') || '';
    const adults = searchParams.get('adults');
    const children = searchParams.get('children');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Product Discovery API requires where.freeText — don't call without a location.
    // Other params (what, startDate, adults) map to "what"/"when"/"who", not "where".
    if (!where) {
      return NextResponse.json({
        destination: null,
        destinations: [],
        tags: [],
        searchTerms: [],
      });
    }

    const suggestions = await client.getSuggestions({
      currency: 'GBP',
      freeText: where || undefined,
      searchTerm: what || undefined,
      adults: adults ? parseInt(adults, 10) : 2,
      children: children ? parseInt(children, 10) : undefined,
      dateFrom: startDate || undefined,
      dateTo: endDate || undefined,
    });

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return NextResponse.json(
      {
        destination: null,
        destinations: [],
        tags: [],
        searchTerms: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
