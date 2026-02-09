import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/microsites
 * Returns analytics for all microsites
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || getDefaultEndDate();
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const sortBy = searchParams.get('sortBy') || 'impressions';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Calculate previous period for comparison
    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs);
    const prevEnd = new Date(end.getTime() - periodMs);

    // Fetch all active microsites
    const microsites = await prisma.micrositeConfig.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        siteName: true,
        fullDomain: true,
        subdomain: true,
        parentDomain: true,
        supplierId: true,
        productId: true,
        gscLastSyncedAt: true,
        createdAt: true,
        supplier: {
          select: { name: true },
        },
      },
    });

    // Aggregate current period GSC metrics
    const currentMetrics = await prisma.micrositePerformanceMetric.groupBy({
      by: ['micrositeId'],
      where: {
        date: { gte: start, lte: end },
      },
      _sum: { clicks: true, impressions: true },
      _avg: { ctr: true, position: true },
    });

    // Aggregate previous period GSC metrics
    const previousMetrics = await prisma.micrositePerformanceMetric.groupBy({
      by: ['micrositeId'],
      where: {
        date: { gte: prevStart, lte: prevEnd },
      },
      _sum: { clicks: true, impressions: true },
      _avg: { ctr: true, position: true },
    });

    // Get top queries and pages per microsite
    const topQueries = await prisma.micrositePerformanceMetric.groupBy({
      by: ['micrositeId', 'query'],
      where: {
        date: { gte: start, lte: end },
        query: { not: null },
      },
      _sum: { clicks: true, impressions: true },
      _avg: { position: true },
      orderBy: { _sum: { clicks: 'desc' } },
    });

    // Create lookup maps
    const currentMap = new Map(currentMetrics.map((m) => [m.micrositeId, m]));
    const previousMap = new Map(previousMetrics.map((m) => [m.micrositeId, m]));
    const queriesMap = new Map<string, typeof topQueries>();
    for (const q of topQueries) {
      const existing = queriesMap.get(q.micrositeId) || [];
      if (existing.length < 5) {
        existing.push(q);
        queriesMap.set(q.micrositeId, existing);
      }
    }

    // Calculate totals
    let totalClicks = 0;
    let totalImpressions = 0;
    let prevTotalClicks = 0;
    let prevTotalImpressions = 0;
    let positionSum = 0;
    let positionCount = 0;

    // Build microsite metrics
    const micrositeMetrics = microsites.map((ms) => {
      const current = currentMap.get(ms.id);
      const previous = previousMap.get(ms.id);
      const queries = queriesMap.get(ms.id) || [];

      const clicks = current?._sum.clicks || 0;
      const impressions = current?._sum.impressions || 0;
      const position = current?._avg.position || 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

      const prevClicks = previous?._sum.clicks || 0;
      const prevImpressions = previous?._sum.impressions || 0;

      totalClicks += clicks;
      totalImpressions += impressions;
      prevTotalClicks += prevClicks;
      prevTotalImpressions += prevImpressions;

      if (position > 0) {
        positionSum += position;
        positionCount++;
      }

      return {
        id: ms.id,
        name: ms.siteName,
        domain: ms.fullDomain,
        subdomain: ms.subdomain,
        parentDomain: ms.parentDomain,
        supplierName: ms.supplier?.name,
        gscSynced: !!ms.gscLastSyncedAt,
        gscLastSyncedAt: ms.gscLastSyncedAt,
        createdAt: ms.createdAt,
        metrics: {
          clicks,
          impressions,
          ctr,
          position,
          clicksChange: prevClicks > 0 ? Math.round(((clicks - prevClicks) / prevClicks) * 100) : 0,
          impressionsChange: prevImpressions > 0 ? Math.round(((impressions - prevImpressions) / prevImpressions) * 100) : 0,
        },
        topQueries: queries.map((q) => ({
          query: q.query,
          clicks: q._sum.clicks || 0,
          impressions: q._sum.impressions || 0,
          position: q._avg.position || 0,
        })),
      };
    });

    // Sort based on sortBy parameter
    micrositeMetrics.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortBy) {
        case 'clicks':
          aVal = a.metrics.clicks;
          bVal = b.metrics.clicks;
          break;
        case 'ctr':
          aVal = a.metrics.ctr;
          bVal = b.metrics.ctr;
          break;
        case 'position':
          aVal = a.metrics.position || 999;
          bVal = b.metrics.position || 999;
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        case 'name':
          return sortOrder === 'asc'
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        case 'impressions':
        default:
          aVal = a.metrics.impressions;
          bVal = b.metrics.impressions;
          break;
      }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Pagination
    const totalItems = micrositeMetrics.length;
    const totalPages = Math.ceil(totalItems / limit);
    const offset = (page - 1) * limit;
    const paginatedItems = micrositeMetrics.slice(offset, offset + limit);

    // Calculate summary
    const summary = {
      totalMicrosites: microsites.length,
      micrositesWithData: microsites.filter((m) => currentMap.has(m.id)).length,
      totalClicks,
      totalImpressions,
      avgCTR: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      avgPosition: positionCount > 0 ? positionSum / positionCount : 0,
      trends: {
        clicksChange: prevTotalClicks > 0 ? Math.round(((totalClicks - prevTotalClicks) / prevTotalClicks) * 100) : 0,
        impressionsChange: prevTotalImpressions > 0 ? Math.round(((totalImpressions - prevTotalImpressions) / prevTotalImpressions) * 100) : 0,
      },
    };

    return NextResponse.json({
      summary,
      microsites: paginatedItems,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
      dateRange: { startDate, endDate },
    });
  } catch (error) {
    console.error('[Analytics Microsites API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch microsite analytics' }, { status: 500 });
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
