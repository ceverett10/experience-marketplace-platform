/**
 * Connect all active sites to Pinterest by creating SocialAccount records
 * and per-site boards. Uses the existing token from an already-connected account.
 *
 * Run: heroku run "npx tsx scripts/connect-all-sites-pinterest.ts"
 */
import { createDecipheriv } from 'crypto';

function decryptToken(encrypted: string): string {
  const secret = process.env['SOCIAL_TOKEN_SECRET'];
  if (!secret || secret.length !== 64) throw new Error('SOCIAL_TOKEN_SECRET not configured');
  const key = Buffer.from(secret, 'hex');
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted; // plaintext
  const [ivPart, authTagPart, ciphertext] = parts as [string, string, string];
  const iv = Buffer.from(ivPart, 'base64');
  const authTag = Buffer.from(authTagPart, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function findOrCreateBoard(
  accessToken: string,
  boardName: string,
  existingBoards: { id: string; name: string }[]
): Promise<{ id: string; name: string } | null> {
  // Check existing boards first
  const existing = existingBoards.find(
    (b) => b.name.toLowerCase() === boardName.toLowerCase()
  );
  if (existing) return existing;

  // Create new board
  const response = await fetch('https://api.pinterest.com/v5/boards', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name: boardName,
      description: `Curated experiences and travel inspiration from ${boardName}`,
      privacy: 'PUBLIC',
    }),
  });

  if (response.ok) {
    const board = (await response.json()) as { id: string; name: string };
    return board;
  }

  const err = await response.text();
  console.log(`  Could not create board "${boardName}": ${err}`);
  return null;
}

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  // 1. Get source Pinterest account (already connected)
  const source = await prisma.socialAccount.findFirst({
    where: { platform: 'PINTEREST', isActive: true, accountId: { not: null } },
    select: {
      accountId: true,
      accountName: true,
      accountUrl: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      metadata: true,
    },
  });

  if (!source) {
    console.log('No Pinterest account with accountId found. Reconnect Pinterest first.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Source account: ${source.accountId}`);

  // Decrypt token for API calls
  let accessToken: string;
  try {
    accessToken = decryptToken(source.accessToken);
  } catch (e) {
    console.log('Could not decrypt token:', e);
    await prisma.$disconnect();
    return;
  }

  // 2. Get all existing boards from Pinterest
  const boardsResponse = await fetch('https://api.pinterest.com/v5/boards', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let allBoards: { id: string; name: string }[] = [];
  if (boardsResponse.ok) {
    const data = await boardsResponse.json();
    allBoards = ((data as any).items || []) as { id: string; name: string }[];
    console.log(`Found ${allBoards.length} existing boards: ${allBoards.map((b) => b.name).join(', ')}`);
  }

  // 3. Get all active sites
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
  });
  console.log(`\nFound ${sites.length} active sites`);

  // 4. Get sites that already have Pinterest accounts
  const existingAccounts = await prisma.socialAccount.findMany({
    where: { platform: 'PINTEREST', isActive: true },
    select: { siteId: true },
  });
  const connectedSiteIds = new Set(existingAccounts.map((a: { siteId: string }) => a.siteId));

  // 5. Create Pinterest accounts for missing sites
  let created = 0;
  for (const site of sites) {
    if (connectedSiteIds.has(site.id)) {
      console.log(`\n[${site.name}] Already connected — skipping`);
      continue;
    }

    console.log(`\n[${site.name}] Creating Pinterest account...`);

    // Find or create board for this site
    const board = await findOrCreateBoard(accessToken, site.name, allBoards);
    if (board && !allBoards.find((b) => b.id === board.id)) {
      allBoards.push(board);
    }

    if (board) {
      console.log(`  Board: "${board.name}" (${board.id})`);
    } else {
      console.log(`  Warning: no board created, will use auto-create on first publish`);
    }

    const sourceMeta = (source.metadata as Record<string, unknown>) || {};

    await prisma.socialAccount.create({
      data: {
        siteId: site.id,
        platform: 'PINTEREST',
        accountId: source.accountId,
        accountName: source.accountName,
        accountUrl: source.accountUrl,
        accessToken: source.accessToken,
        refreshToken: source.refreshToken,
        tokenExpiresAt: source.tokenExpiresAt,
        metadata: {
          pinterestUserId: sourceMeta['pinterestUserId'],
          boardId: board?.id || null,
          boardName: board?.name || null,
          boards: allBoards.map((b) => ({ id: b.id, name: b.name })),
        },
        isActive: true,
      },
    });

    console.log(`  Account created`);
    created++;
  }

  // 6. Summary
  console.log(`\n--- Summary ---`);
  console.log(`Sites: ${sites.length} total, ${connectedSiteIds.size} already connected, ${created} newly created`);
  console.log(`Boards: ${allBoards.length} total on Pinterest`);

  const final = await prisma.socialAccount.findMany({
    where: { platform: 'PINTEREST', isActive: true },
    select: { metadata: true, site: { select: { name: true } } },
  });
  for (const a of final) {
    const m = (a.metadata as Record<string, unknown>) || {};
    console.log(`  ${a.site?.name} → board: ${m['boardName']}`);
  }

  console.log('\nDone!');
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
