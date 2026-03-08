/**
 * Delete legacy 1:1:1 Meta campaigns from the ad account.
 *
 * These ~903 campaigns were migrated into 8 consolidated CBO campaigns.
 * Their ads have been recreated in the consolidated structure, so the
 * legacy campaigns (and their ad sets/ads) can be deleted from Meta.
 *
 * Usage:
 *   node scripts/delete-legacy-meta-campaigns.js                  # dry-run
 *   node scripts/delete-legacy-meta-campaigns.js --apply          # delete
 *   node scripts/delete-legacy-meta-campaigns.js --apply --skip=50 # resume from #50
 *
 * On Heroku:
 *   heroku run:detached "node scripts/delete-legacy-meta-campaigns.js --apply" --app holibob-experiences-demand-gen
 */
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Token decryption (same as move-ads-to-consolidated.js)
// ---------------------------------------------------------------------------
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

  console.info('=== Delete Legacy 1:1:1 Meta Campaigns ===');
  console.info('Mode:', apply ? 'APPLY (will delete)' : 'DRY RUN');
  if (skipCount > 0) console.info('Skipping first', skipCount, 'campaigns');
  console.info('');

  // Get Meta access token
  const account = await prisma.socialAccount.findFirst({
    where: { platform: 'FACEBOOK' },
    select: { accessToken: true },
  });
  const token = decryptToken(account.accessToken);

  // Get all parent campaigns
  const parents = await prisma.adCampaign.findMany({
    where: { platform: 'FACEBOOK', parentCampaignId: null },
    orderBy: { name: 'asc' },
  });

  // Separate consolidated from legacy
  const consolidated = parents.filter(
    (p) => p.proposalData && p.proposalData.consolidatedCampaign === true
  );
  const legacy = parents.filter((p) => {
    if (p.proposalData && p.proposalData.consolidatedCampaign === true) return false;
    return p.platformCampaignId && p.platformCampaignId.length > 0;
  });

  console.info('Consolidated campaigns (KEEP):', consolidated.length);
  for (const c of consolidated) {
    console.info('  [KEEP]', c.name, '(' + c.platformCampaignId + ')');
  }

  console.info('\nLegacy campaigns to delete:', legacy.length);
  if (skipCount > 0) {
    console.info('Will process campaigns', skipCount + 1, 'through', legacy.length);
  }

  if (!apply) {
    console.info('\n--- DRY RUN — no changes made ---');
    console.info('Run with --apply to delete', legacy.length, 'legacy campaigns from Meta.');
    console.info('Each campaign will be deleted via Meta API, then marked DELETED in DB.');
    await prisma.$disconnect();
    return;
  }

  // Apply mode: delete each campaign from Meta
  let deleted = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < legacy.length; i++) {
    const camp = legacy[i];

    if (i < skipCount) {
      skipped++;
      continue;
    }

    try {
      // Delete from Meta
      const url =
        'https://graph.facebook.com/v18.0/' + camp.platformCampaignId + '?access_token=' + token;
      const resp = await fetch(url, { method: 'DELETE' });
      const data = await resp.json();

      if (data.success || data === true) {
        deleted++;
        // Update DB
        await prisma.adCampaign.update({
          where: { id: camp.id },
          data: { status: 'DELETED' },
        });
        if (deleted % 50 === 0) {
          console.info('[' + (i + 1) + '/' + legacy.length + '] Deleted', deleted, 'so far');
        }
      } else if (data.error) {
        // Campaign may already be deleted or not found
        const code = data.error.code;
        if (code === 100 || code === 803) {
          // Object does not exist — mark as deleted in DB
          deleted++;
          await prisma.adCampaign.update({
            where: { id: camp.id },
            data: { status: 'DELETED' },
          });
        } else if (code === 17 || code === 4) {
          // Rate limit — wait and retry
          console.info(
            '[' + (i + 1) + '/' + legacy.length + '] Rate limited, waiting 5 minutes...'
          );
          await sleep(300000);
          i--; // retry this one
          continue;
        } else {
          console.info(
            '[' +
              (i + 1) +
              '/' +
              legacy.length +
              '] Error deleting ' +
              camp.platformCampaignId +
              ': ' +
              JSON.stringify(data.error)
          );
          failed++;
        }
      }

      // Rate limit: 2s between deletes
      await sleep(2000);
    } catch (err) {
      console.info('[' + (i + 1) + '/' + legacy.length + '] Fetch error: ' + err.message);
      failed++;
      await sleep(5000);
    }
  }

  console.info('\n=== DONE ===');
  console.info('Deleted:', deleted);
  console.info('Failed:', failed);
  console.info('Skipped:', skipped);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
