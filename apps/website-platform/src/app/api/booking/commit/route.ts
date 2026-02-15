/**
 * Commit Booking API Route
 *
 * POST /api/booking/commit - Finalize booking
 *
 * This implements Holibob Look-to-Book Step 9:
 * - Commit booking after canCommit = true
 * - Optionally wait for supplier confirmation
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';
import { prisma } from '@/lib/prisma';
import { trackFunnelEvent, BookingFunnelStep } from '@/lib/funnel-tracking';

const CommitBookingSchema = z.object({
  bookingId: z.string().optional(),
  bookingCode: z.string().optional(),
  waitForConfirmation: z.boolean().optional().default(false),
  maxWaitSeconds: z.number().optional().default(60),
  // Product ID for booking analytics (urgency messaging)
  productId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();
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

    const { bookingId, bookingCode, waitForConfirmation, maxWaitSeconds, productId } =
      validationResult.data;

    // Ensure at least one identifier is provided
    if (!bookingId && !bookingCode) {
      return NextResponse.json(
        { error: 'Either bookingId or bookingCode is required' },
        { status: 400 }
      );
    }

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // First verify the booking exists and canCommit
    const existingBooking = await client.getBooking(bookingId ?? bookingCode!);
    if (!existingBooking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Check if booking can be committed
    if (existingBooking.state !== 'OPEN') {
      return NextResponse.json(
        { error: `Cannot commit booking with state: ${existingBooking.state}` },
        { status: 409 }
      );
    }

    // Get full booking with questions to check canCommit
    const bookingWithQuestions = await client.getBookingQuestions(bookingId ?? existingBooking.id);

    // Log questions for debugging
    console.log('[Commit API] canCommit:', bookingWithQuestions.canCommit);
    console.log(
      '[Commit API] Booking questions:',
      JSON.stringify(bookingWithQuestions.questionList?.nodes ?? [], null, 2)
    );
    console.log(
      '[Commit API] Availability questions:',
      JSON.stringify(
        bookingWithQuestions.availabilityList?.nodes.map(
          (a: {
            id: string;
            questionList?: {
              nodes: Array<{ id: string; label: string; answerValue?: string | null }>;
            };
            personList?: {
              nodes: Array<{
                id: string;
                questionList?: {
                  nodes: Array<{ id: string; label: string; answerValue?: string | null }>;
                };
              }>;
            };
          }) => ({
            id: a.id,
            questions: a.questionList?.nodes ?? [],
            persons:
              a.personList?.nodes.map(
                (p: {
                  id: string;
                  questionList?: {
                    nodes: Array<{ id: string; label: string; answerValue?: string | null }>;
                  };
                }) => ({
                  id: p.id,
                  questions: p.questionList?.nodes ?? [],
                })
              ) ?? [],
          })
        ) ?? [],
        null,
        2
      )
    );

    // With autoFillQuestions: true, try to commit anyway
    // Holibob should have auto-filled the questions
    if (!bookingWithQuestions.canCommit) {
      console.log(
        '[Commit API] canCommit is false, but trying to commit anyway with autoFillQuestions...'
      );
    }

    // Commit the booking using selector
    const selector = bookingId ? { id: bookingId } : { code: bookingCode };
    let booking = await client.commitBooking(selector);

    // If requested, wait for confirmation
    if (waitForConfirmation && booking.state === 'PENDING') {
      try {
        const maxAttempts = Math.ceil((maxWaitSeconds ?? 60) / 2);
        booking = await client.waitForConfirmation(booking.id, {
          maxAttempts,
          intervalMs: 2000,
        });
      } catch (waitError) {
        // If waiting times out, still return the booking (in PENDING state)
        console.warn('Booking confirmation wait timed out:', waitError);
        // Re-fetch to get latest state
        const latestBooking = await client.getBooking(booking.id);
        if (latestBooking) {
          booking = latestBooking;
        }
      }
    }

    // Save booking to local database for analytics (urgency messaging)
    // This enables "Booked X times this week" social proof
    if (booking.state === 'CONFIRMED' || booking.state === 'PENDING') {
      try {
        // Read UTM attribution from cookie (set by middleware on paid traffic landing)
        let utmSource: string | undefined;
        let utmMedium: string | undefined;
        let utmCampaign: string | undefined;
        let landingPage: string | undefined;
        let gclid: string | undefined;
        let fbclid: string | undefined;
        const utmCookie = request.cookies.get('utm_params')?.value;
        if (utmCookie) {
          try {
            const utm = JSON.parse(utmCookie);
            utmSource = utm.source || undefined;
            utmMedium = utm.medium || undefined;
            utmCampaign = utm.campaign || undefined;
            landingPage = utm.landingPage || undefined;
            gclid = utm.gclid || undefined;
            fbclid = utm.fbclid || undefined;
          } catch {
            // Invalid cookie JSON — ignore
          }
        }

        // Calculate commission from Holibob gross/net price split
        const gross = booking.totalPrice?.gross;
        const net = booking.totalPrice?.net;
        let commissionAmount: number | undefined;
        let commissionRate: number | undefined;
        if (gross && net && gross > 0) {
          commissionAmount = gross - net;
          commissionRate = (commissionAmount / gross) * 100;
        }

        await prisma.booking.upsert({
          where: { holibobBookingId: booking.id },
          create: {
            holibobBookingId: booking.id,
            holibobBasketId: booking.code || null,
            holibobProductId: productId || null,
            status: booking.state === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
            totalAmount: gross || 0,
            currency: booking.currency || 'GBP',
            siteId: site.id,
            utmSource,
            utmMedium,
            utmCampaign,
            landingPage,
            gclid: gclid ?? null,
            fbclid: fbclid ?? null,
            commissionAmount: commissionAmount ?? null,
            commissionRate: commissionRate ?? null,
          },
          update: {
            status: booking.state === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
            holibobProductId: productId || undefined,
            // Update UTM/commission if not already set (first write wins)
            ...(utmSource ? { utmSource } : {}),
            ...(gclid ? { gclid } : {}),
            ...(fbclid ? { fbclid } : {}),
            ...(commissionAmount != null ? { commissionAmount, commissionRate } : {}),
          },
        });
        console.log(
          `[Commit API] Saved booking ${booking.id} (${utmSource ? `utm=${utmSource}/${utmMedium}/${utmCampaign}` : 'organic'}, commission=${commissionRate?.toFixed(1) ?? 'N/A'}%)`
        );
      } catch (dbError) {
        // Log but don't fail the request if DB save fails
        console.error('[Commit API] Failed to save booking to local DB:', dbError);
      }
    }

    trackFunnelEvent({ step: BookingFunnelStep.BOOKING_COMPLETED, siteId: site.id, bookingId: booking.id, productId: productId ?? undefined, durationMs: Date.now() - startTime });
    return NextResponse.json({
      success: true,
      data: {
        booking,
        voucherUrl: booking.voucherUrl,
        isConfirmed: booking.state === 'CONFIRMED',
      },
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
      if (error.message.includes('REJECTED')) {
        return NextResponse.json({ error: 'Booking was rejected by supplier' }, { status: 409 });
      }
      if (error.message.includes('CANCELLED')) {
        return NextResponse.json({ error: 'Booking was cancelled' }, { status: 409 });
      }
    }

    trackFunnelEvent({ step: BookingFunnelStep.BOOKING_COMPLETED, siteId: 'unknown', errorCode: 'COMMIT_ERROR', errorMessage: error instanceof Error ? error.message : 'Unknown error', durationMs: Date.now() - startTime });
    return NextResponse.json({ error: 'Failed to commit booking' }, { status: 500 });
  }
}
