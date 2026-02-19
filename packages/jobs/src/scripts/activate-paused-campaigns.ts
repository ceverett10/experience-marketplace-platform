/**
 * Activate all PAUSED Facebook campaigns on Meta.
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
  console.log(`\n=== Activate PAUSED Campaigns ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  const metaClient = await getMetaClient();
  if (!metaClient) {
    console.error('No Meta client — missing META_AD_ACCOUNT_ID or access token');
    process.exit(1);
  }

  const campaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      status: 'PAUSED',
      platformCampaignId: { not: null },
    },
    select: {
      id: true,
      name: true,
      platformCampaignId: true,
    },
  });

  console.log(`Found ${campaigns.length} PAUSED campaigns to activate.\n`);

  let activated = 0;
  let failed = 0;

  for (const campaign of campaigns) {
    const metaId = campaign.platformCampaignId!;
    console.log(`[${activated + failed + 1}/${campaigns.length}] ${campaign.name} (${metaId})`);

    if (DRY_RUN) {
      console.log('  → Would activate (dry run)\n');
      activated++;
      continue;
    }

    const ok = await metaClient.setCampaignStatus(metaId, 'ACTIVE');
    if (ok) {
      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: { status: 'ACTIVE' },
      });
      console.log('  → Activated on Meta + DB\n');
      activated++;
    } else {
      console.log('  → FAILED to activate on Meta\n');
      failed++;
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Activated: ${activated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${campaigns.length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
