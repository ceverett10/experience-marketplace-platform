/**
 * Check the status of all 8 consolidated Meta campaigns,
 * their ad sets, and ad counts (active vs paused).
 * Also counts legacy campaigns for deletion.
 */
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

function decryptToken(encrypted) {
  const secret = process.env['SOCIAL_TOKEN_SECRET'];
  if (!secret || secret.length !== 64) return encrypted;
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted;
  const key = Buffer.from(secret, 'hex');
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function api(endpoint, token, params = {}) {
  const url = new URL('https://graph.facebook.com/v18.0/' + endpoint);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set('access_token', token);
  const resp = await fetch(url.toString());
  const data = await resp.json();
  if (data.error) {
    console.info('API error for ' + endpoint + ': ' + JSON.stringify(data.error));
  }
  return data;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Use same pattern as move-ads-to-consolidated.js
  const accounts = await prisma.socialAccount.findMany({
    where: { platform: 'FACEBOOK', isActive: true },
    select: { id: true, accessToken: true },
    orderBy: { updatedAt: 'desc' },
  });

  let token = null;
  for (const account of accounts) {
    if (!account.accessToken) continue;
    try {
      token = decryptToken(account.accessToken);
      // Test the token
      const test = await api('me', token, { fields: 'id,name' });
      if (test.id) {
        console.info('Using token for:', test.name || test.id);
        break;
      }
      console.info('Token test failed for account', account.id, ':', JSON.stringify(test));
      token = null;
    } catch (err) {
      console.info('Token decrypt failed for account', account.id, ':', err.message);
      token = null;
    }
  }

  if (!token) {
    console.error('No valid Facebook access token found');
    process.exit(1);
  }

  const parents = await prisma.adCampaign.findMany({
    where: { platform: 'FACEBOOK', parentCampaignId: null },
    orderBy: { name: 'asc' },
  });
  const consolidated = parents.filter(
    (p) => p.proposalData && p.proposalData.consolidatedCampaign === true
  );

  console.info('\n=== CONSOLIDATED CAMPAIGNS STATUS ===\n');
  let grandTotal = 0;
  let grandActive = 0;
  let grandPaused = 0;

  for (const camp of consolidated) {
    const campData = await api(camp.platformCampaignId, token, {
      fields: 'name,effective_status',
    });
    await sleep(1000);

    // Fetch all ads in campaign (paginate if needed)
    let allAds = [];
    let adsData = await api(camp.platformCampaignId + '/ads', token, {
      fields: 'id,effective_status',
      limit: '500',
    });
    if (adsData.data) allAds = allAds.concat(adsData.data);

    // Paginate
    while (adsData.paging && adsData.paging.next) {
      await sleep(2000);
      const resp = await fetch(adsData.paging.next);
      adsData = await resp.json();
      if (adsData.data) allAds = allAds.concat(adsData.data);
    }

    const active = allAds.filter((a) => a.effective_status === 'ACTIVE').length;
    const paused = allAds.filter((a) => a.effective_status === 'PAUSED').length;
    const other = allAds.length - active - paused;

    console.info(
      (campData.name || '???') +
        ' [' +
        (campData.effective_status || '???') +
        '] — ' +
        allAds.length +
        ' ads (active:' +
        active +
        ' paused:' +
        paused +
        (other > 0 ? ' other:' + other : '') +
        ')'
    );

    grandTotal += allAds.length;
    grandActive += active;
    grandPaused += paused;
    await sleep(2000);
  }

  console.info('\n=== TOTALS ===');
  console.info(
    'Total ads: ' + grandTotal + ' (active: ' + grandActive + ', paused: ' + grandPaused + ')'
  );

  // Count legacy
  const legacy = parents.filter((p) => {
    if (p.proposalData && p.proposalData.consolidatedCampaign === true) return false;
    return p.platformCampaignId != null;
  });
  console.info('\nLegacy 1:1:1 campaigns in DB with platformCampaignId: ' + legacy.length);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
