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

async function api(path, token) {
  const url =
    'https://graph.facebook.com/v18.0/' +
    path +
    (path.includes('?') ? '&' : '?') +
    'access_token=' +
    token;
  const resp = await fetch(url);
  return resp.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const account = await prisma.socialAccount.findFirst({ where: { platform: 'FACEBOOK' } });
  const token = decryptToken(account.accessToken);

  const parents = await prisma.adCampaign.findMany({
    where: { platform: 'FACEBOOK', parentCampaignId: null },
    orderBy: { name: 'asc' },
  });
  const consolidated = parents.filter(
    (p) => p.proposalData && p.proposalData.consolidatedCampaign === true
  );

  console.info('=== CONSOLIDATED CAMPAIGNS STATUS ===\n');
  let grandTotal = 0;
  let grandActive = 0;
  let grandPaused = 0;

  for (const camp of consolidated) {
    const campData = await api(camp.platformCampaignId + '?fields=name,effective_status', token);
    await sleep(1000);

    // Fetch all ads in campaign (paginate if needed)
    let allAds = [];
    let nextUrl = camp.platformCampaignId + '/ads?fields=id,effective_status&limit=500';
    while (nextUrl) {
      const adsResp = await api(nextUrl, token);
      if (adsResp.data) allAds = allAds.concat(adsResp.data);
      nextUrl = null;
      if (adsResp.paging && adsResp.paging.next) {
        // Extract path after graph.facebook.com/v18.0/
        const u = new URL(adsResp.paging.next);
        nextUrl = u.pathname.replace('/v18.0/', '') + u.search.replace(/&?access_token=[^&]+/, '');
      }
      await sleep(2000);
    }

    const active = allAds.filter((a) => a.effective_status === 'ACTIVE').length;
    const paused = allAds.filter((a) => a.effective_status === 'PAUSED').length;
    const other = allAds.length - active - paused;

    console.info(
      campData.name +
        ' [' +
        campData.effective_status +
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
