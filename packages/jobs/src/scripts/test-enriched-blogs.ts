/**
 * Generate 5 test blog posts using enriched prompts to verify experience relevance.
 * Targets microsites with the most product data for best demonstration.
 *
 * Run on Heroku: heroku run "node packages/jobs/dist/scripts/test-enriched-blogs.js" --no-tty
 */

import { prisma, PageType, PageStatus } from '@experience-marketplace/database';
import { addJob } from '../queues/index.js';
import { generateBlogPostForMicrosite } from '../services/microsite-blog-generator.js';

async function main() {
  console.log('=== Enriched Blog Test (5 microsites) ===\n');

  // Find microsites with suppliers that have 3+ products
  const microsites = await prisma.micrositeConfig.findMany({
    where: {
      status: 'ACTIVE',
      supplierId: { not: null },
    },
    include: {
      supplier: { select: { id: true, name: true, cities: true, categories: true } },
    },
    orderBy: { pageViews: 'desc' },
    take: 50,
  });

  const targets: typeof microsites = [];
  for (const ms of microsites) {
    if (targets.length >= 5) break;
    if (ms.supplier == null || ms.supplier.id == null) continue;
    const pc = await prisma.product.count({ where: { supplierId: ms.supplier.id } });
    if (pc >= 3) {
      targets.push(ms);
    }
  }

  console.log(`Found ${targets.length} microsites with 3+ products:\n`);

  for (const ms of targets) {
    const products = await prisma.product.findMany({
      where: { supplierId: ms.supplier!.id },
      select: { title: true },
      orderBy: { rating: 'desc' },
      take: 5,
    });
    console.log(`${ms.siteName} (${ms.fullDomain})`);
    console.log(`  Supplier: ${ms.supplier!.name}`);
    console.log(`  Products: ${products.map((p) => p.title).join(', ')}`);

    try {
      const result = await generateBlogPostForMicrosite(ms.id);
      if (result.postQueued) {
        console.log(`  -> Blog topic generated and queued for content generation`);
      } else {
        console.log(`  -> Skipped: ${result.skippedReason || result.error || 'unknown'}`);
      }
    } catch (err) {
      console.error(`  -> Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log('');
  }

  console.log('Done! Content generation jobs are now in the queue.');
  console.log('The worker will process them through the AI pipeline.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
