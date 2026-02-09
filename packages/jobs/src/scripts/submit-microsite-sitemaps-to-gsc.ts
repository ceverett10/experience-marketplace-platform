#!/usr/bin/env npx tsx
/**
 * Submit all microsite sitemaps to Google Search Console
 *
 * This script submits sitemaps for all microsites on experiencess.com to GSC.
 * The domain property sc-domain:experiencess.com covers all subdomains.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/submit-microsite-sitemaps-to-gsc.ts [options]
 *
 * Options:
 *   --dry-run    Show what would be submitted without submitting
 *   --limit=N    Limit to N microsites
 */

// Note: On Heroku, env vars are already configured - no dotenv needed
// For local development, run: source .env && npx tsx ...
import { prisma } from '@experience-marketplace/database';
import { getGSCClient, isGSCConfigured } from '../services/gsc-client.js';

const PARENT_DOMAIN = 'experiencess.com';
const GSC_DOMAIN_PROPERTY = `sc-domain:${PARENT_DOMAIN}`;

// Rate limiting: GSC has quotas
const DELAY_BETWEEN_SUBMISSIONS_MS = 500;

interface SubmitOptions {
  dryRun?: boolean;
  limit?: number;
}

function parseArgs(): SubmitOptions {
  const args = process.argv.slice(2);
  const options: SubmitOptions = {};

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.replace('--limit=', ''), 10);
    }
  }

  return options;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(70));
  console.log('SUBMIT MICROSITE SITEMAPS TO GOOGLE SEARCH CONSOLE');
  console.log('='.repeat(70));
  console.log(`Options:`, options);
  console.log('');

  // Check GSC configuration
  if (!isGSCConfigured()) {
    console.error('ERROR: GSC not configured');
    console.error('Set GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY environment variables');
    process.exit(1);
  }

  const gscClient = getGSCClient();

  // Verify we have access to the domain property
  console.log(`Checking access to ${GSC_DOMAIN_PROPERTY}...`);
  try {
    const site = await gscClient.getSite(GSC_DOMAIN_PROPERTY);
    if (!site) {
      console.error(`ERROR: Domain property ${GSC_DOMAIN_PROPERTY} not found`);
      console.error('Make sure the domain is verified in GSC');
      process.exit(1);
    }
    console.log(`✓ Access confirmed: ${site.siteUrl} (${site.permissionLevel})`);
  } catch (error) {
    console.error('ERROR: Could not access GSC domain property:', error);
    process.exit(1);
  }

  // Get existing sitemaps
  console.log('\nFetching existing sitemaps...');
  let existingSitemaps: Set<string> = new Set();
  try {
    const sitemaps = await gscClient.getSitemaps(GSC_DOMAIN_PROPERTY);
    existingSitemaps = new Set(sitemaps.map((s) => s.path));
    console.log(`Found ${existingSitemaps.size} existing sitemaps in GSC`);
  } catch (error) {
    console.log('Could not fetch existing sitemaps, will submit all');
  }

  // Get all microsites
  console.log('\nFetching microsites...');
  const microsites = await prisma.micrositeConfig.findMany({
    where: {
      parentDomain: PARENT_DOMAIN,
      status: { not: 'ARCHIVED' },
    },
    select: {
      id: true,
      fullDomain: true,
      subdomain: true,
      status: true,
    },
    orderBy: { createdAt: 'asc' },
    take: options.limit,
  });

  console.log(`Found ${microsites.length} microsites\n`);

  if (options.dryRun) {
    console.log('DRY RUN - No sitemaps will be submitted\n');
  }

  let submitted = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: Array<{ domain: string; error: string }> = [];

  for (const [i, microsite] of microsites.entries()) {
    const sitemapUrl = `https://${microsite.fullDomain}/sitemap.xml`;
    const alreadyExists = existingSitemaps.has(sitemapUrl);

    process.stdout.write(`[${i + 1}/${microsites.length}] ${microsite.fullDomain}`);

    if (alreadyExists) {
      console.log(' - ALREADY EXISTS');
      skipped++;
      continue;
    }

    if (options.dryRun) {
      console.log(' - WOULD SUBMIT');
      submitted++;
      continue;
    }

    try {
      await gscClient.submitSitemap(GSC_DOMAIN_PROPERTY, sitemapUrl);
      console.log(' - SUBMITTED');
      submitted++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(` - ERROR: ${errorMsg}`);
      errors++;
      errorDetails.push({ domain: microsite.fullDomain, error: errorMsg });
    }

    // Rate limiting
    if (!options.dryRun && i < microsites.length - 1) {
      await delay(DELAY_BETWEEN_SUBMISSIONS_MS);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Submitted:      ${submitted}`);
  console.log(`Already Exists: ${skipped}`);
  console.log(`Errors:         ${errors}`);
  console.log(`Total:          ${microsites.length}`);

  if (errorDetails.length > 0) {
    console.log('\nErrors:');
    for (const err of errorDetails.slice(0, 10)) {
      console.log(`  - ${err.domain}: ${err.error}`);
    }
    if (errorDetails.length > 10) {
      console.log(`  ... and ${errorDetails.length - 10} more`);
    }
  }

  // Verify sitemaps were submitted
  if (!options.dryRun && submitted > 0) {
    console.log('\nVerifying submission...');
    await delay(2000);
    try {
      const updatedSitemaps = await gscClient.getSitemaps(GSC_DOMAIN_PROPERTY);
      console.log(`GSC now shows ${updatedSitemaps.length} sitemaps`);

      // Show a few examples
      console.log('\nRecent sitemaps in GSC:');
      updatedSitemaps.slice(0, 5).forEach((s) => {
        console.log(`  - ${s.path}`);
      });
      if (updatedSitemaps.length > 5) {
        console.log(`  ... and ${updatedSitemaps.length - 5} more`);
      }
    } catch (error) {
      console.log('Could not verify sitemaps');
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
