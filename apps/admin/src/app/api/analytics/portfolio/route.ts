import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/portfolio
 * Returns aggregated analytics across all sites for the portfolio overview
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || getDefaultEndDate();

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Calculate previous period for comparison
    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs);
    const prevEnd = new Date(end.getTime() - periodMs);

    // Fetch all active sites with their analytics configuration
    const sites = await prisma.site.findMany({
      where: { status: { in: ['ACTIVE', 'REVIEW'] } },
      select: {
        id: true,
        name: true,
        primaryDomain: true,
        seoConfig: true,
        gscVerified: true,
        gscPropertyUrl: true,
        domains: {
          where: { status: 'ACTIVE' },
          take: 1,
          select: { domain: true },
        },
      },
    });

    // Aggregate GSC metrics from PerformanceMetric table (current period)
    const currentGscMetrics = await prisma.performanceMetric.groupBy({
      by: ['siteId'],
      where: {
        date: { gte: start, lte: end },
      },
      _sum: { clicks: true, impressions: true },
      _avg: { ctr: true, position: true },
    });

    // Aggregate GSC metrics (previous period for trends)
    const previousGscMetrics = await prisma.performanceMetric.groupBy({
      by: ['siteId'],
      where: {
        date: { gte: prevStart, lte: prevEnd },
      },
      _sum: { clicks: true, impressions: true },
    });

    // Aggregate GA4 metrics from SiteAnalyticsSnapshot (current period)
    const currentGa4Metrics = await prisma.siteAnalyticsSnapshot.groupBy({
      by: ['siteId'],
      where: {
        date: { gte: start, lte: end },
      },
      _sum: { users: true, sessions: true, pageviews: true, bookings: true, revenue: true },
      _avg: { bounceRate: true, engagementRate: true },
    });

    // Aggregate GA4 metrics (previous period for trends)
    const previousGa4Metrics = await prisma.siteAnalyticsSnapshot.groupBy({
      by: ['siteId'],
      where: {
        date: { gte: prevStart, lte: prevEnd },
      },
      _sum: { users: true, sessions: true },
    });

    // Create lookup maps for metrics
    const currentGscMap = new Map(currentGscMetrics.map((m) => [m.siteId, m]));
    const previousGscMap = new Map(previousGscMetrics.map((m) => [m.siteId, m]));
    const currentGa4Map = new Map(currentGa4Metrics.map((m) => [m.siteId, m]));
    const previousGa4Map = new Map(previousGa4Metrics.map((m) => [m.siteId, m]));

    // Calculate portfolio totals
    let totalUsers = 0;
    let totalSessions = 0;
    let totalPageviews = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalBookings = 0;
    let totalRevenue = 0;
    let prevUsers = 0;
    let prevSessions = 0;
    let prevClicks = 0;
    let prevImpressions = 0;
    let positionSum = 0;
    let positionCount = 0;

    // Build site metrics and identify unconfigured sites
    const siteMetrics: Array<{
      id: string;
      name: string;
      domain: string;
      users: number;
      sessions: number;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
      configured: { ga4: boolean; gsc: boolean };
    }> = [];

    const unconfiguredSites: Array<{
      id: string;
      name: string;
      missingGA4: boolean;
      missingGSC: boolean;
    }> = [];

    for (const site of sites) {
      const seoConfig = (site.seoConfig as Record<string, unknown>) || {};
      const hasGA4 = !!seoConfig['ga4PropertyId'];
      const hasGSC = site.gscVerified;

      const gsc = currentGscMap.get(site.id);
      const ga4 = currentGa4Map.get(site.id);
      const prevGsc = previousGscMap.get(site.id);
      const prevGa4 = previousGa4Map.get(site.id);

      // Accumulate totals
      const siteUsers = ga4?._sum.users || 0;
      const siteSessions = ga4?._sum.sessions || 0;
      const sitePageviews = ga4?._sum.pageviews || 0;
      const siteClicks = gsc?._sum.clicks || 0;
      const siteImpressions = gsc?._sum.impressions || 0;
      const sitePosition = gsc?._avg.position || 0;

      totalUsers += siteUsers;
      totalSessions += siteSessions;
      totalPageviews += sitePageviews;
      totalClicks += siteClicks;
      totalImpressions += siteImpressions;
      totalBookings += ga4?._sum.bookings || 0;
      totalRevenue += Number(ga4?._sum.revenue || 0);

      if (sitePosition > 0) {
        positionSum += sitePosition;
        positionCount++;
      }

      // Previous period totals
      prevUsers += prevGa4?._sum.users || 0;
      prevSessions += prevGa4?._sum.sessions || 0;
      prevClicks += prevGsc?._sum.clicks || 0;
      prevImpressions += prevGsc?._sum.impressions || 0;

      const domain = site.domains[0]?.domain || site.primaryDomain || 'No domain';

      siteMetrics.push({
        id: site.id,
        name: site.name,
        domain,
        users: siteUsers,
        sessions: siteSessions,
        clicks: siteClicks,
        impressions: siteImpressions,
        ctr: siteImpressions > 0 ? (siteClicks / siteImpressions) * 100 : 0,
        position: sitePosition,
        configured: { ga4: hasGA4, gsc: hasGSC },
      });

      // Track unconfigured sites
      if (!hasGA4 || !hasGSC) {
        unconfiguredSites.push({
          id: site.id,
          name: site.name,
          missingGA4: !hasGA4,
          missingGSC: !hasGSC,
        });
      }
    }

    // Sort sites by users (descending)
    siteMetrics.sort((a, b) => b.users - a.users || b.sessions - a.sessions);

    // Calculate trends
    const calcChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const trends = {
      usersChange: calcChange(totalUsers, prevUsers),
      sessionsChange: calcChange(totalSessions, prevSessions),
      clicksChange: calcChange(totalClicks, prevClicks),
      impressionsChange: calcChange(totalImpressions, prevImpressions),
    };

    // Portfolio summary
    const portfolio = {
      totalSites: sites.length,
      sitesWithGA4: sites.filter((s) => {
        const seoConfig = (s.seoConfig as Record<string, unknown>) || {};
        return !!seoConfig['ga4PropertyId'];
      }).length,
      sitesWithGSC: sites.filter((s) => s.gscVerified).length,
      totalUsers,
      totalSessions,
      totalPageviews,
      totalClicks,
      totalImpressions,
      avgCTR: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      avgPosition: positionCount > 0 ? positionSum / positionCount : 0,
      totalBookings,
      totalRevenue,
    };

    return NextResponse.json({
      portfolio,
      topSites: siteMetrics.slice(0, 20),
      trends,
      unconfiguredSites: unconfiguredSites.slice(0, 10),
      dateRange: { startDate, endDate },
    });
  } catch (error) {
    console.error('[Analytics Portfolio API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch portfolio analytics' }, { status: 500 });
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
