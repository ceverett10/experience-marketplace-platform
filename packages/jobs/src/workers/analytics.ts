import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import { createClaudeClient } from '@experience-marketplace/content-engine';
import type {
  MetricsAggregatePayload,
  PerformanceReportPayload,
  GA4SetupPayload,
  MicrositeGscSyncPayload,
  MicrositeAnalyticsSyncPayload,
  JobResult,
} from '../types/index.js';
import { getGA4Client, isGA4Configured } from '../services/ga4-client.js';
import { getGSCClient, isGSCConfigured } from '../services/gsc-client.js';
import { circuitBreakers } from '../errors/circuit-breaker.js';
import { toJobError } from '../errors/index.js';
import { errorTracking } from '../errors/tracking.js';

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

    // Initialize GA4 client with circuit breaker protection
    const ga4Breaker = circuitBreakers.getBreaker('ga4-api', {
      failureThreshold: 3,
      timeout: 120_000,
    });
    const ga4Client = getGA4Client();

    // Get GA4 account to use
    let targetAccountId = accountId;
    if (!targetAccountId) {
      console.log('[GA4 Setup] No account specified, fetching available accounts...');
      const accounts = await ga4Breaker.execute(() => ga4Client.listAccounts());

      if (accounts.length === 0) {
        throw new Error('No GA4 accounts available. Add service account to GA4 with Editor role.');
      }

      targetAccountId = accounts[0]?.name || '';
      console.log(`[GA4 Setup] Using first available account: ${targetAccountId}`);
    }

    // Determine website URL
    const domain = site.primaryDomain || `${site.slug}.herokuapp.com`;
    const websiteUrl = `https://${domain}`;

    // Check if a GA4 property already exists for this site name (prevents duplicates on retry)
    console.log(`[GA4 Setup] Checking for existing GA4 property named "${site.name}"...`);
    const existingProperties = await ga4Breaker.execute(() =>
      ga4Client.listProperties(targetAccountId)
    );
    const existingProp = existingProperties.find((p) => p.displayName === site.name);

    let result: { success: boolean; propertyId?: string; measurementId?: string; error?: string };

    if (existingProp) {
      // Property already exists — fetch its data stream instead of creating a duplicate
      console.log(
        `[GA4 Setup] Found existing property ${existingProp.propertyId} for "${site.name}", reusing it`
      );
      const streams = await ga4Breaker.execute(() =>
        ga4Client.listDataStreams(existingProp.propertyId)
      );
      const webStream = streams.find((s) => s.measurementId);

      if (webStream) {
        result = {
          success: true,
          propertyId: existingProp.propertyId,
          measurementId: webStream.measurementId,
        };
      } else {
        // Property exists but no data stream — create one
        console.log(`[GA4 Setup] Property exists but has no data stream, creating one...`);
        const stream = await ga4Breaker.execute(() =>
          ga4Client.createWebDataStream({
            propertyId: existingProp.propertyId,
            websiteUrl,
            displayName: `${site.name} - Web`,
          })
        );
        result = {
          success: true,
          propertyId: existingProp.propertyId,
          measurementId: stream.measurementId,
        };
      }
    } else {
      // No existing property — create new one
      console.log(`[GA4 Setup] Creating GA4 property for ${site.name} (${websiteUrl})...`);
      result = await ga4Breaker.execute(() =>
        ga4Client.setupSiteAnalytics({
          accountId: targetAccountId,
          siteName: site.name,
          websiteUrl,
          timeZone: 'Europe/London',
          currencyCode: 'GBP',
        })
      );
    }

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
    const jobError = toJobError(error);
    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'GA4_SETUP',
      siteId,
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { accountId },
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });
    console.error('[GA4 Setup] Error:', jobError.message);

    if (jobError.retryable) {
      throw new Error(jobError.message);
    }

    return {
      success: false,
      error: jobError.message,
      errorCategory: jobError.category,
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
    if (!page || !page.contentId || !page.siteId) continue;

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
    model: client.getModelId('haiku'), // Changed from 'sonnet' for cost reduction
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

// ============================================================================
// GA4 DAILY SYNC HANDLERS
// ============================================================================

/**
 * GA4 Daily Sync Handler
 * Syncs GA4 traffic data for all sites into SiteAnalyticsSnapshot
 */
export async function handleGA4DailySync(job: Job): Promise<JobResult> {
  try {
    console.log('[GA4 Daily Sync] Starting sync for all sites');

    if (!isGA4Configured()) {
      console.log('[GA4 Daily Sync] GA4 not configured, skipping');
      return {
        success: false,
        error: 'GA4 not configured',
        timestamp: new Date(),
      };
    }

    // Get all active sites with GA4 configured
    const sites = await prisma.site.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        seoConfig: true,
      },
    });

    // Calculate yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ga4Client = getGA4Client();
    const yesterdayStr = yesterday.toISOString().split('T')[0]!;

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const site of sites) {
      const seoConfig = (site.seoConfig as Record<string, unknown>) || {};
      const ga4PropertyId = seoConfig['ga4PropertyId'] as string | undefined;

      if (!ga4PropertyId) {
        skipped++;
        continue;
      }

      try {
        // Get traffic report from GA4
        console.log(`[GA4 Daily Sync] Fetching data for ${site.name} (property: ${ga4PropertyId})`);
        const traffic = await ga4Client.getTrafficReport(ga4PropertyId, yesterdayStr, yesterdayStr);
        const sources = await ga4Client.getSourceReport(ga4PropertyId, yesterdayStr, yesterdayStr);
        const devices = await ga4Client.getDeviceReport(ga4PropertyId, yesterdayStr, yesterdayStr);

        console.log(`[GA4 Daily Sync] ${site.name}: users=${traffic?.totalUsers || 0}, sessions=${traffic?.sessions || 0}, pageviews=${traffic?.pageviews || 0}`);

        // Get booking data for yesterday (if Booking model exists)
        let bookingCount = 0;
        let bookingRevenue = 0;
        try {
          const bookings = await (prisma as any).booking?.aggregate({
            where: {
              siteId: site.id,
              createdAt: {
                gte: yesterday,
                lt: today,
              },
            },
            _count: true,
            _sum: { totalAmount: true },
          });
          if (bookings) {
            bookingCount = bookings._count || 0;
            bookingRevenue = bookings._sum?.totalAmount || 0;
          }
        } catch {
          // Booking model might not exist, that's OK
        }

        // Upsert the snapshot
        await prisma.siteAnalyticsSnapshot.upsert({
          where: {
            siteId_date: {
              siteId: site.id,
              date: yesterday,
            },
          },
          update: {
            users: traffic?.totalUsers || 0,
            newUsers: traffic?.newUsers || 0,
            sessions: traffic?.sessions || 0,
            pageviews: traffic?.pageviews || 0,
            bounceRate: traffic?.bounceRate || 0,
            avgSessionDuration: traffic?.avgSessionDuration || 0,
            engagementRate: traffic?.engagementRate || 0,
            trafficSources: sources as any,
            deviceBreakdown: devices as any,
            bookings: bookingCount,
            revenue: bookingRevenue,
            ga4Synced: true,
            updatedAt: new Date(),
          },
          create: {
            siteId: site.id,
            date: yesterday,
            users: traffic?.totalUsers || 0,
            newUsers: traffic?.newUsers || 0,
            sessions: traffic?.sessions || 0,
            pageviews: traffic?.pageviews || 0,
            bounceRate: traffic?.bounceRate || 0,
            avgSessionDuration: traffic?.avgSessionDuration || 0,
            engagementRate: traffic?.engagementRate || 0,
            trafficSources: sources as any,
            deviceBreakdown: devices as any,
            bookings: bookingCount,
            revenue: bookingRevenue,
            ga4Synced: true,
          },
        });

        synced++;
      } catch (error) {
        console.error(`[GA4 Daily Sync] Error syncing ${site.name}:`, error);
        errors++;
      }
    }

    console.log(
      `[GA4 Daily Sync] Complete: ${synced} synced, ${skipped} skipped, ${errors} errors`
    );

    return {
      success: true,
      message: `Synced GA4 data for ${synced} sites`,
      data: { synced, skipped, errors, date: yesterdayStr },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[GA4 Daily Sync] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Refresh Analytics Views Handler
 * Refreshes materialized views for the analytics dashboard
 */
export async function handleRefreshAnalyticsViews(job: Job): Promise<JobResult> {
  try {
    console.log('[Refresh Analytics Views] Refreshing materialized views');

    // Refresh the site daily GSC view
    try {
      await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_site_daily_gsc`;
      console.log('[Refresh Analytics Views] Refreshed mv_site_daily_gsc');
    } catch (error) {
      // View might not exist yet
      console.log('[Refresh Analytics Views] mv_site_daily_gsc does not exist, skipping');
    }

    // Refresh the portfolio weekly view
    try {
      await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_portfolio_weekly`;
      console.log('[Refresh Analytics Views] Refreshed mv_portfolio_weekly');
    } catch (error) {
      // View might not exist yet
      console.log('[Refresh Analytics Views] mv_portfolio_weekly does not exist, skipping');
    }

    // Refresh the microsite daily GSC view
    try {
      await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_microsite_daily_gsc`;
      console.log('[Refresh Analytics Views] Refreshed mv_microsite_daily_gsc');
    } catch (error) {
      // View might not exist yet
      console.log('[Refresh Analytics Views] mv_microsite_daily_gsc does not exist, skipping');
    }

    return {
      success: true,
      message: 'Refreshed analytics materialized views',
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Refresh Analytics Views] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

// ============================================================================
// MICROSITE ANALYTICS HANDLERS
// ============================================================================

const MICROSITE_PARENT_DOMAIN = 'experiencess.com';
const MICROSITE_GSC_DOMAIN_PROPERTY = `sc-domain:${MICROSITE_PARENT_DOMAIN}`;

/**
 * Microsite GSC Sync Handler
 * Syncs GSC performance data for all microsites from the parent domain property
 */
export async function handleMicrositeGscSync(
  job: Job<MicrositeGscSyncPayload>
): Promise<JobResult> {
  const { micrositeId, startDate, endDate } = job.data;

  try {
    console.log(
      `[Microsite GSC Sync] Starting sync${micrositeId ? ` for ${micrositeId}` : ' for all microsites'}`
    );

    if (!isGSCConfigured()) {
      console.log('[Microsite GSC Sync] GSC not configured, skipping');
      return {
        success: false,
        error: 'GSC not configured',
        timestamp: new Date(),
      };
    }

    // Calculate date range (default: last 7 days)
    const end = endDate || new Date().toISOString().split('T')[0]!;
    const start =
      startDate ||
      (() => {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        return date.toISOString().split('T')[0]!;
      })();

    // Get active microsites
    const micrositeWhere: any = {
      parentDomain: MICROSITE_PARENT_DOMAIN,
      status: 'ACTIVE',
    };
    if (micrositeId) {
      micrositeWhere.id = micrositeId;
    }

    const microsites = await prisma.micrositeConfig.findMany({
      where: micrositeWhere,
      select: {
        id: true,
        fullDomain: true,
        subdomain: true,
        siteName: true,
      },
    });

    console.log(`[Microsite GSC Sync] Found ${microsites.length} microsites to sync`);

    if (microsites.length === 0) {
      return {
        success: true,
        message: 'No active microsites to sync',
        timestamp: new Date(),
      };
    }

    // Query GSC for all data from the domain property
    const gscClient = getGSCClient();
    console.log(
      `[Microsite GSC Sync] Querying ${MICROSITE_GSC_DOMAIN_PROPERTY} for ${start} to ${end}`
    );

    const response = await gscClient.querySearchAnalytics({
      siteUrl: MICROSITE_GSC_DOMAIN_PROPERTY,
      startDate: start,
      endDate: end,
      dimensions: ['page', 'query', 'device', 'country'],
      rowLimit: 25000,
    });

    console.log(`[Microsite GSC Sync] Retrieved ${response.rows?.length || 0} rows from GSC`);

    // Create a map of subdomain -> microsite for quick lookup
    const micrositeMap = new Map(microsites.map((m) => [m.fullDomain, m]));

    // Group GSC data by microsite
    const micrositeMetrics = new Map<
      string,
      Array<{
        date: Date;
        query?: string;
        pageUrl?: string;
        device?: string;
        country?: string;
        impressions: number;
        clicks: number;
        ctr: number;
        position: number;
      }>
    >();

    for (const row of response.rows || []) {
      const pageUrl = row.keys?.[0] || '';

      // Extract subdomain from URL (e.g., "https://adventure-co.experiencess.com/..." -> "adventure-co.experiencess.com")
      let domain: string | null = null;
      try {
        const url = new URL(pageUrl);
        domain = url.hostname;
      } catch {
        continue; // Skip invalid URLs
      }

      const microsite = micrositeMap.get(domain);
      if (!microsite) continue; // Not a microsite URL

      const metrics = micrositeMetrics.get(microsite.id) || [];
      metrics.push({
        date: new Date(start),
        query: row.keys?.[1] || undefined,
        pageUrl: pageUrl,
        device: row.keys?.[2] || undefined,
        country: row.keys?.[3] || undefined,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr * 100,
        position: row.position,
      });
      micrositeMetrics.set(microsite.id, metrics);
    }

    console.log(`[Microsite GSC Sync] Matched data for ${micrositeMetrics.size} microsites`);

    // Store metrics for each microsite
    let totalStored = 0;
    let errors = 0;

    for (const [msId, metrics] of micrositeMetrics) {
      try {
        // Delete existing metrics for this microsite/date and bulk insert new ones
        // This is more efficient than individual upserts with nullable compound keys
        const dates = [...new Set(metrics.map((m) => m.date.toISOString().split('T')[0]!))];

        for (const dateStr of dates) {
          const dateMetrics = metrics.filter((m) => m.date.toISOString().split('T')[0] === dateStr);
          const targetDate = new Date(dateStr!);

          // Delete old metrics for this date
          await prisma.micrositePerformanceMetric.deleteMany({
            where: {
              micrositeId: msId,
              date: targetDate,
            },
          });

          // Bulk insert new metrics
          await prisma.micrositePerformanceMetric.createMany({
            data: dateMetrics.map((metric) => ({
              micrositeId: msId,
              date: metric.date,
              query: metric.query ?? null,
              pageUrl: metric.pageUrl ?? null,
              device: metric.device ?? null,
              country: metric.country ?? null,
              impressions: metric.impressions,
              clicks: metric.clicks,
              ctr: metric.ctr,
              position: metric.position,
            })),
            skipDuplicates: true,
          });

          totalStored += dateMetrics.length;
        }

        // Update microsite's last synced timestamp
        await prisma.micrositeConfig.update({
          where: { id: msId },
          data: { gscLastSyncedAt: new Date() },
        });
      } catch (error) {
        console.error(`[Microsite GSC Sync] Error storing metrics for ${msId}:`, error);
        errors++;
      }
    }

    console.log(`[Microsite GSC Sync] Stored ${totalStored} metrics, ${errors} errors`);

    return {
      success: true,
      message: `Synced GSC data for ${micrositeMetrics.size} microsites`,
      data: {
        micrositesSynced: micrositeMetrics.size,
        metricsStored: totalStored,
        errors,
        dateRange: { start, end },
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Microsite GSC Sync] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Microsite Analytics Sync Handler
 * Creates daily analytics snapshots for microsites (aggregates GSC data)
 */
export async function handleMicrositeAnalyticsSync(
  job: Job<MicrositeAnalyticsSyncPayload>
): Promise<JobResult> {
  const { micrositeId, date } = job.data;

  try {
    console.log(
      `[Microsite Analytics Sync] Starting sync${micrositeId ? ` for ${micrositeId}` : ' for all microsites'}`
    );

    // Calculate target date (default: yesterday)
    const targetDate = date
      ? new Date(date)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - 1);
          return d;
        })();

    const dateStr = targetDate.toISOString().split('T')[0]!;
    const startOfDay = new Date(dateStr);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);

    // Get active microsites
    const micrositeWhere: any = {
      parentDomain: MICROSITE_PARENT_DOMAIN,
      status: 'ACTIVE',
    };
    if (micrositeId) {
      micrositeWhere.id = micrositeId;
    }

    const microsites = await prisma.micrositeConfig.findMany({
      where: micrositeWhere,
      select: {
        id: true,
        fullDomain: true,
        siteName: true,
      },
    });

    console.log(
      `[Microsite Analytics Sync] Creating snapshots for ${microsites.length} microsites for ${dateStr}`
    );

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const microsite of microsites) {
      try {
        // Aggregate GSC metrics for this microsite and date
        const gscMetrics = await prisma.micrositePerformanceMetric.aggregate({
          where: {
            micrositeId: microsite.id,
            date: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
          _sum: {
            clicks: true,
            impressions: true,
          },
          _avg: {
            ctr: true,
            position: true,
          },
        });

        const totalClicks = gscMetrics._sum.clicks || 0;
        const totalImpressions = gscMetrics._sum.impressions || 0;
        const avgCtr = gscMetrics._avg.ctr || 0;
        const avgPosition = gscMetrics._avg.position || 0;

        // Upsert the snapshot
        const result = await prisma.micrositeAnalyticsSnapshot.upsert({
          where: {
            micrositeId_date: {
              micrositeId: microsite.id,
              date: startOfDay,
            },
          },
          update: {
            totalClicks,
            totalImpressions,
            avgCtr,
            avgPosition,
            gscSynced: totalImpressions > 0,
            updatedAt: new Date(),
          },
          create: {
            micrositeId: microsite.id,
            date: startOfDay,
            totalClicks,
            totalImpressions,
            avgCtr,
            avgPosition,
            gscSynced: totalImpressions > 0,
          },
        });

        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
          created++;
        } else {
          updated++;
        }
      } catch (error) {
        console.error(`[Microsite Analytics Sync] Error for ${microsite.id}:`, error);
        errors++;
      }
    }

    console.log(
      `[Microsite Analytics Sync] Created ${created}, updated ${updated}, errors ${errors}`
    );

    return {
      success: true,
      message: `Created/updated ${created + updated} microsite analytics snapshots`,
      data: {
        date: dateStr,
        created,
        updated,
        errors,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Microsite Analytics Sync] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}
