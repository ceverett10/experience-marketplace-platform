import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import { getGSCClient, isGSCConfigured } from '../services/gsc-client';
import type { GscSyncPayload, JobResult, ContentOptimizePayload } from '../types';
import { addJob } from '../queues';

/**
 * Google Search Console Sync Worker
 * Fetches performance data from GSC API and stores in database
 */
export async function handleGscSync(job: Job<GscSyncPayload>): Promise<JobResult> {
  const { siteId, startDate, endDate, dimensions } = job.data;

  try {
    console.log(`[GSC Sync] Starting sync for site ${siteId}`);

    // Verify site exists
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { domains: true },
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    // Get primary domain
    const primaryDomain = site.domains.find(
      (d: { domain: string }) => d.domain === site.primaryDomain
    );
    if (!primaryDomain) {
      console.warn(`[GSC Sync] No primary domain found for site ${siteId}, skipping`);
      return {
        success: true,
        message: 'No primary domain configured, skipping GSC sync',
        timestamp: new Date(),
      };
    }

    // Check if GSC is configured
    if (!isGSCConfigured()) {
      console.warn('[GSC Sync] GSC not configured, skipping sync');
      return {
        success: true,
        message: 'GSC not configured (missing credentials)',
        timestamp: new Date(),
      };
    }

    // Fetch data from Google Search Console
    const gscData = await fetchGscData(primaryDomain.domain, startDate, endDate, dimensions);

    // Store performance metrics
    const metricsCreated = await Promise.all(
      gscData.map((metric) =>
        prisma.performanceMetric.upsert({
          where: {
            siteId_date_query_pageUrl_device_country: {
              siteId,
              date: metric.date,
              query: metric.query || '',
              pageUrl: metric.pageUrl || '',
              device: metric.device || 'DESKTOP',
              country: metric.country || 'US',
            },
          },
          create: {
            siteId,
            date: metric.date,
            query: metric.query,
            pageUrl: metric.pageUrl,
            device: metric.device,
            country: metric.country,
            impressions: metric.impressions,
            clicks: metric.clicks,
            ctr: metric.ctr,
            position: metric.position,
          },
          update: {
            impressions: metric.impressions,
            clicks: metric.clicks,
            ctr: metric.ctr,
            position: metric.position,
          },
        })
      )
    );

    console.log(`[GSC Sync] Success! Synced ${metricsCreated.length} metrics for site ${siteId}`);

    // Check for performance issues that need optimization
    await detectPerformanceIssues(siteId);

    return {
      success: true,
      message: `Synced ${metricsCreated.length} performance metrics`,
      data: {
        metricsCount: metricsCreated.length,
        dateRange: { startDate, endDate },
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[GSC Sync] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Fetch GSC data using real Google Search Console API
 */
async function fetchGscData(
  domain: string,
  startDate?: string,
  endDate?: string,
  dimensions?: ('query' | 'page' | 'country' | 'device')[]
): Promise<
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
> {
  const gscClient = getGSCClient();

  // Calculate date range (default: last 7 days)
  const end = endDate || new Date().toISOString().split('T')[0]!;
  const start =
    startDate ||
    (() => {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      return date.toISOString().split('T')[0]!;
    })();

  // Ensure domain has correct format for GSC (sc-domain: or https://)
  let siteUrl = domain;
  if (!domain.startsWith('http') && !domain.startsWith('sc-domain:')) {
    siteUrl = `https://${domain}`;
  }

  console.log(`[GSC] Fetching data for ${siteUrl} from ${start} to ${end}`);

  try {
    // Query GSC API
    const response = await gscClient.querySearchAnalytics({
      siteUrl,
      startDate: start,
      endDate: end,
      dimensions: dimensions || ['query', 'page', 'country', 'device'],
      rowLimit: 25000,
    });

    // Transform GSC data to our format
    const metrics: Array<{
      date: Date;
      query?: string;
      pageUrl?: string;
      device?: string;
      country?: string;
      impressions: number;
      clicks: number;
      ctr: number;
      position: number;
    }> = [];

    for (const row of response.rows) {
      // GSC returns keys in same order as dimensions
      const dimValues = dimensions || ['query', 'page', 'country', 'device'];
      const keys = row.keys || [];

      metrics.push({
        date: new Date(start), // Use start date for now; could be more granular with date dimension
        query: dimValues[0] === 'query' ? keys[0] : undefined,
        pageUrl: dimValues.includes('page') ? keys[dimValues.indexOf('page')] : undefined,
        country: dimValues.includes('country') ? keys[dimValues.indexOf('country')] : undefined,
        device: dimValues.includes('device') ? keys[dimValues.indexOf('device')] : undefined,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr * 100, // Convert to percentage
        position: row.position,
      });
    }

    console.log(`[GSC] Fetched ${metrics.length} metrics from GSC API`);
    return metrics;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GSC] Error fetching data from GSC:`, errorMessage);

    // If error is authentication-related, return empty array
    if (errorMessage.includes('auth') || errorMessage.includes('credential')) {
      console.warn('[GSC] Authentication error - check GSC credentials');
      return [];
    }

    throw error;
  }
}

/**
 * Detect performance issues that trigger optimization jobs
 */
async function detectPerformanceIssues(siteId: string): Promise<void> {
  // Get recent metrics (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const metrics = await prisma.performanceMetric.findMany({
    where: {
      siteId,
      date: { gte: sevenDaysAgo },
      pageUrl: { not: null },
    },
  });

  // Group by page URL
  const pageMetrics = new Map<string, typeof metrics>();
  for (const metric of metrics) {
    const url = metric.pageUrl || '';
    if (!pageMetrics.has(url)) {
      pageMetrics.set(url, []);
    }
    pageMetrics.get(url)!.push(metric);
  }

  // Track queued optimizations to avoid duplicates
  const queuedPages = new Set<string>();

  // Check each page for issues
  for (const [pageUrl, pageData] of pageMetrics) {
    const avgCtr =
      pageData.reduce((sum: number, m: { ctr: number }) => sum + m.ctr, 0) / pageData.length;
    const avgPosition =
      pageData.reduce((sum: number, m: { position: number }) => sum + m.position, 0) /
      pageData.length;

    let issueType: 'low_ctr' | 'position_drop' | null = null;
    let performanceData: { ctr?: number; position?: number } = {};

    // Low CTR for pages ranking 1-10
    if (avgPosition <= 10 && avgCtr < 2.0) {
      console.log(`[GSC] Performance Issue: Low CTR (${avgCtr.toFixed(2)}%) for ${pageUrl}`);
      issueType = 'low_ctr';
      performanceData = { ctr: avgCtr, position: avgPosition };
    }

    // Check for position drops
    if (pageData.length >= 6) {
      const recentPosition =
        pageData.slice(-3).reduce((sum: number, m: { position: number }) => sum + m.position, 0) / 3;
      const olderPosition =
        pageData.slice(0, 3).reduce((sum: number, m: { position: number }) => sum + m.position, 0) /
        3;
      const positionDrop = recentPosition - olderPosition;

      if (positionDrop > 5) {
        console.log(
          `[GSC] Performance Issue: Position drop of ${positionDrop.toFixed(1)} for ${pageUrl}`
        );
        issueType = 'position_drop';
        performanceData = { position: recentPosition };
      }
    }

    // Queue CONTENT_OPTIMIZE job if issue detected and not already queued
    if (issueType && !queuedPages.has(pageUrl)) {
      try {
        // Find the page by URL pattern (slug)
        const urlPath = new URL(pageUrl).pathname;
        const slug = urlPath.replace(/^\//, '').replace(/\/$/, '') || '';

        const page = await prisma.page.findFirst({
          where: {
            siteId,
            slug,
          },
          include: {
            content: true,
          },
        });

        if (page && page.content) {
          const payload: ContentOptimizePayload = {
            siteId,
            pageId: page.id,
            contentId: page.content.id,
            reason: issueType,
            performanceData,
          };

          const jobId = await addJob('CONTENT_OPTIMIZE', payload, {
            priority: 4, // Medium-high priority
          });

          console.log(`[GSC] Queued CONTENT_OPTIMIZE job ${jobId} for page ${page.id} (${issueType})`);
          queuedPages.add(pageUrl);
        } else {
          console.log(`[GSC] Could not find page or content for URL: ${pageUrl}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[GSC] Failed to queue CONTENT_OPTIMIZE for ${pageUrl}:`, errorMessage);
      }
    }
  }

  if (queuedPages.size > 0) {
    console.log(`[GSC] Queued ${queuedPages.size} content optimization jobs for site ${siteId}`);
  }
}
