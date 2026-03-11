/**
 * Scale Google Ads campaign budgets to hit a target total daily spend.
 *
 * Proportionally scales all ACTIVE GOOGLE_SEARCH campaigns so the total
 * daily budget matches the target. Each campaign's share is preserved.
 *
 * Usage:
 *   heroku run "npx tsx packages/jobs/src/scripts/scale-campaign-budgets.ts --target=300" \
 *     --app holibob-experiences-demand-gen
 *
 *   --target=N   Target total daily budget in GBP (required)
 *   --dry-run    Show what would change without making updates
 */

import { PrismaClient } from '@prisma/client';
import { isGoogleAdsConfigured, updateCampaignBudget } from '../services/google-ads-client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const targetArg = args.find((a) => a.startsWith('--target='));
  const dryRun = args.includes('--dry-run');

  if (!targetArg) {
    console.error('Usage: scale-campaign-budgets.ts --target=300 [--dry-run]');
    process.exit(1);
  }

  const targetBudget = parseFloat(targetArg.split('=')[1]!);
  if (isNaN(targetBudget) || targetBudget <= 0) {
    console.error('Invalid target budget');
    process.exit(1);
  }

  if (!isGoogleAdsConfigured()) {
    console.error('Google Ads not configured');
    process.exit(1);
  }

  console.info(`\n=== Scale Campaign Budgets ===`);
  console.info(`Target total daily budget: £${targetBudget.toFixed(2)}`);
  if (dryRun) console.info('DRY RUN — no changes will be made\n');

  const campaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      status: 'ACTIVE',
      platformCampaignId: { not: null },
    },
    orderBy: { dailyBudget: 'desc' },
  });

  if (campaigns.length === 0) {
    console.info('No ACTIVE Google campaigns found.');
    return;
  }

  const currentTotal = campaigns.reduce((sum, c) => sum + Number(c.dailyBudget), 0);
  const scaleFactor = targetBudget / currentTotal;

  console.info(
    `Current total: £${currentTotal.toFixed(2)}/day across ${campaigns.length} campaigns`
  );
  console.info(`Scale factor: ${scaleFactor.toFixed(2)}x\n`);

  let newTotal = 0;
  let updated = 0;
  let failed = 0;

  for (const campaign of campaigns) {
    const currentBudget = Number(campaign.dailyBudget);
    const newBudget = Math.max(1.0, currentBudget * scaleFactor); // Min £1/day
    const newBudgetMicros = Math.round(newBudget * 1_000_000);

    console.info(
      `  ${campaign.name.padEnd(50)} £${currentBudget.toFixed(2)} → £${newBudget.toFixed(2)}/day`
    );

    if (!dryRun) {
      // Update on Google Ads
      const success = await updateCampaignBudget(campaign.platformCampaignId!, newBudgetMicros);
      if (success) {
        // Update in database
        await prisma.adCampaign.update({
          where: { id: campaign.id },
          data: { dailyBudget: newBudget },
        });
        updated++;
      } else {
        console.error(`  FAILED to update ${campaign.name}`);
        failed++;
      }
    }

    newTotal += newBudget;
  }

  console.info(`\n=== ${dryRun ? 'Dry Run' : 'Scale'} Complete ===`);
  console.info(`  New total: £${newTotal.toFixed(2)}/day`);
  if (!dryRun) {
    console.info(`  Updated: ${updated}`);
    console.info(`  Failed:  ${failed}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
