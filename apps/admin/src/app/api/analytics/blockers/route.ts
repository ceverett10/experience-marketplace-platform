import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/blockers
 * Returns flow blockers (high bounce rate pages, high exit pages) across all sites
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

    const siteMap = new Map(sites.map((s) => [s.id, s]));

    // Fetch snapshots to get average bounce rate per site
    const snapshots = await prisma.siteAnalyticsSnapshot.groupBy({
      by: ['siteId'],
      where: {
        siteId: { in: ga4Sites.map((s) => s.id) },
        date: { gte: start, lte: end },
        ga4Synced: true,
      },
      _avg: { bounceRate: true, engagementRate: true },
      _sum: { sessions: true, pageviews: true },
    });

    // Identify high bounce rate sites
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

    // For now, we'll identify blockers at the site level
    // (page-level data would require GA4 API calls)
    for (const snapshot of snapshots) {
      const site = siteMap.get(snapshot.siteId);
      if (!site) continue;

      const bounceRate = snapshot._avg.bounceRate || 0;
      const engagementRate = snapshot._avg.engagementRate || 0;
      const sessions = snapshot._sum.sessions || 0;

      // Site-level bounce rate issues
      if (bounceRate > 55 && sessions > 10) {
        let severity: 'critical' | 'warning' | 'info' = 'info';
        if (bounceRate > 85) severity = 'critical';
        else if (bounceRate > 70) severity = 'warning';

        highBounce.push({
          siteId: snapshot.siteId,
          siteName: site.name,
          pagePath: '/', // Site-level metric
          pageTitle: `${site.name} (Site Average)`,
          bounceRate: bounceRate * 100, // Convert to percentage
          entrances: sessions,
          avgTimeOnPage: 0, // Would need page-level data
          severity,
        });
      }

      // Low engagement sites
      if (engagementRate < 0.45 && sessions > 10) {
        lowEngagement.push({
          siteId: snapshot.siteId,
          siteName: site.name,
          pagePath: '/',
          avgTimeOnPage: 0, // Would need page-level data
          pageviews: snapshot._sum.pageviews || 0,
        });
      }
    }

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
      totalBlockers: highBounce.length + highExit.length,
      criticalCount:
        highBounce.filter((b) => b.severity === 'critical').length +
        highExit.filter((b) => b.severity === 'critical').length,
      warningCount:
        highBounce.filter((b) => b.severity === 'warning').length +
        highExit.filter((b) => b.severity === 'warning').length,
      topAffectedSites: [
        ...new Set([
          ...highBounce.slice(0, 5).map((b) => b.siteName),
          ...highExit.slice(0, 5).map((b) => b.siteName),
        ]),
      ].slice(0, 5),
    };

    return NextResponse.json({
      highBounce: highBounce.slice(0, 20),
      highExit: highExit.slice(0, 20),
      lowEngagement: lowEngagement.slice(0, 20),
      summary,
      dateRange: { startDate, endDate },
      note: 'Site-level metrics shown. Page-level blockers require GA4 Data API integration.',
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
