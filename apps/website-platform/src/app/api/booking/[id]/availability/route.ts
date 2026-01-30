/**
 * Booking Availability API Route
 *
 * POST /api/booking/[id]/availability - Add availability to booking
 *
 * This implements Holibob Look-to-Book Step 7:
 * - Add availability (configured with options and pricing) to booking
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

// Add availability request schema
const AddAvailabilitySchema = z.object({
  availabilityId: z.string().min(1, 'Availability ID is required'),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/booking/[id]/availability - Add availability to booking
 * Body:
 * - availabilityId: The availability ID to add (required)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: bookingId } = await params;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = AddAvailabilitySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { availabilityId } = validationResult.data;

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Add availability to booking
    // Holibob API expects: bookingSelector (to identify booking) + id (availability ID)
    const result = await client.addAvailabilityToBooking({
      bookingSelector: { id: bookingId },
      id: availabilityId,
    });

    // Get updated booking with questions
    const booking = await client.getBookingQuestions(bookingId);

    return NextResponse.json({
      success: true,
      data: {
        isComplete: result.isComplete,
        booking,
      },
    });
  } catch (error) {
    console.error('Add availability to booking error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Booking or availability not found' }, { status: 404 });
      }
      if (error.message.includes('invalid') || error.message.includes('not valid')) {
        return NextResponse.json(
          { error: 'Availability is not valid for booking (options/pricing incomplete)' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ error: 'Failed to add availability to booking' }, { status: 500 });
  }
}
