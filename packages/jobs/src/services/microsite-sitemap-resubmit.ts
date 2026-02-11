/**
 * Microsite Sitemap Resubmission Service
 *
 * Resubmits sitemaps for all active microsites to Google Search Console.
 * This ensures Google's crawl queue stays fresh when new content (blogs,
 * collections, etc.) is added between the initial publish and now.
 *
 * Runs weekly via scheduler. Uses the parent domain property
 * sc-domain:experiencess.com which covers all subdomains.
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
 * Resubmit sitemaps for all active microsites to GSC.
 * GSC treats resubmission as a "ping" to re-crawl, so it's safe to call
 * even if the sitemap was already submitted previously.
 */
export async function resubmitMicrositeSitemapsToGSC(): Promise<SitemapResubmitResult> {
  const startTime = Date.now();

  if (!isGSCConfigured()) {
    console.log('[Sitemap Resubmit] GSC not configured, skipping');
    return { total: 0, submitted: 0, skipped: 0, errors: 0, durationMs: 0 };
  }

  const gscClient = getGSCClient();

  // Get all active microsites on the parent domain
  const microsites = await prisma.micrositeConfig.findMany({
    where: {
      parentDomain: PARENT_DOMAIN,
      status: 'ACTIVE',
    },
    select: {
      fullDomain: true,
    },
    orderBy: { pageViews: 'desc' }, // High-traffic first
  });

  const total = microsites.length;
  console.log(`[Sitemap Resubmit] Resubmitting sitemaps for ${total} active microsites`);

  let submitted = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches to avoid overwhelming GSC API
  for (let i = 0; i < microsites.length; i += BATCH_SIZE) {
    const batch = microsites.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(microsites.length / BATCH_SIZE);

    console.log(`[Sitemap Resubmit] Batch ${batchNum}/${totalBatches} (${batch.length} microsites)`);

    for (const ms of batch) {
      const sitemapUrl = `https://${ms.fullDomain}/sitemap.xml`;

      try {
        await gscClient.submitSitemap(GSC_DOMAIN_PROPERTY, sitemapUrl);
        submitted++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Skip logging for common non-errors (e.g. sitemap already submitted recently)
        if (msg.includes('already') || msg.includes('duplicate')) {
          skipped++;
        } else {
          errors++;
          if (errors <= 5) {
            console.warn(`[Sitemap Resubmit] Error for ${ms.fullDomain}: ${msg}`);
          }
        }
      }

      await sleep(DELAY_BETWEEN_SUBMISSIONS_MS);
    }
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `[Sitemap Resubmit] Complete. ` +
      `Submitted: ${submitted}, Skipped: ${skipped}, Errors: ${errors}, ` +
      `Duration: ${(durationMs / 1000).toFixed(1)}s`
  );

  return { total, submitted, skipped, errors, durationMs };
}
