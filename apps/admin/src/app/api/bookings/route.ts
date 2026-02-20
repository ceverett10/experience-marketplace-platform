import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/bookings
 * Returns bookings with site attribution and traffic source info.
 * Supports filtering by status, site, source, and date range.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const siteId = searchParams.get('siteId');
    const source = searchParams.get('source');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status && status !== 'ALL') {
      where['status'] = status;
    }

    if (siteId) {
      where['siteId'] = siteId;
    }

    if (source) {
      // Filter by traffic source: facebook, google, organic, direct, other
      switch (source) {
        case 'facebook':
          where['OR'] = [
            { utmSource: { contains: 'facebook', mode: 'insensitive' } },
            { utmSource: { contains: 'fb', mode: 'insensitive' } },
            { fbclid: { not: null } },
          ];
          break;
        case 'google':
          where['OR'] = [
            { utmSource: { contains: 'google', mode: 'insensitive' } },
            { gclid: { not: null } },
          ];
          break;
        case 'organic':
          where['utmMedium'] = { contains: 'organic', mode: 'insensitive' };
          break;
        case 'direct':
          where['AND'] = [
            { utmSource: null },
            { utmMedium: null },
            { gclid: null },
            { fbclid: null },
          ];
          break;
      }
    }

    if (startDate) {
      where['createdAt'] = { ...((where['createdAt'] as object) || {}), gte: new Date(startDate) };
    }
    if (endDate) {
      where['createdAt'] = { ...((where['createdAt'] as object) || {}), lte: new Date(endDate) };
    }

    // Fetch bookings and count in parallel
    const [bookings, total, sites, sourceSummary] = await Promise.all([
      prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          site: {
            select: {
              id: true,
              name: true,
              primaryDomain: true,
              domains: {
                where: { status: 'ACTIVE' },
                take: 1,
                select: { domain: true },
              },
            },
          },
        },
      }),
      prisma.booking.count({ where }),
      // All sites for filter dropdown
      prisma.site.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      // Source attribution summary
      prisma.$queryRaw<Array<{ source: string; count: bigint }>>`
        SELECT
          CASE
            WHEN "utmSource" ILIKE '%facebook%' OR "utmSource" ILIKE '%fb%' OR "fbclid" IS NOT NULL THEN 'facebook'
            WHEN "utmSource" ILIKE '%google%' OR "gclid" IS NOT NULL THEN 'google'
            WHEN "utmMedium" ILIKE '%organic%' THEN 'organic'
            WHEN "utmSource" IS NULL AND "utmMedium" IS NULL AND "gclid" IS NULL AND "fbclid" IS NULL THEN 'direct'
            ELSE 'other'
          END AS source,
          COUNT(*) AS count
        FROM "Booking"
        GROUP BY source
        ORDER BY count DESC
      `,
    ]);

    // Format bookings
    const formattedBookings = bookings.map((b) => ({
      id: b.id,
      holibobBookingId: b.holibobBookingId,
      status: b.status,
      totalAmount: Number(b.totalAmount),
      currency: b.currency,
      commissionAmount: b.commissionAmount ? Number(b.commissionAmount) : null,
      commissionRate: b.commissionRate,
      site: {
        id: b.site.id,
        name: b.site.name,
        domain: b.site.domains[0]?.domain || b.site.primaryDomain || 'No domain',
      },
      source: getSourceLabel(b),
      sourceDetail: {
        utmSource: b.utmSource,
        utmMedium: b.utmMedium,
        utmCampaign: b.utmCampaign,
        gclid: b.gclid ? true : false,
        fbclid: b.fbclid ? true : false,
      },
      landingPage: b.landingPage,
      createdAt: b.createdAt.toISOString(),
      completedAt: b.completedAt?.toISOString() || null,
    }));

    // Format source summary
    const formattedSourceSummary = sourceSummary.map((s) => ({
      source: s.source,
      count: Number(s.count),
    }));

    return NextResponse.json({
      bookings: formattedBookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        sites,
        statuses: ['ALL', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REFUNDED'],
        sources: ['facebook', 'google', 'organic', 'direct', 'other'],
      },
      sourceSummary: formattedSourceSummary,
    });
  } catch (error) {
    console.error('[Bookings API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}

function getSourceLabel(booking: {
  utmSource: string | null;
  utmMedium: string | null;
  gclid: string | null;
  fbclid: string | null;
}): string {
  if (
    booking.fbclid ||
    booking.utmSource?.toLowerCase().includes('facebook') ||
    booking.utmSource?.toLowerCase().includes('fb')
  ) {
    return 'Facebook';
  }
  if (booking.gclid || booking.utmSource?.toLowerCase().includes('google')) {
    return 'Google';
  }
  if (booking.utmMedium?.toLowerCase().includes('organic')) {
    return 'Organic';
  }
  if (booking.utmSource) {
    return booking.utmSource;
  }
  return 'Direct';
}
