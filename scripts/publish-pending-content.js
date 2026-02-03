/**
 * Publish all pending/review content pages that have generated content.
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/publish-pending-content.js [--dry-run]
 *
 * This publishes all pages that:
 * - Have a linked Content record (contentId is not null)
 * - Are in DRAFT or REVIEW status
 * - Belong to an active or draft site
 */

const { PrismaClient } = require('@prisma/client');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('=== DRY RUN MODE ===\n');

  const prisma = new PrismaClient();

  try {
    // Find all pages with content that aren't published
    const unpublishedPages = await prisma.page.findMany({
      where: {
        contentId: { not: null },
        status: { in: ['DRAFT', 'REVIEW'] },
        site: {
          status: { in: ['ACTIVE', 'DRAFT', 'REVIEW', 'DNS_PENDING', 'GSC_VERIFICATION', 'SSL_PENDING'] },
        },
      },
      include: {
        site: { select: { name: true, slug: true } },
        content: { select: { qualityScore: true, isAiGenerated: true } },
      },
    });

    console.log(`Found ${unpublishedPages.length} unpublished page(s) with content\n`);

    if (unpublishedPages.length === 0) {
      console.log('Nothing to publish.');
      return;
    }

    for (const page of unpublishedPages) {
      console.log(`  [${page.status}] ${page.site.name} / ${page.title || page.slug}`);
      console.log(`    Type: ${page.type} | Quality: ${page.content?.qualityScore ?? 'N/A'} | AI: ${page.content?.isAiGenerated ?? false}`);
    }

    if (!dryRun) {
      const result = await prisma.page.updateMany({
        where: {
          id: { in: unpublishedPages.map((p) => p.id) },
        },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });

      console.log(`\nPublished ${result.count} page(s).`);
    } else {
      console.log(`\nWould publish ${unpublishedPages.length} page(s).`);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
