/**
 * Booking API Routes
 *
 * POST /api/booking - Create a new booking (basket)
 * GET /api/booking?id=xxx - Get booking details
 *
 * This implements Holibob Look-to-Book Step 6:
 * - Create booking with autoFillQuestions = true (recommended)
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';
import { trackFunnelEvent, BookingFunnelStep } from '@/lib/funnel-tracking';

// Create booking request schema
const CreateBookingSchema = z.object({
  partnerExternalReference: z.string().optional(),
  consumerTripId: z.string().optional(),
  autoFillQuestions: z.boolean().optional().default(true),
});

/**
 * GET /api/booking - Get booking details
 * Query params:
 * - id: Booking ID (required)
 * - includeQuestions: Set to 'true' to include all question data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('id');
    const includeQuestions = searchParams.get('includeQuestions') === 'true';

    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
    }

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Fetch booking
    let booking;
    if (includeQuestions) {
      booking = await client.getBookingQuestions(bookingId);
    } else {
      booking = await client.getBooking(bookingId);
    }

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error('Get booking error:', error);
    return NextResponse.json({ error: 'Failed to fetch booking' }, { status: 500 });
  }
}

/**
 * POST /api/booking - Create a new booking (basket)
 * Body:
 * - partnerExternalReference: Optional reference ID
 * - consumerTripId: Optional trip ID to associate with
 * - autoFillQuestions: Whether to auto-fill questions (default: true)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    // Parse request body
    const body = await request.json();

    // Validate request body
    const validationResult = CreateBookingSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const input = validationResult.data;

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Create booking with recommended settings
    // Note: BookingCreateInput only accepts autoFillQuestions
    const booking = await client.createBooking({
      autoFillQuestions: input.autoFillQuestions ?? true,
    });

    trackFunnelEvent({
      step: BookingFunnelStep.BOOKING_CREATED,
      siteId: site.id,
      bookingId: booking.id,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json(
      {
        success: true,
        data: booking,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create booking error:', error);

    trackFunnelEvent({
      step: BookingFunnelStep.BOOKING_CREATED,
      siteId: 'unknown',
      errorCode: 'BOOKING_CREATE_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}
