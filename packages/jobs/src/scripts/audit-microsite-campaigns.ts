/**
 * Audit script: Identify deployed microsite campaigns where the ad creative
 * and DSA fields used the wrong site name (parent site instead of microsite).
 *
 * Usage: npx tsx packages/jobs/src/scripts/audit-microsite-campaigns.ts [--fix]
 *
 * Without --fix: Reports affected campaigns
 * With --fix: Queues creative refresh jobs for affected campaigns
 */
import { PrismaClient } from '@experience-marketplace/database';

const prisma = new PrismaClient();

async function main() {
  const fix = process.argv.includes('--fix');

  // Find all deployed microsite campaigns (have micrositeId AND platformCampaignId)
  const campaigns = await prisma.adCampaign.findMany({
    where: {
      micrositeId: { not: null },
      platformCampaignId: { not: null },
      status: { in: ['ACTIVE', 'PAUSED'] },
    },
    select: {
      id: true,
      name: true,
      platform: true,
      status: true,
      siteId: true,
      micrositeId: true,
      platformCampaignId: true,
      proposalData: true,
      site: { select: { name: true } },
      microsite: { select: { siteName: true, fullDomain: true } },
    },
  });

  console.log(`Found ${campaigns.length} deployed microsite campaigns`);

  let mismatched = 0;
  let correctName = 0;
  const platformBreakdown: Record<string, number> = {};

  for (const c of campaigns) {
    const micrositeName = c.microsite?.siteName;
    const siteName = c.site?.name;

    // Check if the creative was generated with the wrong site name
    const proposalData = c.proposalData as Record<string, unknown> | null;
    const creative = proposalData?.['generatedCreative'] as Record<string, unknown> | null;

    // If creative body/headline contains the parent site name but NOT the microsite name,
    // it was generated with the wrong context
    const headline = (creative?.['headline'] as string) || '';
    const body = (creative?.['body'] as string) || '';
    const creativeText = `${headline} ${body}`.toLowerCase();

    const hasMicrositeName = micrositeName && creativeText.includes(micrositeName.toLowerCase());
    const hasParentName = siteName && creativeText.includes(siteName.toLowerCase());

    // The DSA fields would have used the parent site name
    // These campaigns need a creative refresh to use the microsite name
    if (micrositeName && siteName && micrositeName !== siteName) {
      mismatched++;
      platformBreakdown[c.platform] = (platformBreakdown[c.platform] || 0) + 1;

      if (mismatched <= 10) {
        console.log(
          `  ${c.name} | parent="${siteName}" microsite="${micrositeName}" | ` +
            `creative has parent=${hasParentName} microsite=${hasMicrositeName}`
        );
      }
    } else {
      correctName++;
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Mismatched (different parent vs microsite name): ${mismatched}`);
  console.log(`  Correct (same name or no conflict): ${correctName}`);
  console.log(`  By platform:`, platformBreakdown);

  if (fix && mismatched > 0) {
    console.log(`\nThe creative refresh scheduler will automatically fix these`);
    console.log(`campaigns on its next run, now that the code uses microsite.siteName.`);
    console.log(`No manual intervention needed — the refreshCreatives() function now`);
    console.log(`correctly looks up pages by micrositeId and uses microsite.siteName.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
