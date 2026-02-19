/**
 * Bulk deploy DRAFT Google Search campaigns and optionally enable PAUSED ones.
 *
 * Uses the full AI-powered RSA pipeline (same as Meta ads):
 *   Site context → Claude Haiku generation → coherence check → auto-remediation
 *
 * Three modes:
 *   --audit    Show campaign counts by status (default if no flags)
 *   --deploy   Deploy all DRAFT GOOGLE_SEARCH → Google Ads (creates as PAUSED)
 *   --enable   Enable all PAUSED campaigns that have a platformCampaignId
 *
 * Usage:
 *   heroku run "npx tsx packages/jobs/src/scripts/bulk-deploy-google-campaigns.ts --audit" \
 *     --app holibob-experiences-demand-gen
 *
 *   heroku run "npx tsx packages/jobs/src/scripts/bulk-deploy-google-campaigns.ts --deploy" \
 *     --app holibob-experiences-demand-gen
 *
 *   heroku run "npx tsx packages/jobs/src/scripts/bulk-deploy-google-campaigns.ts --deploy --enable" \
 *     --app holibob-experiences-demand-gen
 */

import { PrismaClient } from '@prisma/client';
import { isGoogleAdsConfigured, setCampaignStatus } from '../services/google-ads-client';
import { deployDraftCampaigns } from '../workers/ads';

const prisma = new PrismaClient();

// ---------- Audit ------------------------------------------------------------

async function audit() {
  console.log('\n=== Google Search Campaign Audit ===\n');

  const campaigns = await prisma.adCampaign.findMany({
    where: { platform: 'GOOGLE_SEARCH' },
    include: { site: { select: { name: true, primaryDomain: true } } },
    orderBy: { createdAt: 'desc' },
  });

  if (campaigns.length === 0) {
    console.log('No GOOGLE_SEARCH campaigns found in database.');
    return;
  }

  // Count by status
  const byStatus: Record<string, number> = {};
  for (const c of campaigns) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  }

  console.log('Status breakdown:');
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log(`  TOTAL: ${campaigns.length}`);

  // Show DRAFT campaigns
  const drafts = campaigns.filter((c) => c.status === 'DRAFT');
  if (drafts.length > 0) {
    console.log(`\n--- ${drafts.length} DRAFT campaigns (ready to deploy) ---`);
    for (const c of drafts.slice(0, 20)) {
      console.log(
        `  ${c.id.substring(0, 12)}... | ${c.name.substring(0, 50).padEnd(50)} | £${Number(c.dailyBudget).toFixed(2)}/day | ${c.keywords.length} kw | ${c.site?.name || 'unknown'}`
      );
    }
    if (drafts.length > 20) console.log(`  ... and ${drafts.length - 20} more`);
  }

  // Show PAUSED campaigns (deployed but not enabled)
  const paused = campaigns.filter((c) => c.status === 'PAUSED');
  const pausedWithPlatformId = paused.filter((c) => c.platformCampaignId);
  if (paused.length > 0) {
    console.log(`\n--- ${paused.length} PAUSED campaigns ---`);
    console.log(`  With Google ID (can enable):     ${pausedWithPlatformId.length}`);
    console.log(
      `  Without Google ID (need deploy):  ${paused.length - pausedWithPlatformId.length}`
    );
    for (const c of pausedWithPlatformId.slice(0, 10)) {
      console.log(
        `  ${c.id.substring(0, 12)}... | Google: ${c.platformCampaignId} | ${c.name.substring(0, 40)} | ${c.site?.name || 'unknown'}`
      );
    }
    if (pausedWithPlatformId.length > 10)
      console.log(`  ... and ${pausedWithPlatformId.length - 10} more`);
  }

  // Show ACTIVE campaigns
  const active = campaigns.filter((c) => c.status === 'ACTIVE');
  if (active.length > 0) {
    console.log(`\n--- ${active.length} ACTIVE campaigns ---`);
    for (const c of active.slice(0, 10)) {
      console.log(
        `  ${c.id.substring(0, 12)}... | Google: ${c.platformCampaignId} | ${c.name.substring(0, 40)} | £${Number(c.dailyBudget).toFixed(2)}/day`
      );
    }
  }

  // Estimate deployment time (4 Google API calls + 1-2 AI calls per campaign)
  if (drafts.length > 0) {
    const estCalls = drafts.length * 4;
    const estMinutes = Math.ceil(estCalls / 15); // 15 calls/min rate limit
    console.log(
      `\nEstimated deployment time for ${drafts.length} DRAFTs: ~${estMinutes} min (${estCalls} API calls @ 15/min)`
    );
  }

  // Estimate total daily budget
  const totalDailyBudget = campaigns
    .filter((c) => c.status === 'DRAFT' || c.status === 'PAUSED' || c.status === 'ACTIVE')
    .reduce((sum, c) => sum + Number(c.dailyBudget), 0);
  console.log(`\nTotal daily budget (DRAFT+PAUSED+ACTIVE): £${totalDailyBudget.toFixed(2)}/day`);
}

// ---------- Deploy -----------------------------------------------------------

async function deploy() {
  console.log('\n=== Deploying DRAFT Google Search Campaigns (AI Pipeline) ===\n');

  if (!isGoogleAdsConfigured()) {
    console.error('FAIL: Google Ads not configured (missing env vars)');
    process.exit(1);
  }

  // Uses the full AI-powered pipeline from ads.ts:
  //   Site context → Claude Haiku RSA generation → coherence check → remediation → template fallback
  const result = await deployDraftCampaigns(undefined, { platform: 'GOOGLE_SEARCH' });

  console.log(`\n=== Deployment Complete ===`);
  console.log(`  Deployed: ${result.deployed}`);
  console.log(`  Failed:   ${result.failed}`);
  console.log(`  Skipped:  ${result.skipped}`);
}

// ---------- Enable -----------------------------------------------------------

async function enable() {
  console.log('\n=== Enabling PAUSED Google Search Campaigns ===\n');

  if (!isGoogleAdsConfigured()) {
    console.error('FAIL: Google Ads not configured (missing env vars)');
    process.exit(1);
  }

  const paused = await prisma.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      status: 'PAUSED',
      platformCampaignId: { not: null },
    },
    include: { site: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (paused.length === 0) {
    console.log('No PAUSED Google Search campaigns with platform IDs to enable.');
    return { enabled: 0, failed: 0 };
  }

  console.log(`Found ${paused.length} PAUSED campaigns to enable.\n`);

  let enabled = 0;
  let failed = 0;

  for (let i = 0; i < paused.length; i++) {
    const campaign = paused[i]!;
    const progress = `[${i + 1}/${paused.length}]`;

    try {
      console.log(
        `${progress} Enabling: ${campaign.name} (Google: ${campaign.platformCampaignId})`
      );
      await setCampaignStatus(campaign.platformCampaignId!, 'ENABLED');
      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: { status: 'ACTIVE' },
      });
      console.log(`  OK: ACTIVE`);
      enabled++;
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n=== Enable Complete ===`);
  console.log(`  Enabled: ${enabled}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total:   ${paused.length}`);
  return { enabled, failed };
}

// ---------- Main -------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const shouldDeploy = args.includes('--deploy');
  const shouldEnable = args.includes('--enable');
  const shouldAudit = args.includes('--audit') || (!shouldDeploy && !shouldEnable);

  if (shouldAudit) {
    await audit();
  }

  if (shouldDeploy) {
    await deploy();
  }

  if (shouldEnable) {
    await enable();
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
