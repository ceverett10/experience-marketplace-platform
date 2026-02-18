/**
 * Activate all PAUSED Facebook campaigns on Meta.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/activate-paused-campaigns.ts [--dry-run]
 */

import { prisma } from '@experience-marketplace/database';
import { MetaAdsClient } from '../services/social/meta-ads-client';

const DRY_RUN = process.argv.includes('--dry-run');

async function getMetaClient(): Promise<MetaAdsClient | null> {
  const adAccountId = process.env['META_AD_ACCOUNT_ID'];
  if (!adAccountId) return null;

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
