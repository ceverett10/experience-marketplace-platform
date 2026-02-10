/**
 * Subscribe API Route
 *
 * POST /api/subscribe - Subscribe to prize draw and optionally marketing
 *
 * This implements GDPR-compliant email collection for the Holibob platform
 * prize draw. Holibob Limited is the data controller.
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createHash } from 'crypto';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';

// Validation schema
const SubscribeSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  marketingConsent: z.boolean(),
  prizeDrawId: z.string().optional(),
  consentSource: z.enum(['popup', 'footer', 'checkout']).default('popup'),
});

/**
 * Hash IP address for privacy-compliant storage
 * We store a hash rather than the raw IP to comply with GDPR
 * while still maintaining an audit trail
 */
function hashIP(ip: string): string {
  const salt = process.env['IP_HASH_SALT'] ?? 'holibob-prize-draw-2024';
  return createHash('sha256')
    .update(ip + salt)
    .digest('hex')
    .slice(0, 16);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validationResult = SubscribeSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0]?.message ?? 'Validation failed' },
        { status: 400 }
      );
    }

    const { email, marketingConsent, prizeDrawId, consentSource } = validationResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Get site/microsite context
    const headersList = await headers();
    const host =
      headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
    const site = await getSiteFromHostname(host);

    // Get consent metadata for audit trail
    const forwardedFor = headersList.get('x-forwarded-for');
    const realIP = forwardedFor?.split(',')[0]?.trim() ?? 'unknown';
    const hashedIP = hashIP(realIP);
    const userAgent = headersList.get('user-agent') ?? undefined;

    // Determine if this is a microsite
    const isMicrosite = !!site.micrositeContext;

    // Check for existing subscriber
    const existingSubscriber = await prisma.subscriber.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingSubscriber) {
      // If they're re-subscribing with marketing consent (and didn't have it before), update
      if (marketingConsent && !existingSubscriber.marketingConsent) {
        await prisma.subscriber.update({
          where: { email: normalizedEmail },
          data: {
            marketingConsent: true,
            marketingConsentTimestamp: new Date(),
            marketingStatus: 'PENDING',
          },
        });

        return NextResponse.json({
          success: true,
          message: "You're already entered! We've updated your marketing preferences.",
          alreadySubscribed: true,
          marketingUpdated: true,
        });
      }

      return NextResponse.json({
        success: true,
        message: "You're already entered in the prize draw!",
        alreadySubscribed: true,
      });
    }

    // Create new subscriber
    await prisma.subscriber.create({
      data: {
        email: normalizedEmail,
        domain: host,
        siteId: isMicrosite ? undefined : site.id !== 'default' ? site.id : undefined,
        micrositeId: isMicrosite ? site.micrositeContext?.micrositeId : undefined,
        marketingConsent,
        marketingConsentTimestamp: marketingConsent ? new Date() : null,
        prizeDrawConsent: true,
        prizeDrawConsentTimestamp: new Date(),
        prizeDrawId: prizeDrawId ?? undefined,
        prizeDrawStatus: 'ENTERED',
        marketingStatus: marketingConsent ? 'PENDING' : 'UNSUBSCRIBED',
        ipAddress: hashedIP,
        userAgent: userAgent?.slice(0, 500), // Truncate for storage
        consentSource,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Successfully entered the prize draw!',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Subscribe error:', error);

    // Handle unique constraint violation gracefully
    // This can happen in race conditions with concurrent requests
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({
        success: true,
        message: "You're already entered!",
        alreadySubscribed: true,
      });
    }

    return NextResponse.json({ error: 'Failed to process subscription' }, { status: 500 });
  }
}
