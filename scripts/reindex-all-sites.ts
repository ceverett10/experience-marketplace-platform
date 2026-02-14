/**
 * Resubmit sitemaps for ALL sites to Google Search Console
 * This covers:
 * 1. Custom domain sites (with sc-domain: properties)
 * 2. experiencess.com subdomains (via sc-domain:experiencess.com)
 *
 * Sitemap resubmission signals Google to re-crawl, picking up updated meta tags.
 *
 * Usage: npx tsx scripts/reindex-all-sites.ts
 * Must be run with GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY env vars set.
 */

import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const prisma = new PrismaClient();
const DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const clientEmail = process.env['GSC_CLIENT_EMAIL'];
  const privateKey = process.env['GSC_PRIVATE_KEY']?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    console.error('GSC credentials not configured. Set GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY');
    process.exit(1);
  }

  const auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });

  const searchConsole = google.searchconsole({ version: 'v1', auth });

  // === 1. Resubmit sitemaps for custom domain sites ===
  console.log('=== Custom Domain Sites ===');
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE', gscVerified: true },
    select: { primaryDomain: true, gscPropertyUrl: true },
  });

  let submitted = 0;
  let errors = 0;

  for (const site of sites) {
    if (!site.primaryDomain || !site.gscPropertyUrl) continue;
    const sitemapUrl = `https://${site.primaryDomain}/sitemap.xml`;

    try {
      await searchConsole.sitemaps.submit({
        siteUrl: site.gscPropertyUrl,
        feedpath: sitemapUrl,
      });
      submitted++;
      console.log(`  OK ${site.primaryDomain}`);
    } catch (error: any) {
      errors++;
      console.error(`  FAIL ${site.primaryDomain}: ${error.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Custom domains: ${submitted} submitted, ${errors} errors\n`);

  // === 2. Resubmit sitemaps for experiencess.com subdomains ===
  console.log('=== Experiencess.com Subdomains ===');
  const microsites = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE', parentDomain: 'experiencess.com' },
    select: { fullDomain: true },
    orderBy: { pageViews: 'desc' },
  });

  console.log(`Total microsites: ${microsites.length}`);
  const DOMAIN_PROPERTY = 'sc-domain:experiencess.com';
  let msSubmitted = 0;
  let msErrors = 0;

  for (let i = 0; i < microsites.length; i++) {
    const ms = microsites[i];
    const sitemapUrl = `https://${ms.fullDomain}/sitemap.xml`;

    try {
      await searchConsole.sitemaps.submit({
        siteUrl: DOMAIN_PROPERTY,
        feedpath: sitemapUrl,
      });
      msSubmitted++;
    } catch (error: any) {
      msErrors++;
      if (msErrors <= 5) {
        console.error(`  FAIL ${ms.fullDomain}: ${error.message}`);
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  Progress: ${i + 1}/${microsites.length} (${msSubmitted} ok, ${msErrors} err)`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nSubdomains: ${msSubmitted} submitted, ${msErrors} errors`);
  console.log(`\n=== TOTAL: ${submitted + msSubmitted} sitemaps resubmitted ===`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
