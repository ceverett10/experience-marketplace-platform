/**
 * Commit Booking API Route
 * POST /api/booking/commit - Finalize booking before payment
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

const CommitBookingSchema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
});

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();

    // Validate request body
    const validationResult = CommitBookingSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { bookingId } = validationResult.data;

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // First verify the booking exists and is in pending state
    const existingBooking = await client.getBooking(bookingId);
    if (!existingBooking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    if (existingBooking.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot commit booking with status: ${existingBooking.status}` },
        { status: 409 }
      );
    }

    // Commit the booking
    const booking = await client.commitBooking(bookingId);

    return NextResponse.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error('Commit booking error:', error);

    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return NextResponse.json(
          { error: 'Booking has expired. Please start a new booking.' },
          { status: 410 }
        );
      }
      if (error.message.includes('availability')) {
        return NextResponse.json(
          { error: 'One or more items are no longer available' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to commit booking' },
      { status: 500 }
    );
  }
}
