/**
 * Availability API Route
 *
 * GET /api/availability - Get availability list using recursive method
 *   Query params:
 *   - productId (required): Product ID
 *   - dateFrom, dateTo (optional): Date range for availability
 *   - sessionId (optional): Session ID for recursive calls
 *   - optionList (optional): JSON array of option answers
 *
 * This implements Holibob Look-to-Book Steps 3-5:
 * - Step 3: Request availability list (recursive method)
 * - Step 4: Discover availability options
 * - Step 5: Get pricing categories
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
    const sessionId = searchParams.get('sessionId') ?? undefined;
    const optionListJson = searchParams.get('optionList');

    // Validate required parameters
    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    // Parse option list if provided
    let optionList: Array<{ id: string; value: string }> | undefined;
    if (optionListJson) {
      try {
        optionList = JSON.parse(optionListJson);
      } catch {
        return NextResponse.json({ error: 'Invalid optionList JSON format' }, { status: 400 });
      }
    }

    // Get site configuration from hostname
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // If dates provided and no sessionId, use the helper method
    if (dateFrom && dateTo && !sessionId && !optionList) {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
        return NextResponse.json({ error: 'Dates must be in YYYY-MM-DD format' }, { status: 400 });
      }

      // Validate date range
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (fromDate < today) {
        return NextResponse.json({ error: 'dateFrom cannot be in the past' }, { status: 400 });
      }

      if (toDate < fromDate) {
        return NextResponse.json({ error: 'dateTo must be after dateFrom' }, { status: 400 });
      }

      // Use discoverAvailability helper
      const availability = await client.discoverAvailability(productId, dateFrom, dateTo);

      return NextResponse.json({
        success: true,
        data: availability,
      });
    }

    // Otherwise use the raw recursive method
    const availability = await client.getAvailabilityList(productId, sessionId, optionList);

    return NextResponse.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    console.error('Availability API error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}
