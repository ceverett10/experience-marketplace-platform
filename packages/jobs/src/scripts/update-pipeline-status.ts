/**
 * Update Pipeline Tracker: mark all completed tasks as DEPLOYED
 * with implementation notes and commit references.
 *
 * Run: npx ts-node packages/jobs/src/scripts/update-pipeline-status.ts
 */

import { prisma } from '@experience-marketplace/database';

interface TaskUpdate {
  taskNumber: string;
  status: 'DEPLOYED';
  notes: string;
  prUrl?: string;
}

const UPDATES: TaskUpdate[] = [
  // ═══════════════════════════════════════════════════════════════
  // PHASE 1 — Foundation & Data Quality (committed d10f3fe, 353cc87)
  // ═══════════════════════════════════════════════════════════════
  {
    taskNumber: '1.1',
    status: 'DEPLOYED',
    notes:
      'Bulk product cache implemented in product-sync.ts. Uses getAllProducts() for initial load, then incremental per-supplier sync. Committed d10f3fe.',
  },
  {
    taskNumber: '1.2',
    status: 'DEPLOYED',
    notes:
      'Supplier cities/categories backfilled from cached products after sync. Aggregation runs automatically after each product sync batch. Committed d10f3fe.',
  },
  {
    taskNumber: '1.3',
    status: 'DEPLOYED',
    notes:
      'Created shared utility extractDestinationFromKeyword() in packages/jobs/src/utils/keyword-location.ts. Both paid-keyword-scanner and keyword-enrichment now use destination city from keyword text. Dedup keys changed to keyword-only (no location suffix). Committed 353cc87.',
  },
  {
    taskNumber: '1.4',
    status: 'DEPLOYED',
    notes:
      'Removed estimateSearchVolume(), estimateCpc(), estimateDifficulty() from opportunity.ts. Keywords are now skipped when DataForSEO fails instead of storing random data. Committed d10f3fe.',
  },
  {
    taskNumber: '1.5',
    status: 'DEPLOYED',
    notes:
      'Replaced Holibob API city validation in bidding-engine.ts with local prisma.product.findFirst() query using in-memory cache. Removed LandingPageValidator and createHolibobClient imports. Committed 353cc87.',
  },
  {
    taskNumber: '1.6',
    status: 'DEPLOYED',
    notes:
      'keyword-enrichment.ts now reads from prisma.product.findMany({ where: { supplierId } }) instead of getProductsByProvider() API call. Enrichment works offline from local DB. Committed 353cc87.',
  },

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2 — Campaign Quality (committed 48cf4b8)
  // ═══════════════════════════════════════════════════════════════
  {
    taskNumber: '2.1',
    status: 'DEPLOYED',
    notes:
      'Added extractSearchQuery() call in buildSupplierMicrositeLandingPage(). URLs now include ?q= param alongside ?cities= and ?categories= for keyword-relevant filtering. Committed 48cf4b8.',
  },
  {
    taskNumber: '2.2',
    status: 'DEPLOYED',
    notes:
      'Extended MicrositeMatch type with categories[]. City matching (step 3) now scores microsites by category relevance * 100 + product count. Walking tour keywords route to walking tour suppliers, not taxi companies. Committed 48cf4b8.',
  },
  {
    taskNumber: '2.3',
    status: 'DEPLOYED',
    notes:
      'Changed EXPERIENCES_FILTERED filter to allow main site pages when they have ?q= search params. Previously blanket-rejected all non-microsite search pages. Committed 48cf4b8.',
  },
  {
    taskNumber: '2.4',
    status: 'DEPLOYED',
    notes:
      'Added AI evaluation gate in scoreCampaignOpportunities(). Only keywords with decision="BID" or no evaluation proceed. REVIEW-decision keywords are filtered out. Committed 48cf4b8.',
  },
  {
    taskNumber: '2.5',
    status: 'DEPLOYED',
    notes:
      'Rewrote findRelevantInterests() to separate destination and activity extraction. Searches destination-specific interests first, then activity-specific. Removed generic "travel" fallback. Filters irrelevant interests (sports, crypto, etc). Committed 48cf4b8.',
  },
  {
    taskNumber: '2.6',
    status: 'DEPLOYED',
    notes:
      'Replaced generateHeadlines()/generateDescriptions() with async generateGoogleRSA() using Claude Haiku. Falls back to generateGoogleRSATemplate() if AI unavailable. Removed "Free cancellation available" from all templates. Committed 48cf4b8.',
  },

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3 — Campaign Lifecycle (committed 264101c)
  // ═══════════════════════════════════════════════════════════════
  {
    taskNumber: '3.1',
    status: 'DEPLOYED',
    notes:
      'Added auto-activation in handleAdBudgetOptimizer(). PAUSED campaigns older than 24h with coherence score >= 6 are activated via Meta/Google API. Campaigns without coherence data or with pauseReason are skipped. Committed 264101c.',
  },
  {
    taskNumber: '3.2',
    status: 'DEPLOYED',
    notes:
      'Added bid adjustment in optimizer loop. Campaigns with 7+ days data and £10+ spend: ROAS >= 2.0 gets +10% bid, ROAS < 0.8 gets -10% bid. Uses getAdSetsForCampaign() then updateBid() on Meta. Updates local maxCpc. Committed 264101c.',
  },
  {
    taskNumber: '3.3',
    status: 'DEPLOYED',
    notes:
      'Added updateCampaignBudget() method to MetaAdsClient. After budget scale in optimizer, calls metaClient.updateCampaignBudget(campaignId, newBudgetCents) to sync to platform. Committed 264101c.',
  },
  {
    taskNumber: '3.4',
    status: 'DEPLOYED',
    notes:
      'Added fast-fail check at start of optimizer loop. Campaigns with 3+ days, £25+ spend, and 0 conversions are immediately paused with pauseReason: ZERO_CONVERSION_FAST_FAIL. Syncs pause to Meta/Google. Committed 264101c.',
  },
  {
    taskNumber: '3.5',
    status: 'DEPLOYED',
    notes:
      'Added AD_CREATIVE_REFRESH to scheduler at 0 6 * * 3 (Wednesdays at 6 AM). The handler already existed — just needed a cron entry. Committed 264101c.',
  },
  {
    taskNumber: '3.6',
    status: 'DEPLOYED',
    notes:
      'Uncommented PAID_KEYWORD_SCAN in scheduler. Changed from daily to weekly (Tuesdays at 3 AM) to manage DataForSEO costs (~$1.10/run). All 5 modes enabled: gsc, expansion, discovery, pinterest, meta. Committed 264101c.',
  },

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4 — Global Expansion & Polish (committed f231cdc)
  // ═══════════════════════════════════════════════════════════════
  {
    taskNumber: '4.1',
    status: 'DEPLOYED',
    notes:
      'Added targetMarkets: String[] to Site model (default: GB,US,CA,AU,IE,NZ). deployToMeta() and handleAdCreativeRefresh() now read site.targetMarkets instead of hardcoded SOURCE_MARKETS. Migration: 20260219100000. Committed f231cdc.',
  },
  {
    taskNumber: '4.2',
    status: 'DEPLOYED',
    notes:
      'Added primaryCurrency: String to Site model (default: GBP). Migration: 20260219100000. Field available for downstream use in budget calculations and analytics. Committed f231cdc.',
  },
  {
    taskNumber: '4.3',
    status: 'DEPLOYED',
    notes:
      'Changed keyword-research.ts defaults from "United States" to "United Kingdom". Added 45+ countries to DataForSEO commonLocations map. Keyword enrichment uses per-keyword destination city via seedToCity map. Committed f231cdc.',
  },
  {
    taskNumber: '4.4',
    status: 'DEPLOYED',
    notes:
      'Replaced silent US fallback in getLocationCode() with console.warn() logging the unknown location before falling back. Helps identify which locations need to be added to commonLocations map. Committed f231cdc.',
  },
  {
    taskNumber: '4.5',
    status: 'DEPLOYED',
    notes:
      'Added approve_keyword, reject_keyword, bulk_approve_keywords, bulk_reject_keywords actions to /api/analytics/bidding POST handler. Approve promotes REVIEW to BID with humanOverride flag. Reject archives. Committed f231cdc.',
  },
  {
    taskNumber: '4.6',
    status: 'DEPLOYED',
    notes:
      'Added pause_keyword (adds to negativeKeywords in proposalData) and override_bid (sets maxCpc with bidOverride flag) actions to /api/analytics/bidding POST handler. Committed f231cdc.',
  },
  {
    taskNumber: '4.7',
    status: 'DEPLOYED',
    notes:
      'Added 15% exploration budget to selectCampaignCandidates(). Top candidates get 85% budget via greedy allocation. Remaining 15% goes to randomly shuffled lower-scoring candidates to prevent starvation. Committed f231cdc.',
  },
  {
    taskNumber: '4.8',
    status: 'DEPLOYED',
    notes:
      'Changed AD_CAMPAIGN_SYNC schedule from "0 */3 * * *" (every 3 hours) to "0 * * * *" (hourly). Reduces overspend detection lag from 3h to 1h. Committed f231cdc.',
  },
  {
    taskNumber: '4.9',
    status: 'DEPLOYED',
    notes:
      'Added migrateToSmartBidding() function to google-ads-client.ts (MANUAL_CPC → TARGET_ROAS). Budget optimizer calls it for Google campaigns with 15+ conversions. Tracks smartBiddingMigrated flag in proposalData. Committed f231cdc.',
  },
];

async function updateStatuses() {
  console.log(`Updating ${UPDATES.length} pipeline tasks to DEPLOYED...`);

  const now = new Date();
  let updated = 0;

  for (const update of UPDATES) {
    const task = await prisma.pipelineTask.findFirst({
      where: { taskNumber: update.taskNumber },
    });

    if (!task) {
      console.warn(`  [${update.taskNumber}] NOT FOUND — skipping`);
      continue;
    }

    // Update the task
    await prisma.pipelineTask.update({
      where: { id: task.id },
      data: {
        status: update.status,
        implementedAt: now,
        deployedAt: now,
        notes: update.notes,
        ...(update.prUrl ? { prUrl: update.prUrl } : {}),
      },
    });

    // Create timeline event
    await prisma.pipelineTaskEvent.create({
      data: {
        taskId: task.id,
        fromStatus: task.status,
        toStatus: update.status,
        note: 'Bulk status update — all phases implemented and pushed to main',
      },
    });

    updated++;
    console.log(`  [${update.taskNumber}] ${task.title} → ${update.status}`);
  }

  console.log(`\nUpdated ${updated}/${UPDATES.length} tasks.`);
}

updateStatuses()
  .catch((err) => {
    console.error('Update failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
