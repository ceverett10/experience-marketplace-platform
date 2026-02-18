/**
 * Archive all existing AdCampaigns and pause them on Meta/Google.
 *
 * Run this AFTER deploying the source-supplier-preference fix to the bidding engine,
 * then re-run the bidding engine in "full" mode to recreate campaigns with correct routing.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/archive-and-rebuild-campaigns.ts [--dry-run]
 */

import { prisma } from '@experience-marketplace/database';
import { MetaAdsClient } from '../services/social/meta-ads-client';
import {
  isGoogleAdsConfigured,
  setCampaignStatus as setGoogleCampaignStatus,
} from '../services/google-ads-client';

const DRY_RUN = process.argv.includes('--dry-run');

async function getMetaClient(): Promise<MetaAdsClient | null> {
  const adAccountId = process.env['META_AD_ACCOUNT_ID'];
  if (!adAccountId) return null;

  // Find a usable Meta access token
  const accounts = await prisma.socialAccount.findMany({
    where: { platform: 'FACEBOOK', isActive: true },
    select: { accessToken: true },
    orderBy: { updatedAt: 'desc' },
    take: 1,
  });

  const token = accounts[0]?.accessToken;
  if (!token) return null;

  return new MetaAdsClient({ accessToken: token, adAccountId });
}

async function main() {
  console.log(`\n=== Archive & Rebuild Campaigns ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  // Find all non-archived campaigns
  const campaigns = await prisma.adCampaign.findMany({
    where: { status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] } },
    select: {
      id: true,
      name: true,
      status: true,
      platform: true,
      platformCampaignId: true,
      micrositeId: true,
      landingPagePath: true,
      keywords: true,
    },
  });

  console.log(`Found ${campaigns.length} campaigns to archive:`);
  const byStatus = { ACTIVE: 0, PAUSED: 0, DRAFT: 0 };
  const byPlatform = { FACEBOOK: 0, GOOGLE_SEARCH: 0, OTHER: 0 };
  let withPlatformId = 0;

  for (const c of campaigns) {
    byStatus[c.status as keyof typeof byStatus] = (byStatus[c.status as keyof typeof byStatus] || 0) + 1;
    const plat = c.platform === 'FACEBOOK' ? 'FACEBOOK' : c.platform === 'GOOGLE_SEARCH' ? 'GOOGLE_SEARCH' : 'OTHER';
    byPlatform[plat]++;
    if (c.platformCampaignId) withPlatformId++;
  }

  console.log(`  By status: ACTIVE=${byStatus.ACTIVE}, PAUSED=${byStatus.PAUSED}, DRAFT=${byStatus.DRAFT}`);
  console.log(`  By platform: Facebook=${byPlatform.FACEBOOK}, Google=${byPlatform.GOOGLE_SEARCH}`);
  console.log(`  With platform ID (deployed): ${withPlatformId}\n`);

  if (campaigns.length === 0) {
    console.log('Nothing to archive.');
    await prisma.$disconnect();
    return;
  }

  // Pause deployed campaigns on ad platforms
  const metaClient = await getMetaClient();
  let metaPaused = 0;
  let metaFailed = 0;
  let googlePaused = 0;
  let googleFailed = 0;

  for (const c of campaigns) {
    if (!c.platformCampaignId) continue;

    if (c.platform === 'FACEBOOK' && metaClient) {
      console.log(`  Pausing Meta campaign: ${c.platformCampaignId} (${c.name})`);
      if (!DRY_RUN) {
        const ok = await metaClient.setCampaignStatus(c.platformCampaignId, 'PAUSED');
        if (ok) {
          metaPaused++;
        } else {
          metaFailed++;
          console.warn(`    FAILED to pause Meta campaign ${c.platformCampaignId}`);
        }
      } else {
        metaPaused++;
      }
    } else if (c.platform === 'GOOGLE_SEARCH' && isGoogleAdsConfigured()) {
      console.log(`  Pausing Google campaign: ${c.platformCampaignId} (${c.name})`);
      if (!DRY_RUN) {
        try {
          await setGoogleCampaignStatus(c.platformCampaignId, 'PAUSED');
          googlePaused++;
        } catch (err) {
          googleFailed++;
          console.warn(`    FAILED to pause Google campaign ${c.platformCampaignId}:`, err);
        }
      } else {
        googlePaused++;
      }
    }
  }

  console.log(`\nPlatform pause results:`);
  console.log(`  Meta: ${metaPaused} paused, ${metaFailed} failed`);
  console.log(`  Google: ${googlePaused} paused, ${googleFailed} failed`);

  // Archive all campaigns in database
  if (!DRY_RUN) {
    const result = await prisma.adCampaign.updateMany({
      where: { id: { in: campaigns.map((c) => c.id) } },
      data: { status: 'ARCHIVED' as any },
    });
    console.log(`\nArchived ${result.count} campaigns in database.`);
  } else {
    console.log(`\n[DRY RUN] Would archive ${campaigns.length} campaigns in database.`);
  }

  console.log(`\nNext steps:`);
  console.log(`  1. Run bidding engine in report_only mode to verify new routing`);
  console.log(`  2. Run bidding engine in full mode to create fresh campaigns`);
  console.log(`  3. Deploy new campaigns to platforms\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
