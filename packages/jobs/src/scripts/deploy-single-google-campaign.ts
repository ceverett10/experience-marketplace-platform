/**
 * Deploy a single DRAFT Google Search campaign to Google Ads and optionally enable it.
 *
 * Usage:
 *   heroku run "npx tsx packages/jobs/src/scripts/deploy-single-google-campaign.ts <campaignId> [--enable]" \
 *     --app holibob-experiences-demand-gen
 */

import { PrismaClient } from '@prisma/client';
import {
  isGoogleAdsConfigured,
  createSearchCampaign,
  createKeywordAdGroup,
  createResponsiveSearchAd,
  setCampaignStatus,
} from '../services/google-ads-client';

const prisma = new PrismaClient();

async function main() {
  const campaignId = process.argv[2];
  const shouldEnable = process.argv.includes('--enable');

  if (!campaignId) {
    console.error('Usage: npx tsx deploy-single-google-campaign.ts <campaignId> [--enable]');
    process.exit(1);
  }

  if (!isGoogleAdsConfigured()) {
    console.error('FAIL: Google Ads not configured (missing env vars)');
    process.exit(1);
  }

  console.log(`\n=== Deploying campaign ${campaignId} ===\n`);
  const campaign = await prisma.adCampaign.findUnique({
    where: { id: campaignId },
    include: { site: { select: { name: true, primaryDomain: true } } },
  });

  if (!campaign) {
    console.error(`Campaign not found: ${campaignId}`);
    process.exit(1);
  }

  console.log(`  Name:       ${campaign.name}`);
  console.log(`  Platform:   ${campaign.platform}`);
  console.log(`  Status:     ${campaign.status}`);
  console.log(`  Budget:     £${campaign.dailyBudget}/day`);
  console.log(`  Max CPC:    £${campaign.maxCpc}`);
  console.log(`  Keywords:   ${campaign.keywords.join(', ')}`);
  console.log(`  Target URL: ${campaign.targetUrl}`);
  console.log(`  Geo:        ${campaign.geoTargets.join(', ')}`);
  console.log(`  Site:       ${campaign.site?.name || 'unknown'}`);

  if (campaign.platform !== 'GOOGLE_SEARCH') {
    console.error(`\nFAIL: Campaign platform is ${campaign.platform}, not GOOGLE_SEARCH`);
    process.exit(1);
  }

  if (campaign.platformCampaignId) {
    console.log(`\nAlready deployed: Google campaign ID ${campaign.platformCampaignId}`);
    if (shouldEnable) {
      console.log('\nEnabling existing campaign...');
      await setCampaignStatus(campaign.platformCampaignId, 'ENABLED');
      await prisma.adCampaign.update({
        where: { id: campaignId },
        data: { status: 'ACTIVE' },
      });
      console.log('DONE: Campaign enabled');
    }
    process.exit(0);
  }

  const url = new URL(campaign.targetUrl);
  if (campaign.utmSource) url.searchParams.set('utm_source', campaign.utmSource);
  if (campaign.utmMedium) url.searchParams.set('utm_medium', campaign.utmMedium);
  if (campaign.utmCampaign) url.searchParams.set('utm_campaign', campaign.utmCampaign);
  const landingUrl = url.toString();
  console.log(`\n  Landing URL: ${landingUrl}`);

  console.log('\n1. Creating Google Ads campaign (PAUSED)...');
  const dailyBudgetMicros = Math.round(Number(campaign.dailyBudget) * 1_000_000);
  const campaignResult = await createSearchCampaign({
    name: campaign.name,
    dailyBudgetMicros,
    status: 'PAUSED',
  });

  if (!campaignResult) {
    console.error('FAIL: Could not create campaign on Google Ads');
    process.exit(1);
  }
  console.log(
    `   OK: Campaign ID ${campaignResult.campaignId}, Budget ID ${campaignResult.budgetId}`
  );

  console.log('\n2. Creating ad group with keywords...');
  const cpcBidMicros = Math.round(Number(campaign.maxCpc) * 1_000_000);
  const keywords = campaign.keywords.flatMap((kw) => [
    { text: kw, matchType: 'PHRASE' as const },
    { text: kw, matchType: 'EXACT' as const },
  ]);

  const adGroupResult = await createKeywordAdGroup({
    campaignId: campaignResult.campaignId,
    name: `${campaign.name} - Ad Group`,
    cpcBidMicros,
    keywords,
  });

  if (!adGroupResult) {
    console.error('FAIL: Could not create ad group');
    process.exit(1);
  }
  console.log(`   OK: Ad Group ID ${adGroupResult.adGroupId}`);
  console.log(`   Keywords: ${keywords.map((k) => `[${k.matchType}] ${k.text}`).join(', ')}`);

  console.log('\n3. Generating responsive search ad...');
  const siteName = campaign.site?.name || 'Holibob';
  const keyword = campaign.keywords[0] || 'experiences';
  const rsa = generateRSATemplate(keyword, siteName);
  console.log(`   Headlines: ${rsa.headlines.join(' | ')}`);
  console.log(`   Descriptions: ${rsa.descriptions.join(' | ')}`);

  console.log('\n4. Creating responsive search ad...');
  const adResult = await createResponsiveSearchAd({
    adGroupId: adGroupResult.adGroupId,
    headlines: rsa.headlines,
    descriptions: rsa.descriptions,
    finalUrl: landingUrl,
    path1: 'experiences',
    path2: keyword.split(' ')[0]?.substring(0, 15),
  });

  if (!adResult) {
    console.error('FAIL: Could not create RSA');
    process.exit(1);
  }
  console.log(`   OK: Ad ID ${adResult.adId}`);

  console.log('\n5. Updating database...');
  await prisma.adCampaign.update({
    where: { id: campaignId },
    data: {
      platformCampaignId: campaignResult.campaignId,
      status: 'PAUSED',
    },
  });
  console.log('   OK: Campaign record updated (status: PAUSED)');

  if (shouldEnable) {
    console.log('\n6. Enabling campaign on Google Ads...');
    await setCampaignStatus(campaignResult.campaignId, 'ENABLED');
    await prisma.adCampaign.update({
      where: { id: campaignId },
      data: { status: 'ACTIVE' },
    });
    console.log('   OK: Campaign is now LIVE');
  } else {
    console.log('\n   Campaign created as PAUSED. Pass --enable to set it live.');
  }

  console.log('\n=== DONE ===\n');
  console.log(`Google Ads Campaign ID: ${campaignResult.campaignId}`);
  console.log(`Google Ads Ad Group ID: ${adGroupResult.adGroupId}`);
  console.log(`Google Ads Ad ID:       ${adResult.adId}`);
  console.log(`Status: ${shouldEnable ? 'ENABLED (LIVE)' : 'PAUSED'}`);

  await prisma.$disconnect();
}

function generateRSATemplate(
  keyword: string,
  siteName: string
): { headlines: string[]; descriptions: string[] } {
  const kwTitle = keyword.charAt(0).toUpperCase() + keyword.slice(1);
  return {
    headlines: [
      kwTitle.substring(0, 30),
      `Book ${kwTitle}`.substring(0, 30),
      `${kwTitle} - ${siteName}`.substring(0, 30),
      `Best ${kwTitle} Deals`.substring(0, 30),
      'Instant Confirmation',
      'Book Online Today',
    ],
    descriptions: [
      `Discover and book ${keyword} experiences. Instant confirmation, top-rated providers.`.substring(
        0,
        90
      ),
      `Compare and book the best ${keyword}. Trusted by thousands of travellers.`.substring(0, 90),
    ],
  };
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
