/**
 * Activate all Facebook campaigns (and their ad sets + ads) on Meta.
 *
 * This script handles TWO scenarios:
 * 1. Campaigns with status PAUSED in DB → activate campaign + children on Meta, update DB
 * 2. Campaigns with status ACTIVE in DB → ensure children (ad sets/ads) are ACTIVE on Meta
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/activate-paused-campaigns.ts [--dry-run]
 */

import { prisma } from '@experience-marketplace/database';
import { MetaAdsClient } from '../services/social/meta-ads-client';
import { refreshTokenIfNeeded } from '../services/social/token-refresh';

const DRY_RUN = process.argv.includes('--dry-run');

async function getMetaClient(): Promise<MetaAdsClient | null> {
  const adAccountId = process.env['META_AD_ACCOUNT_ID'];
  if (!adAccountId) return null;

  const accounts = await prisma.socialAccount.findMany({
    where: { platform: 'FACEBOOK', isActive: true },
    select: {
      id: true,
      platform: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      accountId: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Sort: encrypted tokens first (contain ':'), then plaintext
  const sorted = [...accounts].sort((a, b) => {
    const aEnc = a.accessToken?.includes(':') ? 0 : 1;
    const bEnc = b.accessToken?.includes(':') ? 0 : 1;
    return aEnc - bEnc;
  });

  for (const account of sorted) {
    if (!account.accessToken) continue;
    try {
      const { accessToken } = await refreshTokenIfNeeded(account);
      console.log(`Using Meta token from account ${account.id}`);
      return new MetaAdsClient({ accessToken, adAccountId });
    } catch (error) {
      console.warn(
        `Skipping account ${account.id}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  return null;
}

async function main() {
  console.log(`\n=== Activate All Meta Campaigns ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  const metaClient = await getMetaClient();
  if (!metaClient) {
    console.error('No Meta client — missing META_AD_ACCOUNT_ID or access token');
    process.exit(1);
  }

  // Get ALL deployed FB campaigns (both ACTIVE and PAUSED in DB)
  const campaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      platformCampaignId: { not: null },
      status: { in: ['ACTIVE', 'PAUSED'] },
    },
    select: {
      id: true,
      name: true,
      status: true,
      platformCampaignId: true,
    },
  });

  console.log(`Found ${campaigns.length} deployed FB campaigns.\n`);

  let campaignsActivated = 0;
  let adSetsActivated = 0;
  let adsActivated = 0;
  let failed = 0;

  for (let i = 0; i < campaigns.length; i++) {
    const campaign = campaigns[i]!;
    const metaId = campaign.platformCampaignId!;
    console.log(
      `[${i + 1}/${campaigns.length}] ${campaign.name} (${metaId}) DB status=${campaign.status}`
    );

    if (DRY_RUN) {
      console.log('  → Would process (dry run)\n');
      continue;
    }

    try {
      // Step 1: Activate children (ad sets + ads) regardless of campaign status
      const children = await metaClient.activateCampaignChildren(metaId);
      adSetsActivated += children.adSets;
      adsActivated += children.ads;

      if (children.adSets > 0 || children.ads > 0) {
        console.log(`  → Activated ${children.adSets} ad sets, ${children.ads} ads`);
      } else {
        console.log('  → All children already active');
      }

      // Step 2: If campaign itself is PAUSED on Meta, activate it
      const ok = await metaClient.setCampaignStatus(metaId, 'ACTIVE');
      if (ok) {
        campaignsActivated++;
        console.log('  → Campaign set to ACTIVE on Meta');
      }

      // Step 3: Ensure DB status is ACTIVE
      if (campaign.status !== 'ACTIVE') {
        await prisma.adCampaign.update({
          where: { id: campaign.id },
          data: { status: 'ACTIVE' },
        });
        console.log('  → DB status updated to ACTIVE');
      }

      console.log('');
    } catch (error) {
      failed++;
      console.error(`  → ERROR: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Campaigns processed: ${campaigns.length}`);
  console.log(`Campaigns activated on Meta: ${campaignsActivated}`);
  console.log(`Ad sets activated: ${adSetsActivated}`);
  console.log(`Ads activated: ${adsActivated}`);
  console.log(`Failed: ${failed}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
