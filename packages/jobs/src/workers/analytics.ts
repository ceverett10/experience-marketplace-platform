import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import { createClaudeClient } from '@experience-marketplace/content-engine';
import type {
  MetricsAggregatePayload,
  PerformanceReportPayload,
  GA4SetupPayload,
  JobResult,
} from '../types/index.js';
import { getGA4Client, isGA4Configured } from '../services/ga4-client.js';

/**
 * Analytics Worker
 * Handles metrics aggregation and performance reporting
 */

interface AggregatedMetrics {
  totalImpressions: number;
  totalClicks: number;
  averageCtr: number;
  averagePosition: number;
  topQueries: Array<{ query: string; clicks: number; impressions: number }>;
  topPages: Array<{ page: string; clicks: number; impressions: number }>;
  deviceBreakdown: Record<string, number>;
  countryBreakdown: Record<string, number>;
  trend: {
    impressionsChange: number;
    clicksChange: number;
    ctrChange: number;
    positionChange: number;
  };
}

/**
 * Metrics Aggregation Handler
 * Aggregates performance metrics from raw GSC data
 */
export async function handleMetricsAggregate(
  job: Job<MetricsAggregatePayload>
): Promise<JobResult> {
  const { siteId, date, aggregationType = 'daily' } = job.data;

  try {
    console.log(
      `[Metrics Aggregate] Starting aggregation for ${siteId || 'all sites'} (${aggregationType})`
    );

    // Determine date range
    const dateRange = getDateRange(date, aggregationType);
    const previousDateRange = getPreviousDateRange(date, aggregationType);

    // Query current period metrics
    const currentMetrics = await fetchMetrics(siteId, dateRange);
    const previousMetrics = await fetchMetrics(siteId, previousDateRange);

    // Calculate aggregates
    const aggregated = calculateAggregates(currentMetrics);
    const previous = calculateAggregates(previousMetrics);

    // Calculate trends
    aggregated.trend = calculateTrends(aggregated, previous);

    // Identify performance issues
    const issues = await identifyPerformanceIssues(siteId, currentMetrics, previousMetrics);

    // Queue optimization jobs for declining pages
    for (const issue of issues) {
      if (issue.severity === 'high' && issue.pageId && issue.contentId) {
        console.log(`[Metrics Aggregate] Queuing optimization for page ${issue.pageId}`);
        // Queue CONTENT_OPTIMIZE job
        const { addJob } = await import('../queues/index.js');
        await addJob('CONTENT_OPTIMIZE', {
          siteId: issue.siteId,
          pageId: issue.pageId,
          contentId: issue.contentId,
          reason: issue.reasonType,
          performanceData: {
            ctr: issue.ctrDrop,
            position: issue.positionDrop,
          },
        });
      }
    }

    console.log(
      `[Metrics Aggregate] Completed: ${aggregated.totalClicks} clicks, ${aggregated.totalImpressions} impressions`
    );

    return {
      success: true,
      message: `Aggregated metrics for ${siteId || 'all sites'}`,
      data: {
        period: aggregationType,
        dateRange,
        metrics: aggregated,
        issuesFound: issues.length,
        optimizationsQueued: issues.filter((i) => i.severity === 'high').length,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Metrics Aggregate] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Performance Report Handler
 * Generates comprehensive performance reports with AI insights
 */
export async function handlePerformanceReport(
  job: Job<PerformanceReportPayload>
): Promise<JobResult> {
  const { siteId, reportType = 'weekly', recipients } = job.data;

  try {
    console.log(
      `[Performance Report] Generating ${reportType} report for ${siteId || 'all sites'}`
    );

    // Gather report data
    const dateRange = getDateRange(new Date(), reportType);
    const previousDateRange = getPreviousDateRange(new Date(), reportType);

    const currentMetrics = await fetchMetrics(siteId, dateRange);
    const previousMetrics = await fetchMetrics(siteId, previousDateRange);

    const aggregated = calculateAggregates(currentMetrics);
    const previous = calculateAggregates(previousMetrics);
    aggregated.trend = calculateTrends(aggregated, previous);

    // Calculate KPIs
    const kpis = {
      seo: {
        clicks: aggregated.totalClicks,
        clicksChange:
          ((aggregated.totalClicks - previous.totalClicks) / (previous.totalClicks || 1)) * 100,
        impressions: aggregated.totalImpressions,
        impressionsChange:
          ((aggregated.totalImpressions - previous.totalImpressions) /
            (previous.totalImpressions || 1)) *
          100,
        ctr: aggregated.averageCtr,
        ctrChange:
          ((aggregated.averageCtr - previous.averageCtr) / (previous.averageCtr || 1)) * 100,
        position: aggregated.averagePosition,
        positionChange:
          ((aggregated.averagePosition - previous.averagePosition) /
            (previous.averagePosition || 1)) *
          100,
        topQueries: aggregated.topQueries.slice(0, 5),
        topPages: aggregated.topPages.slice(0, 5),
      },
      content: await getContentKpis(siteId, dateRange),
      opportunities: await getOpportunityKpis(siteId, dateRange),
    };

    // Generate AI insights
    let insights: string[] = [];
    let recommendations: string[] = [];

    try {
      const aiInsights = await generateInsights(kpis, reportType);
      insights = aiInsights.insights;
      recommendations = aiInsights.recommendations;
    } catch (error) {
      console.error('[Performance Report] AI insights failed:', error);
      insights = ['AI insights temporarily unavailable'];
      recommendations = [
        'Continue monitoring SEO performance',
        'Review top performing content',
        'Optimize low CTR pages',
      ];
    }

    // Format report
    const report = {
      title: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Performance Report`,
      period: dateRange,
      generatedAt: new Date().toISOString(),
      kpis,
      insights,
      recommendations,
    };

    // Store report (for now, just log - could add Report model later)
    console.log('[Performance Report] Report generated:', report.title);
    console.log(
      `[Performance Report] KPIs: ${kpis.seo.clicks} clicks (${kpis.seo.clicksChange > 0 ? '+' : ''}${kpis.seo.clicksChange.toFixed(1)}%)`
    );

    // Send report if recipients provided
    if (recipients && recipients.length > 0) {
      console.log(`[Performance Report] Would send to: ${recipients.join(', ')}`);
      // TODO: Implement email sending when email service is configured
    }

    return {
      success: true,
      message: `Generated ${reportType} performance report`,
      data: {
        report,
        recipientsSent: recipients?.length || 0,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Performance Report] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * GA4 Setup Handler
 * Creates GA4 property and data stream for a site
 */
export async function handleGA4Setup(job: Job<GA4SetupPayload>): Promise<JobResult> {
  const { siteId, accountId } = job.data;

  try {
    console.log(`[GA4 Setup] Starting GA4 setup for site ${siteId}`);

    // Check if GA4 is configured
    if (!isGA4Configured()) {
      console.log('[GA4 Setup] GA4 credentials not configured, skipping');
      return {
        success: false,
        error: 'GA4 credentials not configured (GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY required)',
        timestamp: new Date(),
      };
    }

    // Get site details
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        slug: true,
        primaryDomain: true,
        seoConfig: true,
      },
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    // Check if GA4 is already configured
    const currentSeoConfig = (site.seoConfig as Record<string, unknown>) || {};
    if (currentSeoConfig['gaMeasurementId']) {
      console.log(
        `[GA4 Setup] Site already has GA4 configured: ${currentSeoConfig['gaMeasurementId']}`
      );
      return {
        success: true,
        message: 'GA4 already configured',
        data: {
          siteId,
          measurementId: currentSeoConfig['gaMeasurementId'] as string,
          alreadyConfigured: true,
        },
        timestamp: new Date(),
      };
    }

    // Initialize GA4 client
    const ga4Client = getGA4Client();

    // Get GA4 account to use
    let targetAccountId = accountId;
    if (!targetAccountId) {
      console.log('[GA4 Setup] No account specified, fetching available accounts...');
      const accounts = await ga4Client.listAccounts();

      if (accounts.length === 0) {
        throw new Error('No GA4 accounts available. Add service account to GA4 with Editor role.');
      }

      targetAccountId = accounts[0]?.name || '';
      console.log(`[GA4 Setup] Using first available account: ${targetAccountId}`);
    }

    // Determine website URL
    const domain = site.primaryDomain || `${site.slug}.herokuapp.com`;
    const websiteUrl = `https://${domain}`;

    // Create GA4 property and data stream
    console.log(`[GA4 Setup] Creating GA4 property for ${site.name} (${websiteUrl})...`);
    const result = await ga4Client.setupSiteAnalytics({
      accountId: targetAccountId,
      siteName: site.name,
      websiteUrl,
      timeZone: 'Europe/London',
      currencyCode: 'GBP',
    });

    if (!result.success || !result.measurementId) {
      throw new Error(result.error || 'Failed to create GA4 property');
    }

    console.log(`[GA4 Setup] GA4 property created: ${result.propertyId}`);
    console.log(`[GA4 Setup] Measurement ID: ${result.measurementId}`);

    // Update site seoConfig with measurement ID
    const updatedSeoConfig = {
      ...currentSeoConfig,
      gaMeasurementId: result.measurementId,
      ga4PropertyId: result.propertyId,
    };

    await prisma.site.update({
      where: { id: siteId },
      data: { seoConfig: updatedSeoConfig as any },
    });

    console.log(`[GA4 Setup] Site seoConfig updated with GA4 measurement ID`);

    return {
      success: true,
      message: `GA4 setup complete for ${site.name}`,
      data: {
        siteId,
        siteName: site.name,
        propertyId: result.propertyId,
        measurementId: result.measurementId,
        websiteUrl,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[GA4 Setup] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

// Helper Functions

function getDateRange(
  date: Date | string | undefined,
  type: 'daily' | 'weekly' | 'monthly'
): { start: Date; end: Date } {
  const now = date ? new Date(date) : new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (type === 'daily') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (type === 'weekly') {
    // Last 7 days
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (type === 'monthly') {
    // Last 30 days
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

function getPreviousDateRange(
  date: Date | string | undefined,
  type: 'daily' | 'weekly' | 'monthly'
): { start: Date; end: Date } {
  const current = getDateRange(date, type);
  const duration = current.end.getTime() - current.start.getTime();

  return {
    start: new Date(current.start.getTime() - duration),
    end: new Date(current.end.getTime() - duration),
  };
}

async function fetchMetrics(siteId: string | undefined, dateRange: { start: Date; end: Date }) {
  const where: any = {
    date: {
      gte: dateRange.start,
      lte: dateRange.end,
    },
  };

  if (siteId) {
    where.siteId = siteId;
  }

  return prisma.performanceMetric.findMany({
    where,
  });
}

function calculateAggregates(
  metrics: Array<{
    query: string | null;
    pageUrl: string | null;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    device: string | null;
    country: string | null;
  }>
): AggregatedMetrics {
  const totalClicks = metrics.reduce((sum, m) => sum + m.clicks, 0);
  const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0);

  // Weighted average CTR
  const averageCtr =
    totalImpressions > 0
      ? metrics.reduce((sum, m) => sum + m.ctr * m.impressions, 0) / totalImpressions
      : 0;

  // Weighted average position
  const averagePosition =
    totalImpressions > 0
      ? metrics.reduce((sum, m) => sum + m.position * m.impressions, 0) / totalImpressions
      : 0;

  // Top queries
  const queryMap = new Map<string, { clicks: number; impressions: number }>();
  metrics.forEach((m) => {
    if (!m.query) return;
    const existing = queryMap.get(m.query) || { clicks: 0, impressions: 0 };
    queryMap.set(m.query, {
      clicks: existing.clicks + m.clicks,
      impressions: existing.impressions + m.impressions,
    });
  });

  const topQueries = Array.from(queryMap.entries())
    .map(([query, stats]) => ({ query, ...stats }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  // Top pages
  const pageMap = new Map<string, { clicks: number; impressions: number }>();
  metrics.forEach((m) => {
    if (!m.pageUrl) return;
    const existing = pageMap.get(m.pageUrl) || { clicks: 0, impressions: 0 };
    pageMap.set(m.pageUrl, {
      clicks: existing.clicks + m.clicks,
      impressions: existing.impressions + m.impressions,
    });
  });

  const topPages = Array.from(pageMap.entries())
    .map(([page, stats]) => ({ page, ...stats }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  // Device breakdown
  const deviceBreakdown: Record<string, number> = {};
  metrics.forEach((m) => {
    const device = m.device || 'unknown';
    deviceBreakdown[device] = (deviceBreakdown[device] || 0) + m.clicks;
  });

  // Country breakdown
  const countryBreakdown: Record<string, number> = {};
  metrics.forEach((m) => {
    const country = m.country || 'unknown';
    countryBreakdown[country] = (countryBreakdown[country] || 0) + m.clicks;
  });

  return {
    totalImpressions,
    totalClicks,
    averageCtr,
    averagePosition,
    topQueries,
    topPages,
    deviceBreakdown,
    countryBreakdown,
    trend: {
      impressionsChange: 0,
      clicksChange: 0,
      ctrChange: 0,
      positionChange: 0,
    },
  };
}

function calculateTrends(current: AggregatedMetrics, previous: AggregatedMetrics) {
  return {
    impressionsChange:
      previous.totalImpressions > 0
        ? ((current.totalImpressions - previous.totalImpressions) / previous.totalImpressions) * 100
        : 0,
    clicksChange:
      previous.totalClicks > 0
        ? ((current.totalClicks - previous.totalClicks) / previous.totalClicks) * 100
        : 0,
    ctrChange:
      previous.averageCtr > 0
        ? ((current.averageCtr - previous.averageCtr) / previous.averageCtr) * 100
        : 0,
    positionChange:
      previous.averagePosition > 0
        ? ((current.averagePosition - previous.averagePosition) / previous.averagePosition) * 100
        : 0,
  };
}

async function identifyPerformanceIssues(
  siteId: string | undefined,
  currentMetrics: any[],
  previousMetrics: any[]
): Promise<
  Array<{
    siteId: string;
    pageId?: string;
    contentId?: string;
    pageUrl: string;
    reason: string;
    reasonType: 'low_ctr' | 'position_drop';
    severity: 'low' | 'medium' | 'high';
    ctrDrop?: number;
    positionDrop?: number;
  }>
> {
  const issues: Array<{
    siteId: string;
    pageId?: string;
    contentId?: string;
    pageUrl: string;
    reason: string;
    reasonType: 'low_ctr' | 'position_drop';
    severity: 'low' | 'medium' | 'high';
    ctrDrop?: number;
    positionDrop?: number;
  }> = [];

  // Aggregate by page
  const currentPageStats = aggregateByPage(currentMetrics);
  const previousPageStats = aggregateByPage(previousMetrics);

  // Get page details for URLs that have issues
  const pageUrls = Array.from(currentPageStats.keys());
  const pages = siteId
    ? await prisma.page.findMany({
        where: {
          siteId,
        },
        select: {
          id: true,
          slug: true,
          siteId: true,
          contentId: true,
        },
      })
    : [];

  for (const [pageUrl, current] of currentPageStats) {
    const previous = previousPageStats.get(pageUrl);
    if (!previous) continue; // New page, no comparison

    // Find matching page record
    const page = pages.find((p) => pageUrl.includes(p.slug) || p.slug === pageUrl);
    if (!page || !page.contentId) continue;

    // Check CTR drop
    const ctrDrop = ((previous.ctr - current.ctr) / previous.ctr) * 100;
    if (ctrDrop > 20 && current.impressions > 100) {
      issues.push({
        siteId: page.siteId,
        pageId: page.id,
        contentId: page.contentId,
        pageUrl,
        reason: `CTR dropped ${ctrDrop.toFixed(1)}%`,
        reasonType: 'low_ctr',
        severity: ctrDrop > 50 ? 'high' : 'medium',
        ctrDrop,
      });
    }

    // Check position drop
    const positionDrop = current.position - previous.position;
    if (positionDrop > 5 && current.impressions > 100) {
      issues.push({
        siteId: page.siteId,
        pageId: page.id,
        contentId: page.contentId,
        pageUrl,
        reason: `Position dropped ${positionDrop.toFixed(1)} places`,
        reasonType: 'position_drop',
        severity: positionDrop > 10 ? 'high' : 'medium',
        positionDrop,
      });
    }
  }

  return issues;
}

function aggregateByPage(metrics: any[]) {
  const pageMap = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }
  >();

  metrics.forEach((m) => {
    if (!m.pageUrl) return;
    const existing = pageMap.get(m.pageUrl) || {
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
    };

    const newClicks = existing.clicks + m.clicks;
    const newImpressions = existing.impressions + m.impressions;

    pageMap.set(m.pageUrl, {
      clicks: newClicks,
      impressions: newImpressions,
      ctr: newImpressions > 0 ? (newClicks / newImpressions) * 100 : 0,
      position:
        (existing.position * existing.impressions + m.position * m.impressions) / newImpressions,
    });
  });

  return pageMap;
}

async function getContentKpis(siteId: string | undefined, dateRange: { start: Date; end: Date }) {
  const where: any = {
    updatedAt: {
      gte: dateRange.start,
      lte: dateRange.end,
    },
  };

  if (siteId) {
    where.siteId = siteId;
  }

  const pages = await prisma.page.findMany({ where });

  return {
    pagesPublished: pages.filter((p) => p.status === 'PUBLISHED').length,
    pagesInReview: pages.filter((p) => p.status === 'REVIEW').length,
    pagesDraft: pages.filter((p) => p.status === 'DRAFT').length,
    totalPages: pages.length,
  };
}

async function getOpportunityKpis(
  siteId: string | undefined,
  dateRange: { start: Date; end: Date }
) {
  const where: any = {
    updatedAt: {
      gte: dateRange.start,
      lte: dateRange.end,
    },
  };

  if (siteId) {
    where.siteId = siteId;
  }

  const opportunities = await prisma.sEOOpportunity.findMany({ where });

  return {
    newOpportunities: opportunities.filter((o) => o.status === 'IDENTIFIED').length,
    inProgress: opportunities.filter((o) => o.status === 'EVALUATED').length,
    completed: opportunities.filter((o) => o.status === 'PUBLISHED').length,
    averageScore:
      opportunities.reduce((sum, o) => sum + o.priorityScore, 0) / (opportunities.length || 1),
  };
}

async function generateInsights(
  kpis: any,
  reportType: string
): Promise<{ insights: string[]; recommendations: string[] }> {
  const client = createClaudeClient({
    apiKey: process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'] || '',
  });

  const prompt = `Analyze this ${reportType} SEO performance data and provide insights:

SEO Metrics:
- Clicks: ${kpis.seo.clicks} (${kpis.seo.clicksChange > 0 ? '+' : ''}${kpis.seo.clicksChange.toFixed(1)}%)
- Impressions: ${kpis.seo.impressions} (${kpis.seo.impressionsChange > 0 ? '+' : ''}${kpis.seo.impressionsChange.toFixed(1)}%)
- CTR: ${kpis.seo.ctr.toFixed(2)}% (${kpis.seo.ctrChange > 0 ? '+' : ''}${kpis.seo.ctrChange.toFixed(1)}%)
- Avg Position: ${kpis.seo.position.toFixed(1)} (${kpis.seo.positionChange > 0 ? '+' : ''}${kpis.seo.positionChange.toFixed(1)}%)

Top Queries:
${kpis.seo.topQueries.map((q: any, i: number) => `${i + 1}. "${q.query}" - ${q.clicks} clicks`).join('\n')}

Content:
- Pages Published: ${kpis.content.pagesPublished}
- Pages In Review: ${kpis.content.pagesInReview}

Provide:
1. 3-5 key insights about the performance
2. 3-5 actionable recommendations

Format as JSON:
{
  "insights": ["insight 1", "insight 2", ...],
  "recommendations": ["rec 1", "rec 2", ...]
}`;

  const response = await client.generate({
    model: client.getModelId('sonnet'),
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1000,
    temperature: 0.7,
  });

  try {
    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        insights: parsed.insights || [],
        recommendations: parsed.recommendations || [],
      };
    }
  } catch (error) {
    console.error('[Analytics] Failed to parse AI insights:', error);
  }

  // Fallback
  return {
    insights: ['Performance data analyzed successfully'],
    recommendations: ['Continue monitoring key metrics', 'Focus on high-performing queries'],
  };
}
