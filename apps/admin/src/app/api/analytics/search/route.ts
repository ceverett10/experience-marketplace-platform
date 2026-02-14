import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/search
 * Returns GSC search performance aggregated across all sites and microsites
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || getDefaultEndDate();

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Fetch all sites with GSC configured
    const sites = await prisma.site.findMany({
      where: {
        status: { in: ['ACTIVE', 'REVIEW'] },
        gscVerified: true,
      },
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
    });

    // Fetch all active microsites
    const microsites = await prisma.micrositeConfig.findMany({
      where: {
        status: { in: ['ACTIVE', 'REVIEW'] },
      },
      select: {
        id: true,
        siteName: true,
        fullDomain: true,
      },
    });

    const siteMap = new Map(sites.map((s) => [s.id, s]));
    const micrositeMap = new Map(microsites.map((m) => [m.id, m]));
    const siteIds = sites.map((s) => s.id);
    const micrositeIds = microsites.map((m) => m.id);

    // Aggregate totals across all sites + microsites
    const [siteTotals, micrositeTotals] = await Promise.all([
      siteIds.length > 0
        ? prisma.performanceMetric.aggregate({
            where: {
              date: { gte: start, lte: end },
              siteId: { in: siteIds },
            },
            _sum: { clicks: true, impressions: true },
          })
        : { _sum: { clicks: null, impressions: null } },
      micrositeIds.length > 0
        ? prisma.micrositePerformanceMetric.aggregate({
            where: {
              date: { gte: start, lte: end },
              micrositeId: { in: micrositeIds },
            },
            _sum: { clicks: true, impressions: true },
          })
        : { _sum: { clicks: null, impressions: null } },
    ]);

    const totalClicks = (siteTotals._sum.clicks || 0) + (micrositeTotals._sum.clicks || 0);
    const totalImpressions =
      (siteTotals._sum.impressions || 0) + (micrositeTotals._sum.impressions || 0);

    // Calculate weighted average position from both tables
    const [sitePositionData, micrositePositionData] = await Promise.all([
      siteIds.length > 0
        ? prisma.performanceMetric.findMany({
            where: {
              date: { gte: start, lte: end },
              siteId: { in: siteIds },
              impressions: { gt: 0 },
            },
            select: { position: true, impressions: true },
          })
        : [],
      micrositeIds.length > 0
        ? prisma.micrositePerformanceMetric.findMany({
            where: {
              date: { gte: start, lte: end },
              micrositeId: { in: micrositeIds },
              impressions: { gt: 0 },
            },
            select: { position: true, impressions: true },
          })
        : [],
    ]);

    const positionData = [...sitePositionData, ...micrositePositionData];

    let positionWeightedSum = 0;
    let positionWeightTotal = 0;
    for (const p of positionData) {
      positionWeightedSum += p.position * p.impressions;
      positionWeightTotal += p.impressions;
    }
    const avgPosition = positionWeightTotal > 0 ? positionWeightedSum / positionWeightTotal : 0;

    const totals = {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      avgPosition,
    };

    // Aggregate by site + microsite
    const [bySiteMetrics, byMicrositeMetrics] = await Promise.all([
      siteIds.length > 0
        ? prisma.performanceMetric.groupBy({
            by: ['siteId'],
            where: {
              date: { gte: start, lte: end },
              siteId: { in: siteIds },
            },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
          })
        : [],
      micrositeIds.length > 0
        ? prisma.micrositePerformanceMetric.groupBy({
            by: ['micrositeId'],
            where: {
              date: { gte: start, lte: end },
              micrositeId: { in: micrositeIds },
            },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
          })
        : [],
    ]);

    const bySite = [
      ...bySiteMetrics
        .map((m) => {
          const site = siteMap.get(m.siteId);
          if (!site) return null;
          const clicks = m._sum.clicks || 0;
          const impressions = m._sum.impressions || 0;
          return {
            siteId: m.siteId,
            siteName: site.name,
            domain: site.domains[0]?.domain || site.primaryDomain || 'No domain',
            clicks,
            impressions,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            position: m._avg.position || 0,
          };
        })
        .filter(Boolean),
      ...byMicrositeMetrics
        .map((m) => {
          const ms = micrositeMap.get(m.micrositeId);
          if (!ms) return null;
          const clicks = m._sum.clicks || 0;
          const impressions = m._sum.impressions || 0;
          return {
            siteId: m.micrositeId,
            siteName: ms.siteName,
            domain: ms.fullDomain,
            clicks,
            impressions,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            position: m._avg.position || 0,
          };
        })
        .filter(Boolean),
    ].sort((a, b) => (b?.clicks || 0) - (a?.clicks || 0));

    // Top queries across all sites + microsites
    const [siteQueryMetrics, micrositeQueryMetrics] = await Promise.all([
      siteIds.length > 0
        ? prisma.performanceMetric.groupBy({
            by: ['query', 'siteId'],
            where: {
              date: { gte: start, lte: end },
              siteId: { in: siteIds },
              query: { not: null },
            },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
          })
        : [],
      micrositeIds.length > 0
        ? prisma.micrositePerformanceMetric.groupBy({
            by: ['query', 'micrositeId'],
            where: {
              date: { gte: start, lte: end },
              micrositeId: { in: micrositeIds },
              query: { not: null },
            },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
          })
        : [],
    ]);

    // Aggregate queries across sites + microsites
    const queryMap = new Map<
      string,
      {
        clicks: number;
        impressions: number;
        positionSum: number;
        count: number;
        sites: Set<string>;
      }
    >();

    for (const m of siteQueryMetrics) {
      if (!m.query) continue;
      const existing = queryMap.get(m.query) || {
        clicks: 0,
        impressions: 0,
        positionSum: 0,
        count: 0,
        sites: new Set<string>(),
      };
      existing.clicks += m._sum.clicks || 0;
      existing.impressions += m._sum.impressions || 0;
      existing.positionSum += (m._avg.position || 0) * (m._sum.impressions || 1);
      existing.count += m._sum.impressions || 1;
      existing.sites.add(m.siteId);
      queryMap.set(m.query, existing);
    }

    for (const m of micrositeQueryMetrics) {
      if (!m.query) continue;
      const existing = queryMap.get(m.query) || {
        clicks: 0,
        impressions: 0,
        positionSum: 0,
        count: 0,
        sites: new Set<string>(),
      };
      existing.clicks += m._sum.clicks || 0;
      existing.impressions += m._sum.impressions || 0;
      existing.positionSum += (m._avg.position || 0) * (m._sum.impressions || 1);
      existing.count += m._sum.impressions || 1;
      existing.sites.add(m.micrositeId);
      queryMap.set(m.query, existing);
    }

    const topQueries = Array.from(queryMap.entries())
      .map(([query, stats]) => ({
        query,
        clicks: stats.clicks,
        impressions: stats.impressions,
        ctr: stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0,
        position: stats.count > 0 ? stats.positionSum / stats.count : 0,
        siteCount: stats.sites.size,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 50);

    // Top pages across all sites + microsites
    const [sitePageMetrics, micrositePageMetrics] = await Promise.all([
      siteIds.length > 0
        ? prisma.performanceMetric.groupBy({
            by: ['pageUrl', 'siteId'],
            where: {
              date: { gte: start, lte: end },
              siteId: { in: siteIds },
              pageUrl: { not: null },
            },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
          })
        : [],
      micrositeIds.length > 0
        ? prisma.micrositePerformanceMetric.groupBy({
            by: ['pageUrl', 'micrositeId'],
            where: {
              date: { gte: start, lte: end },
              micrositeId: { in: micrositeIds },
              pageUrl: { not: null },
            },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
          })
        : [],
    ]);

    const allPageEntries = [
      ...sitePageMetrics.map((m) => {
        const clicks = m._sum.clicks || 0;
        const impressions = m._sum.impressions || 0;
        return {
          pageUrl: m.pageUrl,
          site: siteMap.get(m.siteId)?.name || 'Unknown',
          clicks,
          impressions,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          position: m._avg.position || 0,
        };
      }),
      ...micrositePageMetrics.map((m) => {
        const clicks = m._sum.clicks || 0;
        const impressions = m._sum.impressions || 0;
        return {
          pageUrl: m.pageUrl,
          site: micrositeMap.get(m.micrositeId)?.siteName || 'Unknown',
          clicks,
          impressions,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          position: m._avg.position || 0,
        };
      }),
    ];

    const topPages = allPageEntries
      .filter((m) => m.pageUrl)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 50);

    // Position distribution
    const positionDistribution = {
      top3: 0,
      top10: 0,
      top20: 0,
      beyond20: 0,
    };

    for (const m of allPageEntries) {
      const pos = m.position;
      if (pos <= 3) positionDistribution.top3++;
      else if (pos <= 10) positionDistribution.top10++;
      else if (pos <= 20) positionDistribution.top20++;
      else positionDistribution.beyond20++;
    }

    return NextResponse.json({
      totals,
      bySite,
      topQueries,
      topPages,
      positionDistribution,
      dateRange: { startDate, endDate },
    });
  } catch (error) {
    console.error('[Analytics Search API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch search analytics' }, { status: 500 });
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
