/**
 * Activate all ads in the 8 consolidated Meta campaigns.
 * Also activates campaigns and ad sets if they're paused.
 *
 * Usage:
 *   node scripts/activate-consolidated-ads.js             # dry-run (check status)
 *   node scripts/activate-consolidated-ads.js --apply     # activate all
 *
 * On Heroku:
 *   heroku run:detached "node scripts/activate-consolidated-ads.js --apply" --app holibob-experiences-demand-gen
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function metaApi(endpoint, token, params = {}) {
  const url = new URL('https://graph.facebook.com/v18.0/' + endpoint);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set('access_token', token);
  const resp = await fetch(url.toString());
  return resp.json();
}

async function activate(id, token) {
  const formBody = new URLSearchParams();
  formBody.append('status', 'ACTIVE');
  formBody.append('access_token', token);
  const resp = await fetch('https://graph.facebook.com/v18.0/' + id, {
    method: 'POST',
    body: formBody,
  });
  return resp.json();
}

async function resolveToken() {
  const accounts = await prisma.socialAccount.findMany({
    where: { platform: 'FACEBOOK', isActive: true },
    select: { id: true, accessToken: true },
    orderBy: { updatedAt: 'desc' },
  });
  for (const account of accounts) {
    if (!account.accessToken) continue;
    try {
      const token = decryptToken(account.accessToken);
      const test = await metaApi('me', token, { fields: 'id,name' });
      if (test.id) {
        console.info('Using token for:', test.name || test.id);
        return token;
      }
    } catch (err) {
      console.info('Token failed for account', account.id, ':', err.message);
    }
  }
  throw new Error('No valid Facebook access token found');
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.info('=== Activate Consolidated Meta Campaigns ===');
  console.info('Mode:', apply ? 'APPLY' : 'DRY RUN (status check only)');
  console.info('');

  const token = await resolveToken();

  const parents = await prisma.adCampaign.findMany({
    where: { platform: 'FACEBOOK', parentCampaignId: null },
    orderBy: { name: 'asc' },
  });
  const consolidated = parents.filter(
    (p) => p.proposalData && p.proposalData.consolidatedCampaign === true
  );

  let grandTotal = 0;
  let grandActive = 0;
  let grandPaused = 0;
  let activated = 0;

  for (const camp of consolidated) {
    const campData = await metaApi(camp.platformCampaignId, token, {
      fields: 'name,effective_status',
    });
    await sleep(1000);

    // Activate campaign if paused
    if (apply && campData.effective_status === 'PAUSED') {
      const r = await activate(camp.platformCampaignId, token);
      console.info('  Activated campaign:', campData.name, r.success ? 'OK' : JSON.stringify(r));
      await sleep(2000);
    }

    // Get ad sets from DB
    const children = await prisma.adCampaign.findMany({
      where: { parentCampaignId: camp.id },
      orderBy: { name: 'asc' },
    });

    let campTotal = 0;
    let campActive = 0;
    let campPaused = 0;

    for (const child of children) {
      if (!child.platformAdSetId) continue;

      // Check ad set status
      const asData = await metaApi(child.platformAdSetId, token, {
        fields: 'name,effective_status',
      });
      await sleep(1000);

      // Activate ad set if paused
      if (apply && asData.effective_status === 'PAUSED') {
        const r = await activate(child.platformAdSetId, token);
        console.info(
          '  Activated ad set:',
          asData.name || child.name,
          r.success ? 'OK' : JSON.stringify(r)
        );
        await sleep(2000);
      }

      // Get all ads (paginate)
      let allAds = [];
      let adsData = await metaApi(child.platformAdSetId + '/ads', token, {
        fields: 'id,name,effective_status',
        limit: '200',
      });
      if (adsData.data) allAds = allAds.concat(adsData.data);
      while (adsData.paging && adsData.paging.next) {
        await sleep(2000);
        const resp = await fetch(adsData.paging.next);
        adsData = await resp.json();
        if (adsData.data) allAds = allAds.concat(adsData.data);
      }

      const activeCount = allAds.filter((a) => a.effective_status === 'ACTIVE').length;
      const pausedCount = allAds.filter((a) => a.effective_status === 'PAUSED').length;

      console.info(
        (asData.name || child.name) +
          ' [' +
          (asData.effective_status || '?') +
          '] — ' +
          allAds.length +
          ' ads (active:' +
          activeCount +
          ' paused:' +
          pausedCount +
          ')'
      );

      // Activate paused ads
      if (apply && pausedCount > 0) {
        const pausedAds = allAds.filter((a) => a.effective_status === 'PAUSED');
        console.info('  Activating', pausedAds.length, 'paused ads...');
        let count = 0;
        for (const ad of pausedAds) {
          const r = await activate(ad.id, token);
          count++;
          if (r.error) {
            if (r.error.code === 17 || r.error.code === 4) {
              console.info('  Rate limited at ad', count, '— waiting 5 min...');
              await sleep(300000);
              const r2 = await activate(ad.id, token);
              if (r2.error) {
                console.info('  Still failing:', JSON.stringify(r2.error));
              }
            } else {
              console.info('  Error activating ' + ad.id + ':', JSON.stringify(r.error));
            }
          }
          activated++;
          await sleep(1500);
        }
        console.info('  Done activating', count, 'ads');
      }

      campTotal += allAds.length;
      campActive += activeCount;
      campPaused += pausedCount;
    }

    console.info(
      (campData.name || '???') +
        ' [' +
        (campData.effective_status || '???') +
        '] SUBTOTAL: ' +
        campTotal +
        ' ads (active:' +
        campActive +
        ' paused:' +
        campPaused +
        ')\n'
    );

    grandTotal += campTotal;
    grandActive += campActive;
    grandPaused += campPaused;
  }

  console.info('=== TOTALS ===');
  console.info(
    'Total ads: ' + grandTotal + ' (active: ' + grandActive + ', paused: ' + grandPaused + ')'
  );
  if (apply) {
    console.info('Newly activated:', activated);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
