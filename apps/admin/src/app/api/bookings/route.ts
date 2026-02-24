import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/bookings
 * Returns bookings with site/microsite attribution and traffic source info.
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
      // Filter by site OR microsite
      where['OR'] = [{ siteId }, { micrositeId: siteId }];
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
      where['createdAt'] = {
        ...((where['createdAt'] as object) || {}),
        gte: new Date(startDate),
      };
    }
    if (endDate) {
      where['createdAt'] = {
        ...((where['createdAt'] as object) || {}),
        lte: new Date(endDate),
      };
    }

    // Fetch bookings, count, sites, and microsites in parallel
    const [bookings, total, sites, microsites] = await Promise.all([
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
          microsite: {
            select: {
              id: true,
              siteName: true,
              fullDomain: true,
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
      // All active microsites for filter dropdown
      prisma.micrositeConfig.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, siteName: true },
        orderBy: { siteName: 'asc' },
      }),
    ]);

    // Compute source summary from all bookings using Prisma (not raw SQL)
    const allBookingsForSummary = await prisma.booking.findMany({
      select: {
        utmSource: true,
        utmMedium: true,
        gclid: true,
        fbclid: true,
      },
    });

    const sourceCounts = new Map<string, number>();
    for (const b of allBookingsForSummary) {
      const label = getSourceKey(b);
      sourceCounts.set(label, (sourceCounts.get(label) || 0) + 1);
    }

    const sourceSummary = Array.from(sourceCounts.entries())
      .map(([src, count]) => ({ source: src, count }))
      .sort((a, b) => b.count - a.count);

    // Combine sites and microsites for filter dropdown
    const allSites = [
      ...sites.map((s) => ({ id: s.id, name: s.name })),
      ...microsites.map((m) => ({ id: m.id, name: `${m.siteName} (microsite)` })),
    ].sort((a, b) => a.name.localeCompare(b.name));

    // Format bookings
    const formattedBookings = bookings.map((b) => ({
      id: b.id,
      holibobBookingId: b.holibobBookingId,
      status: b.status,
      totalAmount: Number(b.totalAmount),
      currency: b.currency,
      commissionAmount: b.commissionAmount ? Number(b.commissionAmount) : null,
      commissionRate: b.commissionRate,
      site: b.site
        ? {
            id: b.site.id,
            name: b.site.name,
            domain: b.site.domains[0]?.domain || b.site.primaryDomain || 'No domain',
          }
        : b.microsite
          ? {
              id: b.microsite.id,
              name: b.microsite.siteName,
              domain: b.microsite.fullDomain,
            }
          : {
              id: 'unknown',
              name: 'Unknown',
              domain: 'N/A',
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

    return NextResponse.json({
      bookings: formattedBookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        sites: allSites,
        statuses: ['ALL', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REFUNDED'],
        sources: ['facebook', 'google', 'organic', 'direct', 'other'],
      },
      sourceSummary,
    });
  } catch (error) {
    console.error('[Bookings API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}

function getSourceKey(booking: {
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
    return 'facebook';
  }
  if (booking.gclid || booking.utmSource?.toLowerCase().includes('google')) {
    return 'google';
  }
  if (booking.utmMedium?.toLowerCase().includes('organic')) {
    return 'organic';
  }
  if (!booking.utmSource && !booking.utmMedium && !booking.gclid && !booking.fbclid) {
    return 'direct';
  }
  return 'other';
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
