/**
 * Pipeline Data Backfill Script
 *
 * Fixes 4 data gaps identified by pipeline-health-check.ts:
 *   1. Supplier cities — backfill from local Product table
 *   2. Empty locations on PAID_CANDIDATE keywords — derive from keyword text
 *   3. Microsite campaign ?q= param — add search query to targetUrl
 *   4. REVIEW keywords in campaigns — approve since they're already live
 *
 * Usage:
 *   DATABASE_URL=... npx tsx packages/jobs/src/scripts/backfill-pipeline-data.ts
 *   DATABASE_URL=... npx tsx packages/jobs/src/scripts/backfill-pipeline-data.ts --dry-run
 */

import { prisma } from '@experience-marketplace/database';
import { extractSearchQuery } from '../services/landing-page-routing.js';
import { extractDestinationFromKeyword } from '../utils/keyword-location.js';

const DRY_RUN = process.argv.includes('--dry-run');

function log(msg: string) {
  console.log(`  ${msg}`);
}

// ─────────────────────────────────────────────────────────────
// 1. Backfill supplier cities from local Product table
// ─────────────────────────────────────────────────────────────
async function backfillSupplierCities() {
  console.log('\n1. BACKFILL SUPPLIER CITIES');
  console.log('─'.repeat(50));

  const suppliersWithEmptyCities = await prisma.supplier.findMany({
    where: { cities: { isEmpty: true } },
    select: { id: true, name: true },
  });

  log(`${suppliersWithEmptyCities.length} suppliers with empty cities`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < suppliersWithEmptyCities.length; i++) {
    const supplier = suppliersWithEmptyCities[i]!;

    // Aggregate distinct cities from this supplier's products
    const products = await prisma.product.findMany({
      where: { supplierId: supplier.id, city: { not: null } },
      select: { city: true },
      distinct: ['city'],
    });

    const cities = products.map((p) => p.city!).filter(Boolean);

    if (cities.length === 0) {
      skipped++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.supplier.update({
        where: { id: supplier.id },
        data: { cities },
      });
    }
    updated++;

    if (i > 0 && i % 500 === 0) {
      log(`  Progress: ${i}/${suppliersWithEmptyCities.length}`);
    }
  }

  log(`Updated: ${updated}, Skipped (no products with cities): ${skipped}`);
  if (DRY_RUN) log('(DRY RUN — no changes written)');
}

// ─────────────────────────────────────────────────────────────
// 2. Backfill empty locations on PAID_CANDIDATE keywords
// ─────────────────────────────────────────────────────────────
async function backfillKeywordLocations() {
  console.log('\n2. BACKFILL KEYWORD LOCATIONS');
  console.log('─'.repeat(50));

  const emptyLocationKeywords = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE', location: '' },
    select: { id: true, keyword: true, sourceData: true },
  });

  log(`${emptyLocationKeywords.length} PAID_CANDIDATE with empty location`);

  let updated = 0;
  let skipped = 0;

  for (const opp of emptyLocationKeywords) {
    // Try to extract city from keyword text using known cities DB + map
    const city = await extractDestinationFromKeyword(opp.keyword);

    // Also check sourceData for location hints
    const sd = opp.sourceData as any;
    const sdLocation: string | null = sd?.location || sd?.city || sd?.destination || null;

    const location = city || sdLocation;

    if (!location) {
      skipped++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.sEOOpportunity.update({
        where: { id: opp.id },
        data: { location },
      });
    }
    updated++;
  }

  log(`Updated: ${updated}, Skipped (no location derivable): ${skipped}`);
  if (DRY_RUN) log('(DRY RUN — no changes written)');
}

// ─────────────────────────────────────────────────────────────
// 3. Backfill microsite campaigns with ?q= param
// ─────────────────────────────────────────────────────────────
async function backfillMicrositeSearchParam() {
  console.log('\n3. BACKFILL MICROSITE ?q= PARAM');
  console.log('─'.repeat(50));

  const micrositeCampaigns = await prisma.adCampaign.findMany({
    where: {
      micrositeId: { not: null },
      NOT: { targetUrl: { contains: 'q=' } },
    },
    select: {
      id: true,
      keywords: true,
      targetUrl: true,
      opportunity: { select: { location: true } },
    },
  });

  log(`${micrositeCampaigns.length} microsite campaigns missing ?q= param`);

  let updated = 0;
  let skipped = 0;

  for (const campaign of micrositeCampaigns) {
    const primaryKeyword = campaign.keywords[0];
    if (!primaryKeyword) {
      skipped++;
      continue;
    }

    const location = campaign.opportunity?.location || null;
    const searchQuery = extractSearchQuery(primaryKeyword, location);

    if (!searchQuery || searchQuery.length < 3) {
      skipped++;
      continue;
    }

    try {
      const url = new URL(campaign.targetUrl);
      url.searchParams.set('q', searchQuery);

      if (!DRY_RUN) {
        await prisma.adCampaign.update({
          where: { id: campaign.id },
          data: { targetUrl: url.toString() },
        });
      }
      updated++;
    } catch {
      skipped++;
    }
  }

  log(`Updated: ${updated}, Skipped (no usable search term): ${skipped}`);
  if (DRY_RUN) log('(DRY RUN — no changes written)');
}

// ─────────────────────────────────────────────────────────────
// 4. Approve REVIEW keywords that are already in live campaigns
// ─────────────────────────────────────────────────────────────
async function approveReviewKeywordsInCampaigns() {
  console.log('\n4. APPROVE REVIEW KEYWORDS IN CAMPAIGNS');
  console.log('─'.repeat(50));

  const recentCampaigns = await prisma.adCampaign.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    },
    select: { keywords: true },
  });
  const campaignKeywords = new Set(recentCampaigns.flatMap((c) => c.keywords));

  if (campaignKeywords.size === 0) {
    log('No recent campaigns found');
    return;
  }

  const reviewKeywords = await prisma.sEOOpportunity.findMany({
    where: {
      keyword: { in: [...campaignKeywords] },
      status: 'PAID_CANDIDATE',
    },
    select: { id: true, keyword: true, sourceData: true },
  });

  const toUpdate = reviewKeywords.filter((k) => {
    const sd = k.sourceData as any;
    return sd?.aiEvaluation?.decision === 'REVIEW';
  });

  log(`${toUpdate.length} REVIEW keywords found in live campaigns`);

  let updated = 0;

  for (const opp of toUpdate) {
    const sd = opp.sourceData as any;

    if (!DRY_RUN) {
      await prisma.sEOOpportunity.update({
        where: { id: opp.id },
        data: {
          sourceData: {
            ...sd,
            aiEvaluation: {
              ...sd.aiEvaluation,
              decision: 'BID',
              originalDecision: 'REVIEW',
              approvedBy: 'backfill-pipeline-data',
              approvedAt: new Date().toISOString(),
            },
          },
        },
      });
    }
    updated++;
  }

  log(`Updated: ${updated} keywords (REVIEW → BID)`);
  if (DRY_RUN) log('(DRY RUN — no changes written)');
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('Pipeline Data Backfill');
  console.log('='.repeat(50));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Run at: ${new Date().toISOString()}`);

  await backfillSupplierCities();
  await backfillKeywordLocations();
  await backfillMicrositeSearchParam();
  await approveReviewKeywordsInCampaigns();

  console.log('\n' + '='.repeat(50));
  console.log('Backfill complete.');
  if (DRY_RUN) {
    console.log('Re-run without --dry-run to apply changes.');
  }
}

main()
  .catch((error) => {
    console.error('\nBackfill failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
