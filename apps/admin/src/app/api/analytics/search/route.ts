import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Relational filters that push filtering into SQL subqueries instead of
 * passing thousands of IDs as bind variables (Postgres limit: 32,767).
 */
const SITE_FILTER = { site: { status: { in: ['ACTIVE', 'REVIEW'] }, gscVerified: true } };
const MICROSITE_FILTER = { microsite: { status: { in: ['ACTIVE', 'REVIEW'] } } };

/**
 * GET /api/analytics/search
 * Returns GSC search performance aggregated across all sites and microsites.
 *
 * Optimised to run within Heroku's 30s HTTP timeout by:
 * - Using relational where filters (SQL subquery) instead of { in: [...ids] }
 * - Using aggregate() instead of findMany() for position stats
 * - Adding orderBy + take limits to expensive groupBy queries
 * - Running queries in sequential batches to avoid connection pool exhaustion
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || getDefaultEndDate();

    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateFilter = { gte: start, lte: end };

    // Fetch sites + microsites for name resolution (lightweight, small result sets)
    const [sites, microsites] = await Promise.all([
      prisma.site.findMany({
        where: { status: { in: ['ACTIVE', 'REVIEW'] }, gscVerified: true },
        select: {
          id: true,
          name: true,
          primaryDomain: true,
          domains: { where: { status: 'ACTIVE' }, take: 1, select: { domain: true } },
        },
      }),
      prisma.micrositeConfig.findMany({
        where: { status: { in: ['ACTIVE', 'REVIEW'] } },
        select: { id: true, siteName: true, fullDomain: true },
      }),
    ]);

    const siteMap = new Map(sites.map((s) => [s.id, s]));
    const micrositeMap = new Map(microsites.map((m) => [m.id, m]));

    const emptySum = { _sum: { clicks: null, impressions: null } };
    const emptyPosAgg = { _avg: { position: null }, _sum: { impressions: null } };

    // Batch 1: Totals + position aggregates (4 lightweight queries)
    const [siteTotals, micrositeTotals, sitePositionAgg, micrositePositionAgg] = await Promise.all([
      sites.length > 0
        ? prisma.performanceMetric.aggregate({
            where: { date: dateFilter, ...SITE_FILTER },
            _sum: { clicks: true, impressions: true },
          })
        : emptySum,
      microsites.length > 0
        ? prisma.micrositePerformanceMetric.aggregate({
            where: { date: dateFilter, ...MICROSITE_FILTER },
            _sum: { clicks: true, impressions: true },
          })
        : emptySum,
      sites.length > 0
        ? prisma.performanceMetric.aggregate({
            where: { date: dateFilter, ...SITE_FILTER, impressions: { gt: 0 } },
            _avg: { position: true },
            _sum: { impressions: true },
          })
        : emptyPosAgg,
      microsites.length > 0
        ? prisma.micrositePerformanceMetric.aggregate({
            where: { date: dateFilter, ...MICROSITE_FILTER, impressions: { gt: 0 } },
            _avg: { position: true },
            _sum: { impressions: true },
          })
        : emptyPosAgg,
    ]);

    // Batch 2: Per-site groupBy (2 queries)
    const [bySiteMetrics, byMicrositeMetrics] = await Promise.all([
      sites.length > 0
        ? prisma.performanceMetric.groupBy({
            by: ['siteId'],
            where: { date: dateFilter, ...SITE_FILTER },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
          })
        : [],
      microsites.length > 0
        ? prisma.micrositePerformanceMetric.groupBy({
            by: ['micrositeId'],
            where: { date: dateFilter, ...MICROSITE_FILTER },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
          })
        : [],
    ]);

    // Batch 3: Top queries (2 heavy groupBy queries)
    const [siteQueryMetrics, micrositeQueryMetrics] = await Promise.all([
      sites.length > 0
        ? prisma.performanceMetric.groupBy({
            by: ['query', 'siteId'],
            where: { date: dateFilter, ...SITE_FILTER, query: { not: null } },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
            orderBy: { _sum: { clicks: 'desc' } },
            take: 100,
          })
        : [],
      microsites.length > 0
        ? prisma.micrositePerformanceMetric.groupBy({
            by: ['query', 'micrositeId'],
            where: { date: dateFilter, ...MICROSITE_FILTER, query: { not: null } },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
            orderBy: { _sum: { clicks: 'desc' } },
            take: 100,
          })
        : [],
    ]);

    // Batch 4: Top pages (2 heavy groupBy queries)
    const [sitePageMetrics, micrositePageMetrics] = await Promise.all([
      sites.length > 0
        ? prisma.performanceMetric.groupBy({
            by: ['pageUrl', 'siteId'],
            where: { date: dateFilter, ...SITE_FILTER, pageUrl: { not: null } },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
            orderBy: { _sum: { impressions: 'desc' } },
            take: 100,
          })
        : [],
      microsites.length > 0
        ? prisma.micrositePerformanceMetric.groupBy({
            by: ['pageUrl', 'micrositeId'],
            where: { date: dateFilter, ...MICROSITE_FILTER, pageUrl: { not: null } },
            _sum: { clicks: true, impressions: true },
            _avg: { position: true },
            orderBy: { _sum: { impressions: 'desc' } },
            take: 100,
          })
        : [],
    ]);

    // Totals
    const totalClicks = (siteTotals._sum.clicks || 0) + (micrositeTotals._sum.clicks || 0);
    const totalImpressions =
      (siteTotals._sum.impressions || 0) + (micrositeTotals._sum.impressions || 0);

    // Weighted average position from aggregates
    const siteAvgPos = sitePositionAgg._avg?.position || 0;
    const siteImp = sitePositionAgg._sum?.impressions || 0;
    const msAvgPos = micrositePositionAgg._avg?.position || 0;
    const msImp = micrositePositionAgg._sum?.impressions || 0;
    const totalPosWeight = siteImp + msImp;
    const avgPosition =
      totalPosWeight > 0 ? (siteAvgPos * siteImp + msAvgPos * msImp) / totalPosWeight : 0;

    const totals = {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      avgPosition,
    };

    // By site
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

    // Aggregate queries across sites + microsites
    const queryMap = new Map<
      string,
      { clicks: number; impressions: number; positionSum: number; count: number }
    >();

    for (const m of siteQueryMetrics) {
      if (!m.query) continue;
      const existing = queryMap.get(m.query) || {
        clicks: 0,
        impressions: 0,
        positionSum: 0,
        count: 0,
      };
      existing.clicks += m._sum.clicks || 0;
      existing.impressions += m._sum.impressions || 0;
      existing.positionSum += (m._avg.position || 0) * (m._sum.impressions || 1);
      existing.count += m._sum.impressions || 1;
      queryMap.set(m.query, existing);
    }

    for (const m of micrositeQueryMetrics) {
      if (!m.query) continue;
      const existing = queryMap.get(m.query) || {
        clicks: 0,
        impressions: 0,
        positionSum: 0,
        count: 0,
      };
      existing.clicks += m._sum.clicks || 0;
      existing.impressions += m._sum.impressions || 0;
      existing.positionSum += (m._avg.position || 0) * (m._sum.impressions || 1);
      existing.count += m._sum.impressions || 1;
      queryMap.set(m.query, existing);
    }

    const topQueries = Array.from(queryMap.entries())
      .map(([query, stats]) => ({
        query,
        clicks: stats.clicks,
        impressions: stats.impressions,
        ctr: stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0,
        position: stats.count > 0 ? stats.positionSum / stats.count : 0,
        siteCount: 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 50);

    // Top pages
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

    // Position distribution from the bounded page entries
    const positionDistribution = { top3: 0, top10: 0, top20: 0, beyond20: 0 };
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
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[Analytics Search API] Error:', message);
    if (stack) console.error('[Analytics Search API] Stack:', stack);
    return NextResponse.json(
      { error: 'Failed to fetch search analytics', detail: message },
      { status: 500 }
    );
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
