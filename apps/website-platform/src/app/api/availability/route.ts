/**
 * Availability API Route
 * GET /api/availability?productId=xxx&dateFrom=xxx&dateTo=xxx&adults=2&children=0
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const adults = parseInt(searchParams.get('adults') ?? '2', 10);
    const children = parseInt(searchParams.get('children') ?? '0', 10);

    // Validate required parameters
    if (!productId) {
      return NextResponse.json(
        { error: 'productId is required' },
        { status: 400 }
      );
    }

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'dateFrom and dateTo are required' },
        { status: 400 }
      );
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
      return NextResponse.json(
        { error: 'Dates must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    // Validate date range
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (fromDate < today) {
      return NextResponse.json(
        { error: 'dateFrom cannot be in the past' },
        { status: 400 }
      );
    }

    if (toDate < fromDate) {
      return NextResponse.json(
        { error: 'dateTo must be after dateFrom' },
        { status: 400 }
      );
    }

    // Get site configuration from hostname
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Fetch availability
    const availability = await client.getAvailability(
      productId,
      dateFrom,
      dateTo,
      { adults, children }
    );

    return NextResponse.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    console.error('Availability API error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch availability' },
      { status: 500 }
    );
  }
}
