/**
 * Sitemap Resubmission Service
 *
 * Resubmits sitemaps for all active sites to Google Search Console:
 * - Main sites (custom domains like barcelona-food-tours.com)
 * - Microsites (subdomains on *.experiencess.com)
 *
 * This ensures Google's crawl queue stays fresh when new content (blogs,
 * destination pages, FAQ hubs, etc.) is published between crawl cycles.
 *
 * Runs weekly via scheduler (Sundays 9 AM UTC).
 */

import { prisma } from '@experience-marketplace/database';
import { getGSCClient, isGSCConfigured } from './gsc-client.js';

const PARENT_DOMAIN = 'experiencess.com';
const GSC_DOMAIN_PROPERTY = `sc-domain:${PARENT_DOMAIN}`;
const DELAY_BETWEEN_SUBMISSIONS_MS = 300;
const BATCH_SIZE = 50;

export interface SitemapResubmitResult {
  total: number;
  submitted: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submit a single sitemap URL to GSC, tracking success/skip/error counts.
 */
async function submitOne(
  gscClient: ReturnType<typeof getGSCClient>,
  gscProperty: string,
  sitemapUrl: string,
  counters: { submitted: number; skipped: number; errors: number; errorLimit: number }
): Promise<void> {
  try {
    await gscClient.submitSitemap(gscProperty, sitemapUrl);
    counters.submitted++;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('already') || msg.includes('duplicate')) {
      counters.skipped++;
    } else {
      counters.errors++;
      if (counters.errors <= counters.errorLimit) {
        console.warn(`[Sitemap Resubmit] Error for ${sitemapUrl}: ${msg}`);
      }
    }
  }
}

/**
 * Resubmit sitemaps for all active sites and microsites to GSC.
 * GSC treats resubmission as a "ping" to re-crawl, so it's safe to call
 * even if the sitemap was already submitted previously.
 */
export async function resubmitMicrositeSitemapsToGSC(): Promise<SitemapResubmitResult> {
  const startTime = Date.now();

  if (!isGSCConfigured()) {
    console.info('[Sitemap Resubmit] GSC not configured, skipping');
    return { total: 0, submitted: 0, skipped: 0, errors: 0, durationMs: 0 };
  }

  const gscClient = getGSCClient();
  const counters = { submitted: 0, skipped: 0, errors: 0, errorLimit: 5 };

  // -----------------------------------------------------------------------
  // Phase 1: Main sites (custom domains with their own GSC domain properties)
  // -----------------------------------------------------------------------
  const mainSites = await prisma.site.findMany({
    where: {
      status: 'ACTIVE',
      primaryDomain: { not: null },
    },
    select: { primaryDomain: true },
  });

  console.info(`[Sitemap Resubmit] Phase 1: ${mainSites.length} main sites`);

  for (const site of mainSites) {
    if (!site.primaryDomain) continue;
    const gscProperty = `sc-domain:${site.primaryDomain}`;
    const sitemapUrl = `https://${site.primaryDomain}/sitemap.xml`;

    await submitOne(gscClient, gscProperty, sitemapUrl, counters);
    await sleep(DELAY_BETWEEN_SUBMISSIONS_MS);
  }

  console.info(
    `[Sitemap Resubmit] Phase 1 done: ${counters.submitted} submitted, ${counters.errors} errors`
  );

  // -----------------------------------------------------------------------
  // Phase 2: Microsites (subdomains under experiencess.com)
  // -----------------------------------------------------------------------
  const microsites = await prisma.micrositeConfig.findMany({
    where: {
      parentDomain: PARENT_DOMAIN,
      status: 'ACTIVE',
    },
    select: { fullDomain: true },
    orderBy: { pageViews: 'desc' },
  });

  const total = mainSites.length + microsites.length;
  console.info(`[Sitemap Resubmit] Phase 2: ${microsites.length} microsites`);

  for (let i = 0; i < microsites.length; i += BATCH_SIZE) {
    const batch = microsites.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(microsites.length / BATCH_SIZE);

    console.info(
      `[Sitemap Resubmit] Batch ${batchNum}/${totalBatches} (${batch.length} microsites)`
    );

    for (const ms of batch) {
      const sitemapUrl = `https://${ms.fullDomain}/sitemap.xml`;
      await submitOne(gscClient, GSC_DOMAIN_PROPERTY, sitemapUrl, counters);
      await sleep(DELAY_BETWEEN_SUBMISSIONS_MS);
    }
  }

  const durationMs = Date.now() - startTime;

  console.info(
    `[Sitemap Resubmit] Complete. ` +
      `Total: ${total}, Submitted: ${counters.submitted}, ` +
      `Skipped: ${counters.skipped}, Errors: ${counters.errors}, ` +
      `Duration: ${(durationMs / 1000).toFixed(1)}s`
  );

  return {
    total,
    submitted: counters.submitted,
    skipped: counters.skipped,
    errors: counters.errors,
    durationMs,
  };
}
