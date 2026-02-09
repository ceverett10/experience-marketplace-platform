import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/search
 * Returns GSC search performance aggregated across all sites
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

    const siteMap = new Map(sites.map((s) => [s.id, s]));

    // Aggregate totals across all sites
    const totalsResult = await prisma.performanceMetric.aggregate({
      where: {
        date: { gte: start, lte: end },
        siteId: { in: sites.map((s) => s.id) },
      },
      _sum: { clicks: true, impressions: true },
    });

    const totalClicks = totalsResult._sum.clicks || 0;
    const totalImpressions = totalsResult._sum.impressions || 0;

    // Calculate weighted average position
    const positionData = await prisma.performanceMetric.findMany({
      where: {
        date: { gte: start, lte: end },
        siteId: { in: sites.map((s) => s.id) },
        impressions: { gt: 0 },
      },
      select: { position: true, impressions: true },
    });

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

    // Aggregate by site
    const bySiteMetrics = await prisma.performanceMetric.groupBy({
      by: ['siteId'],
      where: {
        date: { gte: start, lte: end },
        siteId: { in: sites.map((s) => s.id) },
      },
      _sum: { clicks: true, impressions: true },
      _avg: { position: true },
    });

    const bySite = bySiteMetrics
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
      .filter(Boolean)
      .sort((a, b) => (b?.clicks || 0) - (a?.clicks || 0));

    // Top queries across all sites
    const queryMetrics = await prisma.performanceMetric.groupBy({
      by: ['query', 'siteId'],
      where: {
        date: { gte: start, lte: end },
        siteId: { in: sites.map((s) => s.id) },
        query: { not: null },
      },
      _sum: { clicks: true, impressions: true },
      _avg: { position: true },
    });

    // Aggregate queries across sites
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

    for (const m of queryMetrics) {
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

    // Top pages across all sites
    const pageMetrics = await prisma.performanceMetric.groupBy({
      by: ['pageUrl', 'siteId'],
      where: {
        date: { gte: start, lte: end },
        siteId: { in: sites.map((s) => s.id) },
        pageUrl: { not: null },
      },
      _sum: { clicks: true, impressions: true },
      _avg: { position: true },
    });

    const topPages = pageMetrics
      .map((m) => {
        if (!m.pageUrl) return null;
        const site = siteMap.get(m.siteId);
        const clicks = m._sum.clicks || 0;
        const impressions = m._sum.impressions || 0;
        return {
          pageUrl: m.pageUrl,
          site: site?.name || 'Unknown',
          clicks,
          impressions,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          position: m._avg.position || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.impressions || 0) - (a?.impressions || 0))
      .slice(0, 50);

    // Position distribution
    const positionDistribution = {
      top3: 0,
      top10: 0,
      top20: 0,
      beyond20: 0,
    };

    for (const m of pageMetrics) {
      const pos = m._avg.position || 0;
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
