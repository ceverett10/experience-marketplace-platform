import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/blockers
 * Returns flow blockers (high bounce rate, low CTR) across all sites AND microsites
 *
 * Severity thresholds:
 * - Critical: bounceRate > 85% or exitRate > 75%
 * - Warning: bounceRate > 70% or exitRate > 60%
 * - Info: bounceRate > 55% or exitRate > 45%
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || getDefaultEndDate();

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Fetch all sites with GA4 configured
    const sites = await prisma.site.findMany({
      where: {
        status: { in: ['ACTIVE', 'REVIEW'] },
      },
      select: {
        id: true,
        name: true,
        seoConfig: true,
      },
    });

    // Filter sites with GA4
    const ga4Sites = sites.filter((s) => {
      const seoConfig = (s.seoConfig as Record<string, unknown>) || {};
      return !!seoConfig['ga4PropertyId'];
    });

    // Build name lookup for both sites and microsites
    const nameMap = new Map(sites.map((s) => [s.id, s.name]));

    const microsites = await prisma.micrositeConfig.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, siteName: true },
    });
    for (const ms of microsites) {
      nameMap.set(ms.id, ms.siteName);
    }

    // Fetch snapshots from both sites and microsites
    const [siteSnapshots, micrositeSnapshots] = await Promise.all([
      prisma.siteAnalyticsSnapshot.groupBy({
        by: ['siteId'],
        where: {
          siteId: { in: ga4Sites.map((s) => s.id) },
          date: { gte: start, lte: end },
          ga4Synced: true,
        },
        _avg: { bounceRate: true, engagementRate: true },
        _sum: { sessions: true, pageviews: true },
      }),
      prisma.micrositeAnalyticsSnapshot.groupBy({
        by: ['micrositeId'],
        where: {
          date: { gte: start, lte: end },
          ga4Synced: true,
        },
        _avg: { bounceRate: true, engagementRate: true },
        _sum: { sessions: true, pageviews: true },
      }),
    ]);

    // Identify high bounce rate sites/microsites
    const highBounce: Array<{
      siteId: string;
      siteName: string;
      pagePath: string;
      pageTitle: string;
      bounceRate: number;
      entrances: number;
      avgTimeOnPage: number;
      severity: 'critical' | 'warning' | 'info';
    }> = [];

    const highExit: Array<{
      siteId: string;
      siteName: string;
      pagePath: string;
      pageTitle: string;
      exitRate: number;
      exits: number;
      pageviews: number;
      severity: 'critical' | 'warning' | 'info';
    }> = [];

    const lowEngagement: Array<{
      siteId: string;
      siteName: string;
      pagePath: string;
      avgTimeOnPage: number;
      pageviews: number;
    }> = [];

    // Helper to process bounce/engagement data from either source
    const processSnapshot = (
      entityId: string,
      data: {
        _avg: { bounceRate: number | null; engagementRate: number | null };
        _sum: { sessions: number | null; pageviews: number | null };
      }
    ) => {
      const name = nameMap.get(entityId);
      if (!name) return;

      const bounceRate = data._avg.bounceRate || 0;
      const engagementRate = data._avg.engagementRate || 0;
      const sessions = data._sum.sessions || 0;

      // Bounce rate issues
      if (bounceRate > 55 && sessions > 10) {
        let severity: 'critical' | 'warning' | 'info' = 'info';
        if (bounceRate > 85) severity = 'critical';
        else if (bounceRate > 70) severity = 'warning';

        highBounce.push({
          siteId: entityId,
          siteName: name,
          pagePath: '/',
          pageTitle: `${name} (Site Average)`,
          bounceRate: bounceRate * 100,
          entrances: sessions,
          avgTimeOnPage: 0,
          severity,
        });
      }

      // Low engagement
      if (engagementRate < 0.45 && sessions > 10) {
        lowEngagement.push({
          siteId: entityId,
          siteName: name,
          pagePath: '/',
          avgTimeOnPage: 0,
          pageviews: data._sum.pageviews || 0,
        });
      }
    };

    // Process site snapshots
    for (const snapshot of siteSnapshots) {
      processSnapshot(snapshot.siteId, snapshot);
    }

    // Process microsite snapshots
    for (const snapshot of micrositeSnapshots) {
      processSnapshot(snapshot.micrositeId, snapshot);
    }

    // Fetch page-level GSC metrics for low-CTR analysis (sites + microsites)
    const [siteMetrics, micrositeMetrics] = await Promise.all([
      prisma.performanceMetric.groupBy({
        by: ['pageUrl', 'siteId'],
        where: {
          date: { gte: start, lte: end },
          pageUrl: { not: null },
        },
        _sum: { clicks: true, impressions: true },
        _avg: { ctr: true, position: true },
        orderBy: { _sum: { impressions: 'desc' } },
        take: 200,
      }),
      prisma.micrositePerformanceMetric.groupBy({
        by: ['pageUrl', 'micrositeId'],
        where: {
          date: { gte: start, lte: end },
          pageUrl: { not: null },
        },
        _sum: { clicks: true, impressions: true },
        _avg: { ctr: true, position: true },
        orderBy: { _sum: { impressions: 'desc' } },
        take: 200,
      }),
    ]);

    // Identify low-CTR pages (ranking but not getting clicks)
    const lowCTR: Array<{
      siteId: string;
      siteName: string;
      pagePath: string;
      pageTitle: string;
      ctr: number;
      impressions: number;
      position: number;
      severity: 'critical' | 'warning' | 'info';
    }> = [];

    // Helper to process CTR metrics from either source
    const processCTRMetric = (
      entityId: string,
      metric: {
        pageUrl: string | null;
        _sum: { clicks: number | null; impressions: number | null };
        _avg: { ctr: number | null; position: number | null };
      }
    ) => {
      const name = nameMap.get(entityId);
      if (!name) return;

      const impressions = metric._sum.impressions || 0;
      const clicks = metric._sum.clicks || 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const position = metric._avg.position || 0;

      // Only flag pages with significant impressions but low CTR
      if (impressions >= 50 && ctr < 3) {
        let severity: 'critical' | 'warning' | 'info' = 'info';
        if (ctr < 1 && impressions >= 200) severity = 'critical';
        else if (ctr < 2 && impressions >= 100) severity = 'warning';

        lowCTR.push({
          siteId: entityId,
          siteName: name,
          pagePath: metric.pageUrl!,
          pageTitle: `${name} - ${metric.pageUrl}`,
          ctr,
          impressions,
          position,
          severity,
        });
      }
    };

    // Process site metrics
    for (const metric of siteMetrics) {
      processCTRMetric(metric.siteId, metric);
    }

    // Process microsite metrics
    for (const metric of micrositeMetrics) {
      processCTRMetric(metric.micrositeId, metric);
    }

    // Sort low CTR by severity then by impressions (biggest opportunity first)
    lowCTR.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.impressions - a.impressions;
    });

    // Sort by severity and bounce rate
    highBounce.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.bounceRate - a.bounceRate;
    });

    // Calculate summary
    const summary = {
      totalBlockers: highBounce.length + highExit.length + lowCTR.length,
      criticalCount:
        highBounce.filter((b) => b.severity === 'critical').length +
        highExit.filter((b) => b.severity === 'critical').length +
        lowCTR.filter((b) => b.severity === 'critical').length,
      warningCount:
        highBounce.filter((b) => b.severity === 'warning').length +
        highExit.filter((b) => b.severity === 'warning').length +
        lowCTR.filter((b) => b.severity === 'warning').length,
      topAffectedSites: [
        ...new Set([
          ...highBounce.slice(0, 5).map((b) => b.siteName),
          ...highExit.slice(0, 5).map((b) => b.siteName),
          ...lowCTR.slice(0, 5).map((b) => b.siteName),
        ]),
      ].slice(0, 5),
    };

    return NextResponse.json({
      highBounce: highBounce.slice(0, 20),
      highExit: highExit.slice(0, 20),
      lowEngagement: lowEngagement.slice(0, 20),
      lowCTR: lowCTR.slice(0, 20),
      summary,
      dateRange: { startDate, endDate },
    });
  } catch (error) {
    console.error('[Analytics Blockers API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch blockers analytics' }, { status: 500 });
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
