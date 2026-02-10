/**
 * Script to activate microsites stuck in GENERATING or REVIEW status.
 *
 * These microsites are stuck because:
 * 1. MICROSITE_CONTENT_GENERATE jobs previously had no handler (now fixed)
 * 2. There was no auto-publish step after content generation (now fixed)
 *
 * Microsite homepages render from homepageConfig + Holibob API products,
 * not from Page content, so setting them to ACTIVE is safe.
 *
 * Usage: npx ts-node scripts/activate-stuck-microsites.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Activating stuck microsites ===\n');

  // Count microsites by status
  const statusCounts = await prisma.micrositeConfig.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  console.log('Current microsite status breakdown:');
  for (const s of statusCounts) {
    console.log(`  ${s.status}: ${s._count.id}`);
  }
  console.log();

  // Find all stuck microsites (GENERATING or REVIEW)
  const stuckMicrosites = await prisma.micrositeConfig.findMany({
    where: {
      status: { in: ['GENERATING', 'REVIEW'] },
    },
    select: {
      id: true,
      subdomain: true,
      fullDomain: true,
      siteName: true,
      status: true,
      brandId: true,
    },
  });

  console.log(`Found ${stuckMicrosites.length} stuck microsites (GENERATING or REVIEW)\n`);

  if (stuckMicrosites.length === 0) {
    console.log('No microsites to activate.');
    return;
  }

  const generating = stuckMicrosites.filter((m) => m.status === 'GENERATING').length;
  const review = stuckMicrosites.filter((m) => m.status === 'REVIEW').length;
  console.log(`  GENERATING: ${generating}`);
  console.log(`  REVIEW: ${review}\n`);

  // Activate all stuck microsites
  const result = await prisma.micrositeConfig.updateMany({
    where: {
      status: { in: ['GENERATING', 'REVIEW'] },
    },
    data: {
      status: 'ACTIVE',
    },
  });

  console.log(`Activated ${result.count} microsites.\n`);

  // Also publish any DRAFT pages belonging to these microsites
  const micrositeIds = stuckMicrosites.map((m) => m.id);
  const pagesResult = await prisma.page.updateMany({
    where: {
      micrositeId: { in: micrositeIds },
      status: 'DRAFT',
    },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  console.log(`Published ${pagesResult.count} draft pages.\n`);

  // Verify final status
  const finalCounts = await prisma.micrositeConfig.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  console.log('Updated microsite status breakdown:');
  for (const s of finalCounts) {
    console.log(`  ${s.status}: ${s._count.id}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
