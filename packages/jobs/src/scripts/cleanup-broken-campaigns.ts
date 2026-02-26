/**
 * Cleanup script: Audit and fix all broken Google Ads campaigns.
 *
 * Categorises ACTIVE campaigns into 4 buckets:
 *   1. REMOVED — exist as ACTIVE in DB but deleted from Google Ads
 *   2. PAUSED  — policy violations (paused by Google), should not be redeployed
 *   3. MISSING_ADS — ad groups exist but RSA creation failed
 *   4. EMPTY_SHELL — no ad groups, no keywords, no ads at all
 *
 * Actions:
 *   - Categories 1 & 2: mark FAILED in DB (+ remove from Google for cat 2)
 *   - Categories 3 & 4: fix targetUrl, reset to DRAFT for redeployment
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/cleanup-broken-campaigns.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/cleanup-broken-campaigns.ts
 *
 * Run on Heroku:
 *   heroku run:detached "npx tsx packages/jobs/src/scripts/cleanup-broken-campaigns.ts --dry-run" \
 *     --app holibob-experiences-demand-gen
 */

import { PrismaClient } from '@prisma/client';
import {
  getConfig,
  apiRequest,
  flattenStreamResults,
  removeGoogleCampaign,
} from '../services/google-ads-client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignRecord {
  id: string;
  name: string;
  platformCampaignId: string;
  targetUrl: string;
  status: string;
}

interface GoogleCampaignInfo {
  id: string;
  status: string; // ENABLED, PAUSED, REMOVED
  servingStatus: string; // SERVING, SUSPENDED, PENDING, ENDED, NONE
  hasAdGroups: boolean;
  hasAds: boolean;
}

type Category = 'removed' | 'policy_violation' | 'missing_ads' | 'empty_shell' | 'healthy';

// ---------------------------------------------------------------------------
// Phase 1: Audit — query Google Ads for campaign states
// ---------------------------------------------------------------------------

async function fetchGoogleCampaignStates(
  campaignIds: string[]
): Promise<Map<string, GoogleCampaignInfo>> {
  const config = getConfig();
  if (!config) throw new Error('Google Ads not configured');

  const result = new Map<string, GoogleCampaignInfo>();

  // Batch GAQL queries in chunks of 100 campaign IDs
  const BATCH_SIZE = 100;
  for (let i = 0; i < campaignIds.length; i += BATCH_SIZE) {
    const batch = campaignIds.slice(i, i + BATCH_SIZE);
    const idList = batch.join(',');

    // Query 1: Campaign status + serving status
    try {
      const statusQuery = `
        SELECT campaign.id, campaign.status, campaign.serving_status
        FROM campaign
        WHERE campaign.id IN (${idList})
      `.trim();

      const raw = await apiRequest(config, 'POST', '/googleAds:searchStream', {
        query: statusQuery,
      });
      const rows = flattenStreamResults<{
        campaign: { id: string; status: string; servingStatus: string };
      }>(raw);

      for (const row of rows) {
        result.set(row.campaign.id, {
          id: row.campaign.id,
          status: row.campaign.status,
          servingStatus: row.campaign.servingStatus,
          hasAdGroups: false,
          hasAds: false,
        });
      }
    } catch (error) {
      console.error(`[Cleanup] Failed to fetch campaign statuses for batch at offset ${i}:`, error);
    }

    // Query 2: Check for ad groups
    try {
      const agQuery = `
        SELECT campaign.id, ad_group.id
        FROM ad_group
        WHERE campaign.id IN (${idList})
          AND ad_group.status != 'REMOVED'
      `.trim();

      const agRaw = await apiRequest(config, 'POST', '/googleAds:searchStream', {
        query: agQuery,
      });
      const agRows = flattenStreamResults<{
        campaign: { id: string };
        adGroup: { id: string };
      }>(agRaw);

      const campaignsWithAdGroups = new Set(agRows.map((r) => r.campaign.id));
      for (const cid of campaignsWithAdGroups) {
        const info = result.get(cid);
        if (info) info.hasAdGroups = true;
      }
    } catch {
      // Non-critical — if query fails we'll treat as no ad groups
    }

    // Query 3: Check for ads
    try {
      const adQuery = `
        SELECT campaign.id, ad_group_ad.ad.id
        FROM ad_group_ad
        WHERE campaign.id IN (${idList})
          AND ad_group_ad.status != 'REMOVED'
      `.trim();

      const adRaw = await apiRequest(config, 'POST', '/googleAds:searchStream', {
        query: adQuery,
      });
      const adRows = flattenStreamResults<{
        campaign: { id: string };
        adGroupAd: { ad: { id: string } };
      }>(adRaw);

      const campaignsWithAds = new Set(adRows.map((r) => r.campaign.id));
      for (const cid of campaignsWithAds) {
        const info = result.get(cid);
        if (info) info.hasAds = true;
      }
    } catch {
      // Non-critical
    }

    if (i + BATCH_SIZE < campaignIds.length) {
      console.log(
        `[Cleanup] Fetched Google state for ${Math.min(i + BATCH_SIZE, campaignIds.length)}/${campaignIds.length} campaigns`
      );
    }
  }

  return result;
}

function categoriseCampaign(
  dbCampaign: CampaignRecord,
  googleInfo: GoogleCampaignInfo | undefined
): Category {
  // Not found in Google at all → removed
  if (!googleInfo) return 'removed';

  // REMOVED status in Google → removed
  if (googleInfo.status === 'REMOVED') return 'removed';

  // PAUSED by Google with non-SERVING status → policy violation
  if (googleInfo.status === 'PAUSED' && googleInfo.servingStatus !== 'SERVING') {
    return 'policy_violation';
  }

  // No ad groups → empty shell
  if (!googleInfo.hasAdGroups) return 'empty_shell';

  // Ad groups but no ads → missing ads
  if (!googleInfo.hasAds) return 'missing_ads';

  return 'healthy';
}

function ensureProtocol(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

// ---------------------------------------------------------------------------
// Phase 2–4: Fix actions
// ---------------------------------------------------------------------------

async function markFailed(
  campaign: CampaignRecord,
  reason: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    console.log(`  [DRY RUN] Would mark FAILED: "${campaign.name}" (reason: ${reason})`);
    return;
  }

  const existing = await prisma.adCampaign.findUnique({
    where: { id: campaign.id },
    select: { proposalData: true },
  });

  await prisma.adCampaign.update({
    where: { id: campaign.id },
    data: {
      status: 'FAILED',
      proposalData: {
        ...(typeof existing?.proposalData === 'object' && existing?.proposalData !== null
          ? existing.proposalData
          : {}),
        removedReason: reason,
        cleanupAt: new Date().toISOString(),
      },
    },
  });
}

async function resetToDraft(campaign: CampaignRecord, dryRun: boolean): Promise<void> {
  // Fix targetUrl — add https:// if missing
  let fixedUrl = campaign.targetUrl;
  try {
    fixedUrl = ensureProtocol(campaign.targetUrl);
    new URL(fixedUrl); // Validate
  } catch {
    console.log(`  SKIP: "${campaign.name}" — invalid URL even after fix: ${campaign.targetUrl}`);
    await markFailed(campaign, 'invalid_target_url', dryRun);
    return;
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would reset to DRAFT: "${campaign.name}" (url: ${fixedUrl})`);
    return;
  }

  await prisma.adCampaign.update({
    where: { id: campaign.id },
    data: {
      status: 'DRAFT',
      platformCampaignId: null,
      targetUrl: fixedUrl,
    },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\n=== Google Ads Campaign Cleanup ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  // Step 1: Get all ACTIVE Google campaigns from DB with platformCampaignId
  const dbCampaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      status: 'ACTIVE',
      platformCampaignId: { not: null },
    },
    select: {
      id: true,
      name: true,
      platformCampaignId: true,
      targetUrl: true,
      status: true,
    },
  });

  console.log(`Found ${dbCampaigns.length} ACTIVE Google campaigns in DB\n`);

  if (dbCampaigns.length === 0) {
    console.log('Nothing to clean up.');
    return;
  }

  // Step 2: Fetch states from Google Ads API
  const googleIds = dbCampaigns.map((c) => c.platformCampaignId!).filter((id) => id);

  console.log(`Querying Google Ads API for ${googleIds.length} campaign states...\n`);
  const googleStates = await fetchGoogleCampaignStates(googleIds);

  // Step 3: Categorise
  const buckets: Record<Category, CampaignRecord[]> = {
    removed: [],
    policy_violation: [],
    missing_ads: [],
    empty_shell: [],
    healthy: [],
  };

  for (const dbCamp of dbCampaigns) {
    const campaign: CampaignRecord = {
      id: dbCamp.id,
      name: dbCamp.name,
      platformCampaignId: dbCamp.platformCampaignId!,
      targetUrl: dbCamp.targetUrl,
      status: dbCamp.status,
    };

    const googleInfo = googleStates.get(campaign.platformCampaignId);
    const category = categoriseCampaign(campaign, googleInfo);
    buckets[category].push(campaign);
  }

  // Print summary
  console.log('=== Audit Results ===');
  console.log(`  Healthy:          ${buckets.healthy.length}`);
  console.log(`  Removed:          ${buckets.removed.length}`);
  console.log(`  Policy violation: ${buckets.policy_violation.length}`);
  console.log(`  Missing ads:      ${buckets.missing_ads.length}`);
  console.log(`  Empty shell:      ${buckets.empty_shell.length}`);
  console.log();

  // Phase 2: Mark removed campaigns → FAILED
  if (buckets.removed.length > 0) {
    console.log(`\n--- Phase 2: Mark ${buckets.removed.length} removed campaigns as FAILED ---`);
    for (const campaign of buckets.removed) {
      await markFailed(campaign, 'not_found_in_google', dryRun);
      if (!dryRun) {
        console.log(`  FAILED: "${campaign.name}" (Google ID: ${campaign.platformCampaignId})`);
      }
    }
  }

  // Phase 3: Mark policy-violation campaigns → FAILED + remove from Google
  if (buckets.policy_violation.length > 0) {
    console.log(
      `\n--- Phase 3: Mark ${buckets.policy_violation.length} policy-violation campaigns as FAILED ---`
    );
    for (const campaign of buckets.policy_violation) {
      if (!dryRun) {
        const removed = await removeGoogleCampaign(campaign.platformCampaignId);
        console.log(
          `  ${removed ? 'Removed from Google +' : 'Google removal failed, still'} marking FAILED: "${campaign.name}"`
        );
      }
      await markFailed(campaign, 'google_policy_violation', dryRun);
    }
  }

  // Phase 4: Fix & reset missing_ads + empty_shell → DRAFT for redeployment
  const redeployable = [...buckets.missing_ads, ...buckets.empty_shell];
  if (redeployable.length > 0) {
    console.log(
      `\n--- Phase 4: Reset ${redeployable.length} broken campaigns to DRAFT for redeployment ---`
    );
    for (const campaign of redeployable) {
      if (!dryRun) {
        // Remove old shell from Google first
        await removeGoogleCampaign(campaign.platformCampaignId);
      }
      await resetToDraft(campaign, dryRun);
      if (!dryRun) {
        console.log(`  DRAFT: "${campaign.name}" (old Google ID: ${campaign.platformCampaignId})`);
      }
    }
  }

  // Summary
  const totalFixed = buckets.removed.length + buckets.policy_violation.length + redeployable.length;
  console.log(`\n=== Cleanup Complete ===`);
  console.log(`  Marked FAILED: ${buckets.removed.length + buckets.policy_violation.length}`);
  console.log(`  Reset to DRAFT: ${redeployable.length}`);
  console.log(`  Total fixed: ${totalFixed}`);
  console.log(`  Healthy (untouched): ${buckets.healthy.length}`);

  if (redeployable.length > 0 && !dryRun) {
    console.log(
      `\nRun deploy-draft-campaigns.ts to redeploy the ${redeployable.length} reset campaigns.`
    );
  }
}

main()
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
