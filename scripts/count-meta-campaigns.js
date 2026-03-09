/**
 * Quick script to list ALL campaigns on the Meta ad account.
 * Usage: node scripts/count-meta-campaigns.js
 */
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
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
  const account = await prisma.socialAccount.findFirst({
    where: { platform: 'FACEBOOK', isActive: true },
    select: { accessToken: true },
    orderBy: { updatedAt: 'desc' },
  });
  const token = decryptToken(account.accessToken);
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  // Paginate through ALL campaigns
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

  // Summary
  const byStatus = {};
  for (const c of allCampaigns) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  }

  console.info('=== ALL CAMPAIGNS ON META AD ACCOUNT ===');
  console.info('Total campaigns:', allCampaigns.length);
  console.info('By status:', JSON.stringify(byStatus, null, 2));
  console.info('');

  // List them all grouped by status
  for (const status of ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED']) {
    const camps = allCampaigns.filter((c) => c.status === status);
    if (camps.length === 0) continue;
    console.info('--- ' + status + ' (' + camps.length + ') ---');
    for (const c of camps) {
      console.info('  ' + c.name + ' (' + c.id + ') [' + (c.objective || 'N/A') + ']');
    }
    console.info('');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
