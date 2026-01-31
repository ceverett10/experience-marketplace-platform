import { type NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const hostname = headersList.get('host') ?? 'localhost';
    const site = await getSiteFromHostname(hostname);
    const client = getHolibobClient(site);

    const searchParams = request.nextUrl.searchParams;
    const where = searchParams.get('where') || '';
    const what = searchParams.get('what') || '';
    const adults = searchParams.get('adults');
    const children = searchParams.get('children');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Only call API if we have at least some input
    if (!where && !what && !startDate && !adults) {
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
