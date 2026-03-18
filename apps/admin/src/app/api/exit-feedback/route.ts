import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Human-readable labels for exit feedback reason codes.
 */
const REASON_LABELS: Record<string, string> = {
  JUST_BROWSING: 'Just browsing',
  TOO_EXPENSIVE: 'Too expensive',
  WRONG_DESTINATION: 'Wrong destination',
  DATES_UNAVAILABLE: 'Dates unavailable',
  NEED_MORE_INFO: 'Need more info',
  DONT_TRUST_SITE: "Doesn't trust site",
  OTHER: 'Other',
};

/**
 * GET /api/exit-feedback
 * Returns exit intent feedback from BookingFunnelEvent with step=EXIT_FEEDBACK.
 * Supports filtering by site, reason, and date range, with stats and pagination.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const reason = searchParams.get('reason');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const skip = (page - 1) * limit;

    // Base filter: only EXIT_FEEDBACK events
    const where: Record<string, unknown> = {
      step: 'EXIT_FEEDBACK',
    };

    if (siteId) {
      where['siteId'] = siteId;
    }
    if (reason && reason !== 'ALL') {
      where['errorCode'] = reason;
    }

    // Date boundaries
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Fetch data in parallel
    const [events, total, totalAll, thisWeek, thisMonth, reasonBreakdown, sites] =
      await Promise.all([
        // Paginated list
        prisma.bookingFunnelEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        // Filtered count
        prisma.bookingFunnelEvent.count({ where }),
        // Stats: total exit feedback (unfiltered)
        prisma.bookingFunnelEvent.count({ where: { step: 'EXIT_FEEDBACK' } }),
        // Stats: this week
        prisma.bookingFunnelEvent.count({
          where: { step: 'EXIT_FEEDBACK', createdAt: { gte: sevenDaysAgo } },
        }),
        // Stats: this month
        prisma.bookingFunnelEvent.count({
          where: { step: 'EXIT_FEEDBACK', createdAt: { gte: thirtyDaysAgo } },
        }),
        // Reason breakdown
        prisma.bookingFunnelEvent.groupBy({
          by: ['errorCode'],
          where: { step: 'EXIT_FEEDBACK' },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        }),
        // Sites for filter dropdown
        prisma.site.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);

    // Resolve site names for display
    const siteIds = [...new Set(events.map((e) => e.siteId).filter(Boolean))];
    const siteMap = new Map<string, string>();
    if (siteIds.length > 0) {
      const siteRecords = await prisma.site.findMany({
        where: { id: { in: siteIds } },
        select: { id: true, name: true },
      });
      for (const s of siteRecords) {
        siteMap.set(s.id, s.name);
      }
    }

    // Format events
    const formattedEvents = events.map((e) => ({
      id: e.id,
      reason: e.errorCode || 'UNKNOWN',
      reasonLabel: REASON_LABELS[e.errorCode || ''] || e.errorCode || 'Unknown',
      comment: e.errorMessage || null,
      siteId: e.siteId,
      siteName: siteMap.get(e.siteId) || e.siteId,
      landingPage: e.landingPage || null,
      utmSource: e.utmSource || null,
      utmMedium: e.utmMedium || null,
      utmCampaign: e.utmCampaign || null,
      createdAt: e.createdAt.toISOString(),
    }));

    // Format reason breakdown for stats
    const reasons = reasonBreakdown.map((r) => ({
      reason: r.errorCode || 'UNKNOWN',
      label: REASON_LABELS[r.errorCode || ''] || r.errorCode || 'Unknown',
      count: r._count.id,
    }));

    return NextResponse.json({
      events: formattedEvents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: totalAll,
        thisWeek,
        thisMonth,
        reasons,
      },
      filters: {
        sites,
        reasons: [
          'ALL',
          'JUST_BROWSING',
          'TOO_EXPENSIVE',
          'WRONG_DESTINATION',
          'DATES_UNAVAILABLE',
          'NEED_MORE_INFO',
          'DONT_TRUST_SITE',
          'OTHER',
        ],
      },
    });
  } catch (error) {
    console.error('[Exit Feedback API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch exit feedback' }, { status: 500 });
  }
}
