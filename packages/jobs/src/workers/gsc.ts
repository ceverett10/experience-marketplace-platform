import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import { getGSCClient, isGSCConfigured } from '../services/gsc-client';
import { CloudflareDNSService } from '../services/cloudflare-dns';
import type { GscSyncPayload, GscSetupPayload, JobResult, ContentOptimizePayload } from '../types';
import { addJob } from '../queues';
import { canExecuteAutonomousOperation } from '../services/pause-control';
import { circuitBreakers } from '../errors/circuit-breaker';
import { toJobError } from '../errors';
import { errorTracking } from '../errors/tracking';

/**
 * Google Search Console Setup Worker
 * Registers a domain with GSC via DNS verification
 *
 * Flow:
 * 1. Get verification token from Google Site Verification API
 * 2. Add TXT record to Cloudflare DNS
 * 3. Wait for DNS propagation
 * 4. Verify domain with Google
 * 5. Add site to GSC as domain property
 * 6. Submit sitemap
 * 7. Update database with verification status
 */
export async function handleGscSetup(job: Job<GscSetupPayload>): Promise<JobResult> {
  const { siteId, domain, cloudflareZoneId } = job.data;

  try {
    console.log(`[GSC Setup] Starting GSC registration for ${domain} (site: ${siteId})`);

    // Check if GSC is configured
    if (!isGSCConfigured()) {
      console.warn('[GSC Setup] GSC not configured, skipping setup');
      return {
        success: false,
        error: 'GSC not configured (missing credentials)',
        errorCategory: 'configuration',
        timestamp: new Date(),
      };
    }

    // Verify site exists
    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    // Initialize services with circuit breaker protection
    const gscBreaker = circuitBreakers.getBreaker('gsc-api', {
      failureThreshold: 3,
      timeout: 120_000,
    });
    const gscClient = getGSCClient();
    const cloudflareDns = new CloudflareDNSService();

    // Register site with GSC using the helper method (protected by circuit breaker)
    const result = await gscBreaker.execute(() =>
      gscClient.registerSite(domain, async (token) => {
        // This callback is called after getting the verification token
        // Add TXT record to Cloudflare DNS
        console.log(`[GSC Setup] Adding verification TXT record for ${domain}`);
        await cloudflareDns.addGoogleVerificationRecord(cloudflareZoneId, token);

        // Store the verification code in the database
        await prisma.site.update({
          where: { id: siteId },
          data: {
            gscVerificationCode: token,
          },
        });

        // Wait for DNS propagation (Cloudflare is usually fast, but give it some time)
        console.log(`[GSC Setup] Waiting 10s for DNS propagation...`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      })
    );

    if (!result.success) {
      console.error(`[GSC Setup] Failed to register ${domain}: ${result.error}`);

      // If verification failed, we may need to retry later (DNS propagation)
      return {
        success: false,
        error: result.error,
        errorCategory: 'verification',
        retryable: result.error?.includes('propagate'),
        timestamp: new Date(),
      };
    }

    // Update database with verification success
    await prisma.site.update({
      where: { id: siteId },
      data: {
        gscVerified: true,
        gscVerifiedAt: new Date(),
        gscPropertyUrl: result.siteUrl,
        gscLastSyncedAt: new Date(),
      },
    });

    console.log(`[GSC Setup] Successfully registered ${domain} in GSC`);

    // Queue initial GSC sync to fetch any existing data
    await addJob(
      'GSC_SYNC',
      {
        siteId,
      },
      {
        delay: 60000, // Wait 1 minute before first sync
      }
    );

    return {
      success: true,
      message: `Domain ${domain} registered in Google Search Console`,
      data: {
        domain,
        siteUrl: result.siteUrl,
        sitemapSubmitted: true,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);
    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'GSC_SETUP',
      siteId,
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { domain, cloudflareZoneId },
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });
    console.error('[GSC Setup] Error:', jobError.message);

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

/**
 * Google Search Console Verify Worker
 * Checks if a domain is verified with GSC and attempts verification if not
 *
 * Flow:
 * 1. Check if site is already marked as verified in DB
 * 2. If not, check with GSC API whether domain is verified
 * 3. If verified externally but not in DB, update DB
 * 4. If not verified, attempt verification (DNS TXT record should already exist from GSC_SETUP)
 */
export async function handleGscVerify(job: Job<GscSetupPayload>): Promise<JobResult> {
  const { siteId, domain, cloudflareZoneId } = job.data;

  try {
    console.log(`[GSC Verify] Checking verification status for ${domain} (site: ${siteId})`);

    // Check if GSC is configured
    if (!isGSCConfigured()) {
      console.warn('[GSC Verify] GSC not configured, skipping verification');
      return {
        success: false,
        error: 'GSC not configured (missing credentials)',
        errorCategory: 'configuration',
        timestamp: new Date(),
      };
    }

    // Check if already verified in database
    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    if (site.gscVerified) {
      console.log(`[GSC Verify] Site ${siteId} already verified in database`);
      return {
        success: true,
        message: `Domain ${domain} already verified in GSC`,
        data: { domain, alreadyVerified: true },
        timestamp: new Date(),
      };
    }

    // Check with GSC API (protected by circuit breaker)
    const gscBreaker = circuitBreakers.getBreaker('gsc-api', {
      failureThreshold: 3,
      timeout: 120_000,
    });
    const gscClient = getGSCClient();
    const isAlreadyVerified = await gscBreaker.execute(() => gscClient.isVerified(domain));

    if (isAlreadyVerified) {
      // Update database
      await prisma.site.update({
        where: { id: siteId },
        data: {
          gscVerified: true,
          gscVerifiedAt: new Date(),
          gscPropertyUrl: `sc-domain:${domain}`,
        },
      });

      console.log(`[GSC Verify] Domain ${domain} verified (was already verified in GSC)`);
      return {
        success: true,
        message: `Domain ${domain} verified in Google Search Console`,
        data: { domain, verifiedExternally: true },
        timestamp: new Date(),
      };
    }

    // Attempt verification — the DNS TXT record should already exist from GSC_SETUP
    console.log(`[GSC Verify] Attempting verification for ${domain}`);
    const verificationResult = await gscBreaker.execute(() => gscClient.verifySite(domain));

    if (!verificationResult.verified) {
      return {
        success: false,
        error: `Domain ${domain} verification failed — DNS TXT record may not have propagated yet`,
        errorCategory: 'verification',
        retryable: true,
        timestamp: new Date(),
      };
    }

    // Verification succeeded — update database and add site to GSC
    const siteUrl = `sc-domain:${domain}`;
    await gscClient.addSite(siteUrl);
    await gscClient.submitSitemap(siteUrl, `https://${domain}/sitemap.xml`);

    await prisma.site.update({
      where: { id: siteId },
      data: {
        gscVerified: true,
        gscVerifiedAt: new Date(),
        gscPropertyUrl: siteUrl,
        gscLastSyncedAt: new Date(),
      },
    });

    console.log(`[GSC Verify] Domain ${domain} verified and added to GSC`);

    return {
      success: true,
      message: `Domain ${domain} verified and registered in Google Search Console`,
      data: { domain, siteUrl, sitemapSubmitted: true },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);
    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'GSC_VERIFY',
      siteId,
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { domain },
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });
    console.error('[GSC Verify] Error:', jobError.message);

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

/**
 * Google Search Console Sync Worker
 * Fetches performance data from GSC API and stores in database
 */
export async function handleGscSync(job: Job<GscSyncPayload>): Promise<JobResult> {
  const { siteId, startDate, endDate, dimensions } = job.data;

  try {
    console.log(`[GSC Sync] Starting sync for site ${siteId}`);

    // Handle "all" siteId - fan out to individual per-site GSC_SYNC jobs
    if (siteId === 'all') {
      console.log('[GSC Sync] Fan-out: queuing GSC_SYNC for all verified sites');
      const allSites = await prisma.site.findMany({
        where: { status: 'ACTIVE', gscVerified: true },
        select: { id: true, name: true },
      });

      let queued = 0;
      for (const s of allSites) {
        try {
          await addJob('GSC_SYNC', { siteId: s.id, startDate, endDate, dimensions });
          queued++;
        } catch (err) {
          console.log(`[GSC Sync] Skipping ${s.name} (may already be queued)`);
        }
      }

      return {
        success: true,
        message: `Queued GSC_SYNC for ${queued} of ${allSites.length} verified sites`,
        data: { queued, total: allSites.length },
        timestamp: new Date(),
      };
    }

    // Check if autonomous GSC sync is allowed
    const canProceed = await canExecuteAutonomousOperation({
      siteId,
      feature: 'enableGSCVerification',
      rateLimitType: 'GSC_REQUEST',
    });

    if (!canProceed.allowed) {
      console.log(`[GSC Sync] Skipping - ${canProceed.reason}`);
      return {
        success: false,
        error: canProceed.reason || 'GSC sync is paused',
        errorCategory: 'paused',
        timestamp: new Date(),
      };
    }

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

    // Use gscPropertyUrl (sc-domain: format) when available, fall back to primary domain
    const gscDomain = site.gscPropertyUrl || primaryDomain.domain;
    console.log(`[GSC Sync] Using GSC property: ${gscDomain} for site ${site.name || siteId}`);

    // Fetch data from Google Search Console (protected by circuit breaker)
    const gscBreaker = circuitBreakers.getBreaker('gsc-api', {
      failureThreshold: 3,
      timeout: 120_000,
    });
    const gscData = await gscBreaker.execute(() =>
      fetchGscData(gscDomain, startDate, endDate, dimensions)
    );

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
    const jobError = toJobError(error);
    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'GSC_SYNC',
      siteId,
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { startDate, endDate },
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });
    console.error('[GSC Sync] Error:', jobError.message);

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
        pageData.slice(-3).reduce((sum: number, m: { position: number }) => sum + m.position, 0) /
        3;
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

          console.log(
            `[GSC] Queued CONTENT_OPTIMIZE job ${jobId} for page ${page.id} (${issueType})`
          );
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
