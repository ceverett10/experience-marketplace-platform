/**
 * Fix existing Pinterest social accounts:
 * 1. Set accountId from Pinterest API (currently null)
 * 2. Ensure each site has a board matching its name (not all sharing one board)
 *
 * Run on Heroku: heroku run "npx tsx scripts/fix-pinterest-accounts.ts"
 */
import { createDecipheriv } from 'crypto';

// Inline decrypt since we can't import from workspace in a root script
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

async function main() {
  // Use dynamic import for Prisma (available on Heroku)
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const accounts = await prisma.socialAccount.findMany({
    where: { platform: 'PINTEREST', isActive: true },
    include: { site: { select: { name: true } } },
  });

  console.log(`Found ${accounts.length} Pinterest account(s)`);

  for (const account of accounts) {
    const meta = (account.metadata as Record<string, unknown>) || {};
    const siteName = account.site?.name || 'Experiences';
    console.log(`\n--- Account ${account.id} (site: ${siteName}) ---`);

    let accessToken: string;
    try {
      accessToken = decryptToken(account.accessToken);
    } catch (e) {
      console.log('  Could not decrypt token, skipping');
      continue;
    }

    // 1. Fix accountId if null
    if (!account.accountId) {
      try {
        const userResponse = await fetch('https://api.pinterest.com/v5/user_account', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userResponse.ok) {
          const user = await userResponse.json();
          const pinterestUserId = user.username || user.id || null;
          if (pinterestUserId) {
            await prisma.socialAccount.update({
              where: { id: account.id },
              data: {
                accountId: pinterestUserId,
                accountName: user.username || user.business_name || account.accountName,
                accountUrl: user.username
                  ? `https://pinterest.com/${user.username}`
                  : account.accountUrl,
                metadata: { ...meta, pinterestUserId: user.id },
              },
            });
            console.log(`  Fixed accountId: ${pinterestUserId}`);
          }
        } else {
          console.log(`  Could not fetch user info: ${userResponse.status}`);
        }
      } catch (e) {
        console.log(`  Error fetching user info: ${e}`);
      }
    } else {
      console.log(`  accountId already set: ${account.accountId}`);
    }

    // 2. Fix board — ensure it matches the site name
    const currentBoardName = (meta['boardName'] as string) || '';
    if (currentBoardName.toLowerCase() === siteName.toLowerCase()) {
      console.log(`  Board already matches site: "${currentBoardName}"`);
      continue;
    }

    console.log(`  Board mismatch: "${currentBoardName}" vs site "${siteName}"`);

    try {
      const boardsResponse = await fetch('https://api.pinterest.com/v5/boards', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!boardsResponse.ok) {
        console.log(`  Could not list boards: ${boardsResponse.status}`);
        continue;
      }

      const boardsData = await boardsResponse.json();
      const allBoards = (boardsData.items || []) as { id: string; name: string }[];
      console.log(
        `  Found ${allBoards.length} boards: ${allBoards.map((b: { name: string }) => b.name).join(', ')}`
      );

      let siteBoard = allBoards.find(
        (b: { name: string }) => b.name.toLowerCase() === siteName.toLowerCase()
      );

      if (!siteBoard) {
        console.log(`  Creating board "${siteName}"...`);
        const createResponse = await fetch('https://api.pinterest.com/v5/boards', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            name: siteName,
            description: `Curated experiences and travel inspiration from ${siteName}`,
            privacy: 'PUBLIC',
          }),
        });

        if (createResponse.ok) {
          siteBoard = (await createResponse.json()) as { id: string; name: string };
          console.log(`  Created board "${siteBoard.name}" (${siteBoard.id})`);
          allBoards.push(siteBoard);
        } else {
          const err = await createResponse.text();
          console.log(`  Could not create board: ${err}`);
          continue;
        }
      } else {
        console.log(`  Found existing board "${siteBoard.name}" (${siteBoard.id})`);
      }

      // Refresh metadata
      const currentMeta =
        ((
          await prisma.socialAccount.findUnique({
            where: { id: account.id },
            select: { metadata: true },
          })
        )?.metadata as Record<string, unknown>) || {};

      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          metadata: {
            ...currentMeta,
            boardId: siteBoard.id,
            boardName: siteBoard.name,
            boards: allBoards.map((b: { id: string; name: string }) => ({
              id: b.id,
              name: b.name,
            })),
          },
        },
      });
      console.log(`  Updated boardId to ${siteBoard.id} (${siteBoard.name})`);
    } catch (e) {
      console.log(`  Error fixing board: ${e}`);
    }
  }

  console.log('\nDone!');
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
