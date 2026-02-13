/**
 * Directly generate content for pending blog pages, bypassing the queue.
 * Useful when the queue is backed up with other jobs.
 *
 * Run: set -a && source .env.local && npx tsx packages/jobs/src/scripts/generate-pending-blogs.ts
 */

import { prisma, PageType } from '@experience-marketplace/database';
import { handleContentGenerate } from '../workers/content.js';

const DOMAINS = [
  'phototrek-tours.experiencess.com',
  'trawey-tours.experiencess.com',
  'london-experiences.experiencess.com',
];

async function main() {
  console.log('=== Direct Blog Content Generation ===\n');

  for (const domain of DOMAINS) {
    const ms = await prisma.micrositeConfig.findFirst({
      where: { fullDomain: domain },
      select: { id: true, siteName: true },
    });
    if (!ms) continue;

    // Find DRAFT blog pages without content
    const pendingBlogs = await prisma.page.findMany({
      where: {
        micrositeId: ms.id,
        type: PageType.BLOG,
        status: 'DRAFT',
        contentId: null,
      },
      select: { id: true, title: true, slug: true },
    });

    for (const blog of pendingBlogs) {
      console.log(`\nGenerating: "${blog.title}" (${ms.siteName})`);
      console.log(`  Page ID: ${blog.id}`);

      try {
        const result = await handleContentGenerate({
          data: {
            micrositeId: ms.id,
            pageId: blog.id,
            contentType: 'blog',
            targetKeyword: blog.title,
          },
        } as any);

        if (result.success) {
          console.log(`  -> SUCCESS! Content generated and published.`);
        } else {
          console.log(`  -> Failed: ${result.error || 'unknown error'}`);
        }
      } catch (err) {
        console.error(`  -> Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log('\nDone!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
