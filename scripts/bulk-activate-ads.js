/**
 * Bulk activate all ads in consolidated Meta campaigns.
 * Minimal API calls — fetches ads account-wide then activates each.
 *
 * Usage:
 *   node scripts/bulk-activate-ads.js             # dry-run
 *   node scripts/bulk-activate-ads.js --apply     # activate
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

async function main() {
  const apply = process.argv.includes('--apply');
  console.info('=== Bulk Activate Consolidated Ads ===');
  console.info('Mode:', apply ? 'APPLY' : 'DRY RUN');

  // Get token
  const accounts = await prisma.socialAccount.findMany({
    where: { platform: 'FACEBOOK', isActive: true },
    select: { accessToken: true },
    orderBy: { updatedAt: 'desc' },
  });
  let token;
  for (const a of accounts) {
    if (!a.accessToken) continue;
    try {
      token = decryptToken(a.accessToken);
      break;
    } catch (_e) {
      /* skip */
    }
  }

  const adAccountId = process.env['META_AD_ACCOUNT_ID'] || process.env['FACEBOOK_AD_ACCOUNT_ID'];

  // Get consolidated campaign IDs from DB
  const parents = await prisma.adCampaign.findMany({
    where: { platform: 'FACEBOOK', parentCampaignId: null },
  });
  const consolidated = parents.filter(
    (p) => p.proposalData && p.proposalData.consolidatedCampaign === true
  );
  const campaignIds = consolidated.map((c) => c.platformCampaignId).filter(Boolean);
  console.info('Consolidated campaign IDs:', campaignIds.length);

  // Fetch ALL ads from account in one paginated call (fewer API calls)
  let allAds = [];
  let url =
    'https://graph.facebook.com/v18.0/act_' +
    adAccountId +
    '/ads?fields=id,name,status,effective_status,campaign_id&limit=500&access_token=' +
    token;

  while (url) {
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error) {
      console.info('API error:', JSON.stringify(data.error));
      if (data.error.code === 17) {
        console.info('Rate limited, waiting 5 min...');
        await sleep(300000);
        continue;
      }
      break;
    }
    if (data.data) allAds = allAds.concat(data.data);
    url = data.paging && data.paging.next ? data.paging.next : null;
    console.info('Fetched', allAds.length, 'ads so far...');
    await sleep(3000);
  }

  console.info('Total ads in account:', allAds.length);

  // Filter to only consolidated campaign ads
  const consolidatedAds = allAds.filter((a) => campaignIds.includes(a.campaign_id));
  console.info('Ads in consolidated campaigns:', consolidatedAds.length);

  // Group by effective_status
  const byStatus = {};
  for (const ad of consolidatedAds) {
    const s = ad.effective_status || 'UNKNOWN';
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  console.info('Status breakdown:', JSON.stringify(byStatus));

  // Find non-active ads
  const toActivate = consolidatedAds.filter((a) => a.effective_status !== 'ACTIVE');
  console.info('Ads to activate:', toActivate.length);

  if (!apply) {
    console.info('\n--- DRY RUN — no changes ---');
    console.info('Run with --apply to activate', toActivate.length, 'ads');
    await prisma.$disconnect();
    return;
  }

  // Activate ads with 2s delay between each
  let activated = 0;
  let errors = 0;
  for (let i = 0; i < toActivate.length; i++) {
    const ad = toActivate[i];
    const formBody = new URLSearchParams();
    formBody.append('status', 'ACTIVE');
    formBody.append('access_token', token);

    try {
      const resp = await fetch('https://graph.facebook.com/v18.0/' + ad.id, {
        method: 'POST',
        body: formBody,
      });
      const result = await resp.json();

      if (result.success) {
        activated++;
      } else if (result.error) {
        if (result.error.code === 17 || result.error.code === 4) {
          console.info('[' + (i + 1) + '/' + toActivate.length + '] Rate limited, waiting 5 min');
          await sleep(300000);
          i--; // retry
          continue;
        }
        errors++;
        if (errors <= 5) {
          console.info('[' + (i + 1) + '] Error: ' + result.error.message + ' (' + ad.name + ')');
        }
      }

      if (activated % 50 === 0 && activated > 0) {
        console.info(
          '[' +
            (i + 1) +
            '/' +
            toActivate.length +
            '] Activated: ' +
            activated +
            ' Errors: ' +
            errors
        );
      }
    } catch (err) {
      errors++;
      console.info('[' + (i + 1) + '] Fetch error:', err.message);
    }

    await sleep(2000);
  }

  console.info('\n=== DONE ===');
  console.info('Activated:', activated);
  console.info('Errors:', errors);
  console.info('Total processed:', toActivate.length);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
