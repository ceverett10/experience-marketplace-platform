import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/analytics/sites/[id]
 * Returns detailed analytics for a single site
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id: siteId } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || getDefaultEndDate();
    const compare = searchParams.get('compare') === 'true';

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Calculate previous period for comparison
    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs);
    const prevEnd = new Date(end.getTime() - periodMs);

    // Fetch site details
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        primaryDomain: true,
        seoConfig: true,
        gscVerified: true,
        gscPropertyUrl: true,
        gscLastSyncedAt: true,
        domains: {
          where: { status: 'ACTIVE' },
          take: 1,
          select: { domain: true },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const seoConfig = (site.seoConfig as Record<string, unknown>) || {};
    const hasGA4 = !!seoConfig['ga4PropertyId'];
    const hasGSC = site.gscVerified;
    const domain = site.domains[0]?.domain || site.primaryDomain || 'No domain';

    // Fetch GA4 traffic data from snapshots (current period)
    const ga4Snapshots = await prisma.siteAnalyticsSnapshot.findMany({
      where: {
        siteId,
        date: { gte: start, lte: end },
      },
      orderBy: { date: 'asc' },
    });

    // Aggregate GA4 metrics
    const traffic = {
      users: 0,
      newUsers: 0,
      sessions: 0,
      pageviews: 0,
      bounceRate: 0,
      avgSessionDuration: 0,
      engagementRate: 0,
      bookings: 0,
      revenue: 0,
    };

    let bounceRateSum = 0;
    let engagementRateSum = 0;
    let durationSum = 0;
    let metricCount = 0;

    for (const snapshot of ga4Snapshots) {
      traffic.users += snapshot.users;
      traffic.newUsers += snapshot.newUsers;
      traffic.sessions += snapshot.sessions;
      traffic.pageviews += snapshot.pageviews;
      traffic.bookings += snapshot.bookings;
      traffic.revenue += Number(snapshot.revenue);

      if (snapshot.ga4Synced) {
        bounceRateSum += snapshot.bounceRate;
        engagementRateSum += snapshot.engagementRate;
        durationSum += snapshot.avgSessionDuration;
        metricCount++;
      }
    }

    if (metricCount > 0) {
      traffic.bounceRate = bounceRateSum / metricCount;
      traffic.avgSessionDuration = durationSum / metricCount;
      traffic.engagementRate = engagementRateSum / metricCount;
    }

    // Aggregate traffic sources from snapshots
    const sourceMap = new Map<string, { source: string; medium: string; users: number; sessions: number }>();
    for (const snapshot of ga4Snapshots) {
      const sources = snapshot.trafficSources as Array<{ source: string; medium: string; users: number; sessions: number }> | null;
      if (sources) {
        for (const s of sources) {
          const key = `${s.source}|${s.medium}`;
          const existing = sourceMap.get(key) || { source: s.source, medium: s.medium, users: 0, sessions: 0 };
          existing.users += s.users;
          existing.sessions += s.sessions;
          sourceMap.set(key, existing);
        }
      }
    }
    const sources = Array.from(sourceMap.values()).sort((a, b) => b.sessions - a.sessions).slice(0, 10);

    // Aggregate device breakdown
    const deviceMap = new Map<string, { device: string; users: number; sessions: number }>();
    for (const snapshot of ga4Snapshots) {
      const devices = snapshot.deviceBreakdown as Array<{ deviceCategory: string; users: number; sessions: number }> | null;
      if (devices) {
        for (const d of devices) {
          const existing = deviceMap.get(d.deviceCategory) || { device: d.deviceCategory, users: 0, sessions: 0 };
          existing.users += d.users;
          existing.sessions += d.sessions;
          deviceMap.set(d.deviceCategory, existing);
        }
      }
    }
    const devices = Array.from(deviceMap.values()).sort((a, b) => b.sessions - a.sessions);

    // Fetch GSC search data (current period)
    const gscMetrics = await prisma.performanceMetric.findMany({
      where: {
        siteId,
        date: { gte: start, lte: end },
      },
    });

    // Aggregate GSC totals
    const search = {
      totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      topQueries: [] as Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>,
      topPages: [] as Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>,
    };

    const queryMap = new Map<string, { clicks: number; impressions: number; positionSum: number; count: number }>();
    const pageMap = new Map<string, { clicks: number; impressions: number; positionSum: number; count: number }>();

    for (const m of gscMetrics) {
      search.totals.clicks += m.clicks;
      search.totals.impressions += m.impressions;

      if (m.query) {
        const existing = queryMap.get(m.query) || { clicks: 0, impressions: 0, positionSum: 0, count: 0 };
        existing.clicks += m.clicks;
        existing.impressions += m.impressions;
        existing.positionSum += m.position * m.impressions;
        existing.count += m.impressions;
        queryMap.set(m.query, existing);
      }

      if (m.pageUrl) {
        const existing = pageMap.get(m.pageUrl) || { clicks: 0, impressions: 0, positionSum: 0, count: 0 };
        existing.clicks += m.clicks;
        existing.impressions += m.impressions;
        existing.positionSum += m.position * m.impressions;
        existing.count += m.impressions;
        pageMap.set(m.pageUrl, existing);
      }
    }

    search.totals.ctr = search.totals.impressions > 0
      ? (search.totals.clicks / search.totals.impressions) * 100
      : 0;

    // Calculate average position
    let totalPositionWeight = 0;
    let totalWeight = 0;
    for (const m of gscMetrics) {
      totalPositionWeight += m.position * m.impressions;
      totalWeight += m.impressions;
    }
    search.totals.position = totalWeight > 0 ? totalPositionWeight / totalWeight : 0;

    // Format top queries
    search.topQueries = Array.from(queryMap.entries())
      .map(([query, stats]) => ({
        query,
        clicks: stats.clicks,
        impressions: stats.impressions,
        ctr: stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0,
        position: stats.count > 0 ? stats.positionSum / stats.count : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 20);

    // Format top pages
    search.topPages = Array.from(pageMap.entries())
      .map(([page, stats]) => ({
        page,
        clicks: stats.clicks,
        impressions: stats.impressions,
        ctr: stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0,
        position: stats.count > 0 ? stats.positionSum / stats.count : 0,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 20);

    // Comparison with previous period (if requested)
    let comparison = null;
    if (compare) {
      const prevGa4Snapshots = await prisma.siteAnalyticsSnapshot.aggregate({
        where: { siteId, date: { gte: prevStart, lte: prevEnd } },
        _sum: { users: true, sessions: true, pageviews: true },
      });

      const prevGscMetrics = await prisma.performanceMetric.aggregate({
        where: { siteId, date: { gte: prevStart, lte: prevEnd } },
        _sum: { clicks: true, impressions: true },
      });

      const prevUsers = prevGa4Snapshots._sum.users || 0;
      const prevSessions = prevGa4Snapshots._sum.sessions || 0;
      const prevClicks = prevGscMetrics._sum.clicks || 0;
      const prevImpressions = prevGscMetrics._sum.impressions || 0;

      const calcChange = (current: number, previous: number): number => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      comparison = {
        current: { users: traffic.users, sessions: traffic.sessions, clicks: search.totals.clicks },
        previous: { users: prevUsers, sessions: prevSessions, clicks: prevClicks },
        changes: {
          usersChange: calcChange(traffic.users, prevUsers),
          sessionsChange: calcChange(traffic.sessions, prevSessions),
          clicksChange: calcChange(search.totals.clicks, prevClicks),
          impressionsChange: calcChange(search.totals.impressions, prevImpressions),
        },
      };
    }

    // Identify blockers (high bounce rate pages from GA4 page reports)
    // This would require page-level GA4 data which we don't have in snapshots yet
    // For now, return empty blockers array
    const blockers: Array<{
      page: string;
      bounceRate: number;
      exits: number;
      avgTimeOnPage: number;
      issue: string;
    }> = [];

    // Build daily trend data for charts
    const dailyData = ga4Snapshots.map((s) => ({
      date: s.date.toISOString().split('T')[0],
      users: s.users,
      sessions: s.sessions,
      pageviews: s.pageviews,
    }));

    return NextResponse.json({
      site: {
        id: site.id,
        name: site.name,
        domain,
        configured: { ga4: hasGA4, gsc: hasGSC },
        gscLastSyncedAt: site.gscLastSyncedAt,
      },
      traffic: hasGA4 ? traffic : null,
      sources: hasGA4 ? sources : null,
      devices: hasGA4 ? devices : null,
      search: hasGSC ? search : null,
      comparison,
      blockers,
      dailyData,
      dateRange: { startDate, endDate },
    });
  } catch (error) {
    console.error('[Analytics Site API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch site analytics' }, { status: 500 });
  }
}

function getDefaultStartDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().split('T')[0]!;
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split('T')[0]!;
}
