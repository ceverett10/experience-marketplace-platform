/**
 * Seed script for Pipeline Optimization Tracker
 *
 * Populates the PipelineTask table with all 24 tasks from the
 * campaign pipeline optimization plan (docs/plans/campaign-pipeline-optimization.md).
 *
 * Run: npx ts-node packages/jobs/src/scripts/seed-pipeline-tasks.ts
 */

import { prisma } from '@experience-marketplace/database';

interface TaskSeed {
  phase: number;
  taskNumber: string;
  title: string;
  description: string;
  fixRefs: string[];
  keyFiles: string[];
  severity: string;
  verificationQuery?: string;
  verificationTarget?: string;
}

const TASKS: TaskSeed[] = [
  // ═══════════════════════════════════════════════════════════════
  // PHASE 1 — Foundation & Data Quality
  // ═══════════════════════════════════════════════════════════════
  {
    phase: 1,
    taskNumber: '1.1',
    title: 'Full product cache',
    description:
      'One-time bulk load of entire Holibob product catalog via getAllProducts(). Stores title, description, city, categories, supplierId for every product. No pricing or images (runtime concerns).',
    fixRefs: ['1a'],
    keyFiles: ['packages/jobs/src/services/product-sync.ts'],
    severity: 'HIGH',
    verificationQuery: 'SELECT COUNT(*) as count FROM "Product"',
    verificationTarget: '> 1000',
  },
  {
    phase: 1,
    taskNumber: '1.2',
    title: 'Backfill supplier cities/categories',
    description:
      'After bulk product sync, re-aggregate supplier metadata (cities[], categories[]) from their cached products. Ensures every supplier has accurate location and category data derived from real products.',
    fixRefs: ['1c'],
    keyFiles: ['packages/jobs/src/services/product-sync.ts'],
    severity: 'HIGH',
    verificationQuery: `SELECT COUNT(*) as count FROM "Supplier" WHERE cities = '{}' OR cities IS NULL`,
    verificationTarget: '= 0',
  },
  {
    phase: 1,
    taskNumber: '1.3',
    title: 'Standardize keyword locations',
    description:
      'Migrate empty/inconsistent location fields on PAID_CANDIDATE records. All sources must use consistent destination-specific locations (e.g. "London, England", "Barcelona, Spain"), not fixed country defaults or empty strings.',
    fixRefs: ['2d'],
    keyFiles: [
      'packages/jobs/src/services/paid-keyword-scanner.ts',
      'packages/jobs/src/services/keyword-enrichment.ts',
    ],
    severity: 'HIGH',
    verificationQuery: `SELECT COUNT(*) as count FROM "SEOOpportunity" WHERE status = 'PAID_CANDIDATE' AND (location = '' OR location IS NULL)`,
    verificationTarget: '= 0',
  },
  {
    phase: 1,
    taskNumber: '1.4',
    title: 'Remove random number fallbacks',
    description:
      'Delete estimateSearchVolume(), estimateCpc(), estimateDifficulty() functions that use Math.random(). When DataForSEO fails, skip the keyword instead of storing random data as real metrics.',
    fixRefs: ['2k'],
    keyFiles: ['packages/jobs/src/workers/opportunity.ts'],
    severity: 'HIGH',
  },
  {
    phase: 1,
    taskNumber: '1.5',
    title: 'Product-cache-backed supplier attribution',
    description:
      'After keyword creation (all sources), run matching pass: extract city from keyword, find suppliers with products in that city from local Product table, score by keyword-category relevance, set sourceSupplierIds to top-scoring supplier(s). Replaces naive name-matching.',
    fixRefs: ['2ae'],
    keyFiles: [
      'packages/jobs/src/services/paid-keyword-scanner.ts',
      'packages/jobs/src/services/keyword-enrichment.ts',
    ],
    severity: 'HIGH',
    verificationQuery: `SELECT ROUND(COUNT(*) FILTER (WHERE "sourceData"::text LIKE '%sourceSupplierIds%')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as pct FROM "SEOOpportunity" WHERE status = 'PAID_CANDIDATE'`,
    verificationTarget: '> 80',
  },
  {
    phase: 1,
    taskNumber: '1.6',
    title: 'Enrichment reads from local Product table',
    description:
      'Replace getProductsByProvider() API call in keyword-enrichment.ts with prisma.product.findMany({ where: { supplierId } }). Stage 1 cache should be the source, not live Holibob API.',
    fixRefs: ['2e'],
    keyFiles: ['packages/jobs/src/services/keyword-enrichment.ts'],
    severity: 'MEDIUM',
  },

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2 — Campaign Quality
  // ═══════════════════════════════════════════════════════════════
  {
    phase: 2,
    taskNumber: '2.1',
    title: 'Add ?q= to supplier microsite landing pages',
    description:
      'In buildSupplierMicrositeLandingPage(), call extractSearchQuery(keyword, location) and add result as ?q= param alongside ?cities= and ?categories=. Holibob Product List by Provider API supports filters.search param. Website already passes ?q= to filters.search for microsites.',
    fixRefs: ['4a'],
    keyFiles: ['packages/jobs/src/services/landing-page-routing.ts'],
    severity: 'CRITICAL',
    verificationQuery: `SELECT COUNT(*) FILTER (WHERE "targetUrl" LIKE '%q=%') as with_q, COUNT(*) as total FROM "AdCampaign" WHERE "micrositeId" IS NOT NULL AND status = 'DRAFT'`,
    verificationTarget: '> 0',
  },
  {
    phase: 2,
    taskNumber: '2.2',
    title: 'Theme-aware city matching',
    description:
      'When multiple suppliers serve the same city in step 3 of microsite matching, score by keyword-category relevance (does supplier categories[] match keyword theme?) not just product count. "walking tours london" should prefer supplier with Walking Tours category over one with Transfers.',
    fixRefs: ['4b'],
    keyFiles: ['packages/jobs/src/services/bidding-engine.ts'],
    severity: 'CRITICAL',
  },
  {
    phase: 2,
    taskNumber: '2.3',
    title: 'Allow EXPERIENCES_FILTERED on main sites',
    description:
      'Remove blanket rejection of EXPERIENCES_FILTERED on non-microsites (line 968). Instead, validate that /experiences?q=keyword returns >= 3 products via LandingPageValidator. The keyword is passed to Product Discovery API as what.data.searchTerm.',
    fixRefs: ['4c'],
    keyFiles: ['packages/jobs/src/services/bidding-engine.ts'],
    severity: 'HIGH',
  },
  {
    phase: 2,
    taskNumber: '2.4',
    title: 'AI evaluation gates campaign creation',
    description:
      'Add sourceData.aiEvaluation.decision = "BID" check in scoreCampaignOpportunities(). Only BID keywords create campaigns. REVIEW keywords need explicit human approval. Unevaluated keywords should NOT create campaigns.',
    fixRefs: ['3a'],
    keyFiles: ['packages/jobs/src/services/bidding-engine.ts'],
    severity: 'CRITICAL',
  },
  {
    phase: 2,
    taskNumber: '2.5',
    title: 'Rebuild interest targeting with AI + relevance scoring',
    description:
      'Replace naive findRelevantInterests() with AI-assisted approach: (1) Claude extracts intent-relevant interest concepts from keyword + landing page context. (2) Search Meta interests API per concept. (3) Score by audience size, topic path relevance, keyword coherence. (4) Layer interests. (5) Use audience_size data.',
    fixRefs: ['6a'],
    keyFiles: ['packages/jobs/src/workers/ads.ts'],
    severity: 'CRITICAL',
  },
  {
    phase: 2,
    taskNumber: '2.6',
    title: 'Remove "Free cancellation" + AI Google RSA',
    description:
      'Remove "Free cancellation available" from Google template descriptions — replace with verifiable claim. Apply Claude Haiku AI generation to Google RSA headlines/descriptions instead of generic templates. Keep templates as fallback.',
    fixRefs: ['5a', '5b'],
    keyFiles: ['packages/jobs/src/workers/ads.ts'],
    severity: 'HIGH',
    verificationQuery: `SELECT COUNT(*) as count FROM "AdCampaign" WHERE platform = 'GOOGLE_SEARCH' AND ("proposalData"::text LIKE '%Free cancellation%')`,
    verificationTarget: '= 0',
  },

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3 — Campaign Lifecycle
  // ═══════════════════════════════════════════════════════════════
  {
    phase: 3,
    taskNumber: '3.1',
    title: 'Auto-activate campaigns',
    description:
      'After deploying as PAUSED, auto-activate campaigns after 24h observation period if coherence score >= 6 AND landing page validated. Add activateAfter timestamp to campaign. Runs as part of budget optimizer.',
    fixRefs: ['6b', '8b'],
    keyFiles: ['packages/jobs/src/workers/ads.ts'],
    severity: 'CRITICAL',
  },
  {
    phase: 3,
    taskNumber: '3.2',
    title: 'Bid adjustment automation',
    description:
      'After 7 days of data: if ROAS > 2.0, increase bid by 10%. If ROAS < 0.8, decrease bid by 10%. Call updateBid() on both Meta and Google clients. Weekly cadence. updateBid() already exists but is never called.',
    fixRefs: ['8a'],
    keyFiles: ['packages/jobs/src/workers/ads.ts'],
    severity: 'CRITICAL',
  },
  {
    phase: 3,
    taskNumber: '3.3',
    title: 'Budget sync to platforms',
    description:
      'After budget scale in optimizer, call MetaAdsClient.updateCampaignBudget() and Google equivalent to sync the new dailyBudget to the actual platform. Currently optimizer updates DB only.',
    fixRefs: ['8c'],
    keyFiles: ['packages/jobs/src/workers/ads.ts'],
    severity: 'CRITICAL',
  },
  {
    phase: 3,
    taskNumber: '3.4',
    title: 'Fast-fail for zero-conversion campaigns',
    description:
      'If spend > £20 AND 0 conversions after 3 days, pause the campaign. Do not wait the full 7-day observation period for clearly failing campaigns.',
    fixRefs: ['8d'],
    keyFiles: ['packages/jobs/src/workers/ads.ts'],
    severity: 'MEDIUM',
  },
  {
    phase: 3,
    taskNumber: '3.5',
    title: 'Schedule creative refresh',
    description:
      'Add AD_CREATIVE_REFRESH to scheduler (weekly). The handler already exists — it re-checks coherence, updates images, and remediates incoherent creative. Just needs a cron entry.',
    fixRefs: ['5c'],
    keyFiles: ['packages/jobs/src/schedulers/index.ts'],
    severity: 'MEDIUM',
  },
  {
    phase: 3,
    taskNumber: '3.6',
    title: 'Re-enable keyword discovery',
    description:
      'Uncomment PAID_KEYWORD_SCAN in scheduler. Currently all automated keyword discovery is paused. Consider splitting: free modes (Pinterest/Meta) twice weekly, paid modes (GSC/Expansion/Discovery) weekly.',
    fixRefs: ['2a'],
    keyFiles: ['packages/jobs/src/schedulers/index.ts'],
    severity: 'CRITICAL',
  },

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4 — Global Expansion & Polish
  // ═══════════════════════════════════════════════════════════════
  {
    phase: 4,
    taskNumber: '4.1',
    title: 'Add targetMarkets to Site model',
    description:
      'Add targetMarkets: String[] to Site model. Replace hardcoded SOURCE_MARKETS with site.targetMarkets in all deployment code. Default: all supported markets.',
    fixRefs: ['G1', 'G2'],
    keyFiles: ['packages/database/prisma/schema.prisma', 'packages/jobs/src/workers/ads.ts'],
    severity: 'CRITICAL',
  },
  {
    phase: 4,
    taskNumber: '4.2',
    title: 'Add primaryCurrency to Site model',
    description:
      'Add primaryCurrency: String to Site model. Use for product queries, analytics, budget calculations instead of hardcoded GBP.',
    fixRefs: ['G4'],
    keyFiles: [
      'packages/database/prisma/schema.prisma',
      'packages/jobs/src/services/bidding-engine.ts',
    ],
    severity: 'HIGH',
  },
  {
    phase: 4,
    taskNumber: '4.3',
    title: 'Keyword location matches destination',
    description:
      'DataForSEO location should match the keyword destination (e.g. "Barcelona tours" → Spain location code), not a fixed country. Extract destination from keyword or use product city.',
    fixRefs: ['G3', '2i'],
    keyFiles: [
      'packages/jobs/src/services/paid-keyword-scanner.ts',
      'packages/jobs/src/services/keyword-research.ts',
    ],
    severity: 'HIGH',
  },
  {
    phase: 4,
    taskNumber: '4.4',
    title: 'Remove silent location fallbacks',
    description:
      'getLocationCode() should throw on unknown location, not silently default to US (location code 2840). Add logging/error for any fallback.',
    fixRefs: ['G6'],
    keyFiles: ['packages/jobs/src/services/dataforseo-client.ts'],
    severity: 'MEDIUM',
  },
  {
    phase: 4,
    taskNumber: '4.5',
    title: 'REVIEW keyword workflow in admin',
    description:
      'Show REVIEW-decision keywords in dashboard with AI reasoning + signals. Add Approve (promotes to BID) and Reject (archives) buttons. Bulk actions for efficiency.',
    fixRefs: ['3b', '3c'],
    keyFiles: [
      'apps/admin/src/app/operations/bidding/page.tsx',
      'apps/admin/src/app/api/analytics/bidding/route.ts',
    ],
    severity: 'HIGH',
  },
  {
    phase: 4,
    taskNumber: '4.6',
    title: 'Keyword-level management in admin',
    description:
      'Add keyword table per campaign showing per-keyword impressions, clicks, CPC, conversions. Allow pause/resume individual keywords. Add manual bid override input per campaign.',
    fixRefs: ['9a', '9b'],
    keyFiles: [
      'apps/admin/src/app/operations/bidding/page.tsx',
      'apps/admin/src/app/api/analytics/bidding/route.ts',
    ],
    severity: 'HIGH',
  },
  {
    phase: 4,
    taskNumber: '4.7',
    title: 'Exploration budget allocation',
    description:
      'Reserve 10-20% of daily budget for random lower-scoring campaigns. Prevents starvation of the greedy algorithm and enables discovery of hidden winners.',
    fixRefs: ['4f'],
    keyFiles: ['packages/jobs/src/services/bidding-engine.ts'],
    severity: 'MEDIUM',
  },
  {
    phase: 4,
    taskNumber: '4.8',
    title: 'Hourly sync for ACTIVE campaigns',
    description:
      'Increase sync frequency for ACTIVE campaigns from daily to hourly. Keep daily for PAUSED. Reduces overspend detection lag from 24h to ~1h.',
    fixRefs: ['7a'],
    keyFiles: ['packages/jobs/src/schedulers/index.ts'],
    severity: 'MEDIUM',
  },
  {
    phase: 4,
    taskNumber: '4.9',
    title: 'Google Smart Bidding migration',
    description:
      'After sufficient conversion data (15+ conversions per campaign), migrate from MANUAL_CPC to tROAS. Keep MANUAL_CPC as default for new campaigns.',
    fixRefs: ['6c'],
    keyFiles: ['packages/jobs/src/services/google-ads-client.ts'],
    severity: 'HIGH',
  },
];

async function seed() {
  console.log(`Seeding ${TASKS.length} pipeline tasks...`);

  // Delete existing tasks (idempotent re-seed)
  await prisma.pipelineTaskEvent.deleteMany({});
  await prisma.pipelineTask.deleteMany({});

  for (const task of TASKS) {
    await prisma.pipelineTask.create({
      data: {
        phase: task.phase,
        taskNumber: task.taskNumber,
        title: task.title,
        description: task.description,
        fixRefs: task.fixRefs,
        keyFiles: task.keyFiles,
        severity: task.severity,
        status: 'PENDING',
        verificationQuery: task.verificationQuery || null,
        verificationTarget: task.verificationTarget || null,
      },
    });
    console.log(`  [${task.taskNumber}] ${task.title}`);
  }

  console.log(`\nSeeded ${TASKS.length} tasks across 4 phases.`);
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
