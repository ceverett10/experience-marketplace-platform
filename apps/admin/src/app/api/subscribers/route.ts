import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/subscribers
 * Returns subscriber list with stats, filtering, and pagination.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const siteId = searchParams.get('siteId');
    const consentSource = searchParams.get('consentSource');
    const marketingStatus = searchParams.get('marketingStatus');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (siteId) {
      where['siteId'] = siteId;
    }
    if (consentSource && consentSource !== 'ALL') {
      where['consentSource'] = consentSource;
    }
    if (marketingStatus && marketingStatus !== 'ALL') {
      where['marketingStatus'] = marketingStatus;
    }

    // Date boundaries for stats
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    // Fetch data in parallel
    const [subscribers, total, sites, totalAll, withConsent, newThisWeek, unsubscribed] =
      await Promise.all([
        // Paginated list
        prisma.subscriber.findMany({
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
              },
            },
          },
        }),
        // Filtered count
        prisma.subscriber.count({ where }),
        // All sites for filter dropdown
        prisma.site.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        // Stats: total subscribers (unfiltered)
        prisma.subscriber.count(),
        // Stats: with marketing consent
        prisma.subscriber.count({ where: { marketingConsent: true } }),
        // Stats: new this week
        prisma.subscriber.count({ where: { createdAt: { gte: startOfWeek } } }),
        // Stats: unsubscribed
        prisma.subscriber.count({ where: { marketingStatus: 'UNSUBSCRIBED' } }),
      ]);

    // Format subscribers
    const formattedSubscribers = subscribers.map((s) => ({
      id: s.id,
      email: s.email,
      domain: s.domain,
      site: s.site
        ? {
            id: s.site.id,
            name: s.site.name,
            domain: s.site.primaryDomain || s.domain,
          }
        : null,
      consentSource: s.consentSource,
      marketingConsent: s.marketingConsent,
      marketingStatus: s.marketingStatus,
      prizeDrawStatus: s.prizeDrawStatus,
      createdAt: s.createdAt.toISOString(),
      unsubscribedAt: s.unsubscribedAt?.toISOString() || null,
    }));

    return NextResponse.json({
      subscribers: formattedSubscribers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: totalAll,
        withConsent,
        consentRate: totalAll > 0 ? Math.round((withConsent / totalAll) * 100) : 0,
        newThisWeek,
        unsubscribed,
      },
      filters: {
        sites,
        consentSources: ['ALL', 'popup', 'footer', 'checkout'],
        marketingStatuses: ['ALL', 'PENDING', 'ACTIVE', 'UNSUBSCRIBED', 'BOUNCED'],
      },
    });
  } catch (error) {
    console.error('[Subscribers API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
  }
}
