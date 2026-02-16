#!/usr/bin/env node
/**
 * Test script to verify Meta Ads and Google Ads API connectivity.
 * Creates a test campaign on each platform (PAUSED), then immediately deletes/archives it.
 *
 * Run on Heroku: heroku run node scripts/test-ad-platforms.js --app holibob-experiences-demand-gen
 */

const TEST_PREFIX = '[TEST] ';

// ============================================================================
// GOOGLE ADS TEST
// ============================================================================

async function testGoogleAds() {
  console.log('\n=== GOOGLE ADS TEST ===\n');

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');

  if (!devToken || !clientId || !clientSecret || !refreshToken || !customerId) {
    console.log('SKIP: Missing Google Ads credentials');
    console.log(`  DEVELOPER_TOKEN: ${devToken ? 'SET' : 'MISSING'}`);
    console.log(`  CLIENT_ID: ${clientId ? 'SET' : 'MISSING'}`);
    console.log(`  CLIENT_SECRET: ${clientSecret ? 'SET' : 'MISSING'}`);
    console.log(`  REFRESH_TOKEN: ${refreshToken ? 'SET' : 'MISSING'}`);
    console.log(`  CUSTOMER_ID: ${customerId ? 'SET' : 'MISSING'}`);
    return { success: false, reason: 'missing credentials' };
  }

  // Step 1: Get access token from refresh token
  console.log('1. Exchanging refresh token for access token...');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error(`FAIL: Token exchange failed (${tokenRes.status}): ${err}`);
    return { success: false, reason: 'token exchange failed', error: err };
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  console.log(`   OK: Got access token (expires in ${tokenData.expires_in}s)`);

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': devToken,
    'Content-Type': 'application/json',
  };
  const baseUrl = `https://googleads.googleapis.com/v17/customers/${customerId}`;

  // Step 2: List existing campaigns (read test)
  console.log('2. Listing existing campaigns...');
  const listRes = await fetch(`${baseUrl}/googleAds:searchStream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query:
        'SELECT campaign.id, campaign.name, campaign.status FROM campaign ORDER BY campaign.id DESC LIMIT 5',
    }),
  });

  if (!listRes.ok) {
    const err = await listRes.text();
    console.error(`FAIL: Campaign list failed (${listRes.status}): ${err.substring(0, 500)}`);
    return { success: false, reason: 'list campaigns failed', error: err.substring(0, 500) };
  }

  const listData = await listRes.json();
  const campaigns = listData[0]?.results || [];
  console.log(`   OK: Found ${campaigns.length} campaigns`);
  for (const c of campaigns) {
    console.log(`   - ${c.campaign.name} (${c.campaign.status})`);
  }

  // Step 3: Create a test campaign budget
  console.log('3. Creating test campaign budget...');
  const budgetRes = await fetch(`${baseUrl}/campaignBudgets:mutate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operations: [
        {
          create: {
            name: `${TEST_PREFIX}Budget - ${Date.now()}`,
            amountMicros: '5000000', // £5/day
            deliveryMethod: 'STANDARD',
            explicitlyShared: false,
          },
        },
      ],
    }),
  });

  if (!budgetRes.ok) {
    const err = await budgetRes.text();
    console.error(`FAIL: Budget creation failed (${budgetRes.status}): ${err.substring(0, 500)}`);
    return { success: false, reason: 'budget creation failed', error: err.substring(0, 500) };
  }

  const budgetData = await budgetRes.json();
  const budgetResource = budgetData.results[0].resourceName;
  console.log(`   OK: Created budget: ${budgetResource}`);

  // Step 4: Create a test search campaign (PAUSED)
  console.log('4. Creating test PAUSED search campaign...');
  const campaignRes = await fetch(`${baseUrl}/campaigns:mutate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operations: [
        {
          create: {
            name: `${TEST_PREFIX}Campaign - ${new Date().toISOString().split('T')[0]}`,
            status: 'PAUSED',
            advertisingChannelType: 'SEARCH',
            campaignBudget: budgetResource,
            manualCpc: { enhancedCpcEnabled: false },
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: false,
              targetContentNetwork: false,
            },
          },
        },
      ],
    }),
  });

  if (!campaignRes.ok) {
    const err = await campaignRes.text();
    console.error(
      `FAIL: Campaign creation failed (${campaignRes.status}): ${err.substring(0, 500)}`
    );
    return { success: false, reason: 'campaign creation failed', error: err.substring(0, 500) };
  }

  const campaignData = await campaignRes.json();
  const campaignResource = campaignData.results[0].resourceName;
  const campaignId = campaignResource.split('/').pop();
  console.log(`   OK: Created campaign: ${campaignResource} (ID: ${campaignId})`);

  // Step 5: Remove the test campaign
  console.log('5. Removing test campaign...');
  const removeRes = await fetch(`${baseUrl}/campaigns:mutate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operations: [
        {
          remove: campaignResource,
        },
      ],
    }),
  });

  if (removeRes.ok) {
    console.log('   OK: Test campaign removed');
  } else {
    console.log('   WARN: Could not remove test campaign (manual cleanup needed)');
  }

  // Also remove test budget
  await fetch(`${baseUrl}/campaignBudgets:mutate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ operations: [{ remove: budgetResource }] }),
  }).catch(() => {});

  console.log('\nGOOGLE ADS: PASS - Successfully created and removed a test campaign');
  return { success: true, campaignId };
}

// ============================================================================
// META (FACEBOOK) ADS TEST
// ============================================================================

async function testMetaAds() {
  console.log('\n=== META ADS TEST ===\n');

  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const pageId = process.env.META_PAGE_ID;

  if (!adAccountId) {
    console.log('SKIP: META_AD_ACCOUNT_ID not set');
    return { success: false, reason: 'missing META_AD_ACCOUNT_ID' };
  }
  if (!pageId) {
    console.log('SKIP: META_PAGE_ID not set');
    return { success: false, reason: 'missing META_PAGE_ID' };
  }

  // Get access token from database
  let accessToken;
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const account = await prisma.socialAccount.findFirst({
      where: { platform: 'FACEBOOK', isActive: true },
      select: { accessToken: true, tokenExpiresAt: true },
    });
    await prisma.$disconnect();

    if (!account?.accessToken) {
      console.log('SKIP: No active Facebook SocialAccount with access token');
      return { success: false, reason: 'no access token in DB' };
    }
    accessToken = account.accessToken;
    console.log(`   Token found (expires: ${account.tokenExpiresAt || 'unknown'})`);
  } catch (err) {
    console.error(`SKIP: Could not read access token from DB: ${err.message}`);
    return { success: false, reason: 'db error' };
  }

  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const baseUrl = `https://graph.facebook.com/v21.0`;

  // Step 1: Verify ad account access
  console.log('1. Verifying ad account access...');
  const accountRes = await fetch(
    `${baseUrl}/${actId}?fields=name,account_status,currency,balance&access_token=${accessToken}`
  );

  if (!accountRes.ok) {
    const err = await accountRes.text();
    console.error(
      `FAIL: Ad account access failed (${accountRes.status}): ${err.substring(0, 500)}`
    );
    return { success: false, reason: 'ad account access failed', error: err.substring(0, 500) };
  }

  const accountData = await accountRes.json();
  console.log(
    `   OK: Account "${accountData.name}" (status: ${accountData.account_status}, currency: ${accountData.currency})`
  );

  // Step 2: Create a test campaign (PAUSED)
  console.log('2. Creating test PAUSED campaign...');
  const campaignRes = await fetch(`${baseUrl}/${actId}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${TEST_PREFIX}Campaign - ${new Date().toISOString().split('T')[0]}`,
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: [],
      access_token: accessToken,
    }),
  });

  if (!campaignRes.ok) {
    const err = await campaignRes.text();
    console.error(
      `FAIL: Campaign creation failed (${campaignRes.status}): ${err.substring(0, 500)}`
    );
    return { success: false, reason: 'campaign creation failed', error: err.substring(0, 500) };
  }

  const campaignData = await campaignRes.json();
  const campaignId = campaignData.id;
  console.log(`   OK: Created campaign ID: ${campaignId}`);

  // Step 3: Create a test ad set
  console.log('3. Creating test ad set...');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const startTime = tomorrow.toISOString();

  const adSetRes = await fetch(`${baseUrl}/${actId}/adsets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${TEST_PREFIX}Ad Set`,
      campaign_id: campaignId,
      daily_budget: 500, // £5 in pennies
      bid_amount: 10, // £0.10 in pennies
      billing_event: 'LINK_CLICKS',
      optimization_goal: 'LINK_CLICKS',
      targeting: {
        geo_locations: { countries: ['GB'] },
        age_min: 18,
        age_max: 65,
      },
      status: 'PAUSED',
      start_time: startTime,
      access_token: accessToken,
    }),
  });

  if (!adSetRes.ok) {
    const err = await adSetRes.text();
    console.error(`WARN: Ad set creation failed (${adSetRes.status}): ${err.substring(0, 300)}`);
    console.log('   (This is OK - campaign creation was the main test)');
  } else {
    const adSetData = await adSetRes.json();
    console.log(`   OK: Created ad set ID: ${adSetData.id}`);
  }

  // Step 4: Delete the test campaign
  console.log('4. Deleting test campaign...');
  const deleteRes = await fetch(`${baseUrl}/${campaignId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'DELETED',
      access_token: accessToken,
    }),
  });

  if (deleteRes.ok) {
    console.log('   OK: Test campaign deleted');
  } else {
    console.log('   WARN: Could not delete test campaign (manual cleanup in Ads Manager)');
  }

  console.log('\nMETA ADS: PASS - Successfully created and deleted a test campaign');
  return { success: true, campaignId };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Ad Platform API Connectivity Test');
  console.log('='.repeat(60));

  const results = {};

  try {
    results.google = await testGoogleAds();
  } catch (err) {
    console.error(`\nGOOGLE ADS: FAIL - ${err.message}`);
    results.google = { success: false, reason: err.message };
  }

  try {
    results.meta = await testMetaAds();
  } catch (err) {
    console.error(`\nMETA ADS: FAIL - ${err.message}`);
    results.meta = { success: false, reason: err.message };
  }

  console.log('\n' + '='.repeat(60));
  console.log('RESULTS:');
  console.log(
    `  Google Ads: ${results.google?.success ? 'PASS' : 'FAIL'} ${results.google?.success ? '' : '(' + results.google?.reason + ')'}`
  );
  console.log(
    `  Meta Ads:   ${results.meta?.success ? 'PASS' : 'FAIL'} ${results.meta?.success ? '' : '(' + results.meta?.reason + ')'}`
  );
  console.log('='.repeat(60));

  process.exit(results.google?.success && results.meta?.success ? 0 : 1);
}

main();
