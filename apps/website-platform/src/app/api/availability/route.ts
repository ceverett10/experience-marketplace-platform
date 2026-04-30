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

import { type NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';
import { trackFunnelEvent, BookingFunnelStep } from '@/lib/funnel-tracking';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
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
    const client = await getHolibobClient(site);

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

      // Holibob enforces a 40-day max per availability request.
      // If the user's date range exceeds 40 days, split into chunks and merge results.
      const MAX_DAYS_PER_CHUNK = 40;
      const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));

      let availability;
      if (daysDiff <= MAX_DAYS_PER_CHUNK) {
        console.info('[Availability API] Calling discoverAvailability:', {
          productId,
          dateFrom,
          dateTo,
        });
        availability = await client.discoverAvailability(productId, dateFrom, dateTo);
      } else {
        // Split into 40-day chunks and fetch in parallel
        const chunks: Array<{ from: string; to: string }> = [];
        let chunkStart = new Date(fromDate);
        while (chunkStart < toDate) {
          const chunkEnd = new Date(chunkStart);
          chunkEnd.setDate(chunkEnd.getDate() + MAX_DAYS_PER_CHUNK);
          const effectiveEnd = chunkEnd > toDate ? toDate : chunkEnd;
          chunks.push({
            from: chunkStart.toISOString().split('T')[0]!,
            to: effectiveEnd.toISOString().split('T')[0]!,
          });
          chunkStart = new Date(effectiveEnd);
        }

        console.info(
          `[Availability API] Splitting ${daysDiff}-day range into ${chunks.length} chunks for ${productId}`
        );

        const results = await Promise.all(
          chunks.map((chunk) => client.discoverAvailability(productId!, chunk.from, chunk.to))
        );

        // Merge all chunk results into a single response
        const allNodes = results.flatMap((r) => r.nodes ?? []);
        availability = {
          ...results[0],
          nodes: allNodes,
          totalCount: allNodes.length,
        };
      }

      console.info(
        '[Availability API] Got response:',
        JSON.stringify(availability).substring(0, 200)
      );

      const slotCount = availability?.nodes?.length ?? 0;
      trackFunnelEvent({
        step: BookingFunnelStep.AVAILABILITY_SEARCH,
        siteId: site.id,
        productId,
        durationMs: Date.now() - startTime,
        ...(slotCount === 0
          ? {
              errorCode: 'NO_AVAILABILITY_IN_RANGE',
              errorMessage: `range=${dateFrom}..${dateTo}, slotCount=0`,
            }
          : {}),
      });
      return NextResponse.json({
        success: true,
        data: availability,
      });
    }

    // Otherwise use the raw recursive method (filter is undefined for recursive calls)
    const availability = await client.getAvailabilityList(
      productId,
      undefined,
      sessionId,
      optionList
    );

    const slotCount = availability?.nodes?.length ?? 0;
    trackFunnelEvent({
      step: BookingFunnelStep.AVAILABILITY_SEARCH,
      siteId: site.id,
      productId,
      durationMs: Date.now() - startTime,
      ...(slotCount === 0
        ? {
            errorCode: 'NO_AVAILABILITY_IN_RANGE',
            errorMessage: 'slotCount=0, source=getAvailabilityList',
          }
        : {}),
    });
    return NextResponse.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    console.error('[Availability API] Error:', error);
    console.error(
      '[Availability API] Error details:',
      JSON.stringify(error, Object.getOwnPropertyNames(error))
    );

    trackFunnelEvent({
      step: BookingFunnelStep.AVAILABILITY_SEARCH,
      siteId: 'unknown',
      productId: new URL(request.url).searchParams.get('productId') ?? undefined,
      errorCode: 'AVAILABILITY_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    });

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}
