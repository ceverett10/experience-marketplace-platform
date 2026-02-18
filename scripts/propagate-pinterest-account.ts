/**
 * Propagate Pinterest account details from reconnected account to siblings.
 * Run: heroku run "npx tsx scripts/propagate-pinterest-account.ts"
 */
async function main() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const accts = await prisma.socialAccount.findMany({
    where: { platform: 'PINTEREST', isActive: true },
    select: {
      id: true,
      accountId: true,
      accountName: true,
      accountUrl: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      metadata: true,
      site: { select: { name: true } },
    },
  });

  console.log(`Found ${accts.length} Pinterest account(s)`);

  // Find the one with accountId set (the reconnected one)
  const source = accts.find((a: any) => a.accountId);
  if (!source) {
    console.log('No account with accountId found — reconnect Pinterest first');
    await prisma.$disconnect();
    return;
  }

  console.log(`Source: ${source.site?.name} (accountId: ${source.accountId})`);
  const sourceMeta = (source.metadata as Record<string, unknown>) || {};

  for (const acct of accts) {
    if (acct.id === source.id) continue;

    const targetMeta = (acct.metadata as Record<string, unknown>) || {};
    await prisma.socialAccount.update({
      where: { id: acct.id },
      data: {
        accountId: source.accountId,
        accountName: source.accountName,
        accountUrl: source.accountUrl,
        accessToken: source.accessToken,
        refreshToken: source.refreshToken,
        tokenExpiresAt: source.tokenExpiresAt,
        metadata: {
          ...targetMeta,
          pinterestUserId: sourceMeta['pinterestUserId'],
        },
      },
    });
    console.log(
      `Updated: ${acct.site?.name} — accountId set, tokens synced, kept board: ${targetMeta['boardName']}`
    );
  }

  // Clean up old orphaned accounts (if reconnect created a new record)
  const orphaned = await prisma.socialAccount.findMany({
    where: {
      platform: 'PINTEREST',
      id: { notIn: accts.map((a: any) => a.id) },
    },
    select: { id: true, siteId: true, isActive: true },
  });

  for (const orphan of orphaned) {
    await prisma.socialAccount.update({
      where: { id: orphan.id },
      data: { isActive: false },
    });
    console.log(`Deactivated orphaned account: ${orphan.id}`);
  }

  // Verify final state
  console.log('\n--- Final state ---');
  const final = await prisma.socialAccount.findMany({
    where: { platform: 'PINTEREST', isActive: true },
    select: {
      accountId: true,
      accountName: true,
      metadata: true,
      site: { select: { name: true } },
    },
  });
  for (const a of final) {
    const m = (a.metadata as Record<string, unknown>) || {};
    console.log(`${a.site?.name}: accountId=${a.accountId}, board=${m['boardName']}`);
  }

  console.log('\nDone');
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
