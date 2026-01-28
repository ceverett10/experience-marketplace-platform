/**
 * Stripe Payment Session API
 * POST /api/payment/create-session - Create a Stripe checkout session
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import Stripe from 'stripe';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

// Initialize Stripe
const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', {
  apiVersion: '2023-10-16',
});

const CreateSessionSchema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
});

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();

    // Validate request body
    const validationResult = CreateSessionSchema.safeParse(body);
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
    const site = await getSiteFromHostname(host);
    const protocol = process.env['NODE_ENV'] === 'production' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    // Get Holibob client
    const client = getHolibobClient(site);

    // Fetch booking to get details
    const booking = await client.getBooking(bookingId);

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    if (booking.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot process payment for booking with status: ${booking.status}` },
        { status: 409 }
      );
    }

    // Build line items for Stripe
    // Note: For Holibob integration, payment is typically ON_ACCOUNT (billed to partner)
    // This Stripe integration is for direct consumer payment scenarios
    const items = (booking.items ?? []) as Array<{
      currency: string;
      productName: string;
      date: string;
      startTime?: string;
      guests: unknown[];
      unitPrice: number;
    }>;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => ({
      price_data: {
        currency: item.currency.toLowerCase(),
        product_data: {
          name: item.productName,
          description: `${item.date}${item.startTime ? ` at ${item.startTime}` : ''} - ${item.guests.length} guest${item.guests.length > 1 ? 's' : ''}`,
        },
        unit_amount: item.unitPrice,
      },
      quantity: item.guests.length,
    }));

    // Add service fee if present
    if (booking.fees && booking.fees > 0 && booking.currency) {
      lineItems.push({
        price_data: {
          currency: booking.currency.toLowerCase(),
          product_data: {
            name: 'Service Fee',
          },
          unit_amount: booking.fees,
        },
        quantity: 1,
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      customer_email: booking.customerEmail,
      metadata: {
        bookingId: booking.id,
        siteId: site.id,
      },
      success_url: `${baseUrl}/booking/confirmation/${bookingId}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/${bookingId}?cancelled=true`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
    });

    return NextResponse.json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Create payment session error:', error);

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create payment session' },
      { status: 500 }
    );
  }
}
