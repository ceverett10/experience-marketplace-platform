/**
 * Delete ALL non-consolidated Meta campaigns from the ad account.
 *
 * Keeps only the 8 consolidated CBO campaigns (OUTCOME_SALES).
 * Deletes everything else — standalone per-supplier campaigns (OUTCOME_TRAFFIC)
 * and any PAUSED/orphaned campaigns.
 *
 * Usage:
 *   node scripts/delete-non-consolidated-meta-campaigns.js                  # dry-run
 *   node scripts/delete-non-consolidated-meta-campaigns.js --apply          # delete
 *   node scripts/delete-non-consolidated-meta-campaigns.js --apply --skip=50 # resume
 *
 * On Heroku:
 *   heroku run:detached "node scripts/delete-non-consolidated-meta-campaigns.js --apply" --app holibob-experiences-demand-gen
 */
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

/** The 8 consolidated CBO campaign IDs to KEEP */
const KEEP_CAMPAIGN_IDS = new Set([
  '120242774515120706', // General Tours Tier 2
  '120242774383520706', // Cultural & Sightseeing
  '120242774306210706', // Transfers & Transport
  '120242773744320706', // Boats/Water
  '120242773654980706', // Food/Culinary
  '120242773556320706', // Adventure & Outdoor
  '120242773425280706', // Branded London Food Tours
  '120242773324750706', // Branded Harry Potter Tours
]);

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
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const skipArg = args.find((a) => a.startsWith('--skip='));
  const skipCount = skipArg ? parseInt(skipArg.split('=')[1], 10) : 0;

  console.info('=== Delete Non-Consolidated Meta Campaigns ===');
  console.info('Mode:', apply ? 'APPLY (will delete)' : 'DRY RUN');
  console.info('Keeping', KEEP_CAMPAIGN_IDS.size, 'consolidated CBO campaigns');
  if (skipCount > 0) console.info('Skipping first', skipCount, 'campaigns');
  console.info('');

  // Get Meta access token
  const accounts = await prisma.socialAccount.findMany({
    where: { platform: 'FACEBOOK', isActive: true },
    select: { id: true, accessToken: true },
    orderBy: { updatedAt: 'desc' },
  });
  let token = null;
  for (const account of accounts) {
    if (!account.accessToken) continue;
    try {
      const t = decryptToken(account.accessToken);
      const testUrl = 'https://graph.facebook.com/v18.0/me?fields=id&access_token=' + t;
      const testResp = await fetch(testUrl);
      const testData = await testResp.json();
      if (testData.id) {
        token = t;
        console.info('Using token for account:', testData.id);
        break;
      }
    } catch (err) {
      console.info('Token failed for account', account.id);
    }
  }
  if (!token) {
    console.error('No valid Facebook access token found');
    process.exit(1);
  }

  // Fetch ALL campaigns from Meta ad account
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  let allCampaigns = [];
  let url =
    'https://graph.facebook.com/v18.0/act_' +
    adAccountId +
    '/campaigns?fields=id,name,status,objective&limit=500&access_token=' +
    token;

  while (url) {
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error) {
      console.error('API Error:', JSON.stringify(data.error));
      if (data.error.code === 17 || data.error.code === 4) {
        console.info('Rate limited, waiting 2 minutes...');
        await sleep(120000);
        continue;
      }
      break;
    }
    allCampaigns = allCampaigns.concat(data.data || []);
    url = data.paging && data.paging.next ? data.paging.next : null;
  }

  console.info('Total campaigns on Meta:', allCampaigns.length);

  // Separate keep vs delete
  const toKeep = allCampaigns.filter((c) => KEEP_CAMPAIGN_IDS.has(c.id));
  const toDelete = allCampaigns.filter((c) => !KEEP_CAMPAIGN_IDS.has(c.id));

  console.info('\nCampaigns to KEEP (' + toKeep.length + '):');
  for (const c of toKeep) {
    console.info(
      '  [KEEP] ' + c.name + ' (' + c.id + ') [' + c.status + '] [' + (c.objective || 'N/A') + ']'
    );
  }

  console.info('\nCampaigns to DELETE (' + toDelete.length + '):');
  for (const c of toDelete) {
    console.info(
      '  [DELETE] ' + c.name + ' (' + c.id + ') [' + c.status + '] [' + (c.objective || 'N/A') + ']'
    );
  }

  if (!apply) {
    console.info('\n--- DRY RUN — no changes made ---');
    console.info('Run with --apply to delete', toDelete.length, 'campaigns from Meta.');
    await prisma.$disconnect();
    return;
  }

  // Apply mode: delete each campaign from Meta
  let deleted = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < toDelete.length; i++) {
    const camp = toDelete[i];

    if (i < skipCount) {
      skipped++;
      continue;
    }

    try {
      const deleteUrl = 'https://graph.facebook.com/v18.0/' + camp.id + '?access_token=' + token;
      const resp = await fetch(deleteUrl, { method: 'DELETE' });
      const data = await resp.json();

      if (data.success || data === true) {
        deleted++;
        if (deleted % 10 === 0 || deleted === 1) {
          console.info(
            '[' +
              (i + 1) +
              '/' +
              toDelete.length +
              '] Deleted ' +
              deleted +
              ' so far — last: ' +
              camp.name
          );
        }
      } else if (data.error) {
        const code = data.error.code;
        if (code === 100 || code === 803) {
          // Already deleted / not found
          deleted++;
          console.info('[' + (i + 1) + '/' + toDelete.length + '] Already gone: ' + camp.name);
        } else if (code === 17 || code === 4) {
          console.info(
            '[' + (i + 1) + '/' + toDelete.length + '] Rate limited, waiting 5 minutes...'
          );
          await sleep(300000);
          i--; // retry
          continue;
        } else {
          console.info(
            '[' +
              (i + 1) +
              '/' +
              toDelete.length +
              '] Error: ' +
              camp.name +
              ' — ' +
              JSON.stringify(data.error)
          );
          failed++;
        }
      }

      // Also mark as COMPLETED in DB if it exists
      try {
        await prisma.adCampaign.updateMany({
          where: { platformCampaignId: camp.id },
          data: { status: 'COMPLETED' },
        });
      } catch (_dbErr) {
        // Campaign may not exist in DB — that is fine
      }

      // Rate limit: 2s between deletes
      await sleep(2000);
    } catch (err) {
      console.info('[' + (i + 1) + '/' + toDelete.length + '] Fetch error: ' + err.message);
      failed++;
      await sleep(5000);
    }
  }

  console.info('\n=== DONE ===');
  console.info('Deleted:', deleted);
  console.info('Failed:', failed);
  console.info('Skipped:', skipped);
  console.info('Kept:', toKeep.length, 'consolidated CBO campaigns');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
