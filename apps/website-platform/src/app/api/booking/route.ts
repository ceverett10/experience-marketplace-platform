/**
 * Booking API Routes
 * POST /api/booking - Create a new booking
 * GET /api/booking?id=xxx - Get booking details
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

// Guest schema for validation
const GuestSchema = z.object({
  guestTypeId: z.string(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

// Booking item schema
const BookingItemSchema = z.object({
  availabilityId: z.string(),
  guests: z.array(GuestSchema).min(1, 'At least one guest is required'),
  extras: z.array(
    z.object({
      extraId: z.string(),
      quantity: z.number().int().positive(),
    })
  ).optional(),
});

// Create booking request schema
const CreateBookingSchema = z.object({
  customerEmail: z.string().email('Valid email is required'),
  customerPhone: z.string().optional(),
  items: z.array(BookingItemSchema).min(1, 'At least one booking item is required'),
});

/**
 * GET /api/booking - Get booking details
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('id');

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Booking ID is required' },
        { status: 400 }
      );
    }

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Fetch booking
    const booking = await client.getBooking(bookingId);

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error('Get booking error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch booking' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/booking - Create a new booking
 */
export async function POST(request: NextRequest) {
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

    const { customerEmail, customerPhone, items } = validationResult.data;

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Create booking
    const booking = await client.createBooking({
      siteId: site.id,
      customerEmail,
      customerPhone,
      items,
    });

    return NextResponse.json({
      success: true,
      data: booking,
    }, { status: 201 });
  } catch (error) {
    console.error('Create booking error:', error);

    if (error instanceof Error) {
      // Handle specific error cases
      if (error.message.includes('availability')) {
        return NextResponse.json(
          { error: 'Selected time slot is no longer available' },
          { status: 409 }
        );
      }
      if (error.message.includes('capacity')) {
        return NextResponse.json(
          { error: 'Not enough capacity for the requested number of guests' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create booking' },
      { status: 500 }
    );
  }
}
