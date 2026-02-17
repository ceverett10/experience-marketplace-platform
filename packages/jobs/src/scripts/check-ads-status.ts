import { prisma } from '@experience-marketplace/database';

async function main() {
  // Recent FB campaign updates
  const recent = await prisma.adCampaign.findMany({
    where: { platform: 'FACEBOOK', updatedAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) } },
    select: { id: true, name: true, status: true, platformCampaignId: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
  console.log('=== RECENT FB CAMPAIGNS (last 3h) ===');
  for (const c of recent) {
    console.log(`  ${c.status} | ${c.platformCampaignId || 'no-platform-id'} | ${c.name} | ${c.updatedAt.toISOString()}`);
  }
  if (recent.length === 0) console.log('  (none updated in last 3 hours)');

  // Recent alerts
  const alerts = await prisma.adAlert.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, type: true, severity: true, message: true, createdAt: true },
  });
  console.log('\n=== RECENT AD ALERTS ===');
  for (const a of alerts) {
    console.log(`  [${a.severity}] ${a.type}: ${a.message?.substring(0, 120)} (${a.createdAt.toISOString()})`);
  }
  if (alerts.length === 0) console.log('  (no alerts)');

  // Overall stats
  const deployed = await prisma.adCampaign.count({
    where: { platform: 'FACEBOOK', platformCampaignId: { not: null } },
  });
  const draft = await prisma.adCampaign.count({ where: { platform: 'FACEBOOK', status: 'DRAFT' } });
  const paused = await prisma.adCampaign.count({ where: { platform: 'FACEBOOK', status: 'PAUSED' } });
  const active = await prisma.adCampaign.count({ where: { platform: 'FACEBOOK', status: 'ACTIVE' } });
  console.log(`\n=== FB CAMPAIGN STATS ===`);
  console.log(`  Deployed (has platformCampaignId): ${deployed}`);
  console.log(`  DRAFT: ${draft}`);
  console.log(`  PAUSED: ${paused}`);
  console.log(`  ACTIVE: ${active}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
