/**
 * Quick script to check Google Ads account performance.
 * Usage: npx tsx packages/jobs/src/scripts/check-google-performance.ts
 */
import { getCampaignPerformance } from '../services/google-ads-client.js';
import { prisma } from '@experience-marketplace/database';

async function main() {
  // Get a sample of active Google campaigns from the database
  const campaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      status: 'ACTIVE',
      platformCampaignId: { not: null },
    },
    take: 20,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      platformCampaignId: true,
    },
  });

  console.info(`Checking performance for ${campaigns.length} sample campaigns...`);
  console.info('');

  let totalClicks = 0;
  let totalImpressions = 0;
  let totalSpend = 0;

  const today = new Date().toISOString().split('T')[0]!;

  for (const campaign of campaigns) {
    const perf = await getCampaignPerformance(campaign.platformCampaignId!, {
      startDate: today,
      endDate: today,
    });

    if (perf && (perf.impressions > 0 || perf.clicks > 0)) {
      console.info(
        `  ${campaign.name}: ${perf.impressions} impr, ${perf.clicks} clicks, £${perf.spend.toFixed(2)} spend`
      );
      totalClicks += perf.clicks;
      totalImpressions += perf.impressions;
      totalSpend += perf.spend;
    }
  }

  console.info('');
  console.info('=== Sample Performance (Today) ===');
  console.info(`Campaigns checked: ${campaigns.length}`);
  console.info(`Total impressions: ${totalImpressions.toLocaleString()}`);
  console.info(`Total clicks: ${totalClicks.toLocaleString()}`);
  console.info(`Total spend: £${totalSpend.toFixed(2)}`);

  if (totalImpressions === 0) {
    console.info('');
    console.info(
      'Note: Campaigns were just enabled. Google Ads typically takes 1-24 hours to start serving new campaigns.'
    );
    console.info('Check again in a few hours. Campaign review + ad approval can take time.');
  }

  await prisma.$disconnect();
}

main();
