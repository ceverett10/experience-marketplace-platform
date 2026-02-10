#!/usr/bin/env npx tsx
/**
 * Bootstrap blog generation for microsites.
 *
 * 1. Re-queues any existing DRAFT blog pages that have no content
 * 2. Generates new blog pages for active microsites that have none
 *
 * Run with: set -a && source .env.local && npx tsx packages/jobs/src/scripts/bootstrap-microsite-blogs.ts
 */

// Note: On Heroku, env vars are already configured - no dotenv needed
// For local development, run: set -a && source .env.local && npx tsx ...
import { prisma, PageType } from '@experience-marketplace/database';
import { addJob } from '../queues/index.js';
import { bootstrapBlogPostsForNewMicrosites } from '../services/microsite-blog-generator.js';

async function main() {
  console.log('=== Microsite Blog Bootstrap ===\n');

  // Step 1: Re-queue any existing DRAFT blog pages that have no content
  const draftBlogs = await prisma.page.findMany({
    where: {
      type: PageType.BLOG,
      status: 'DRAFT',
      micrositeId: { not: null },
      contentId: null,
    },
    select: {
      id: true,
      title: true,
      micrositeId: true,
      microsite: { select: { siteName: true, fullDomain: true } },
    },
  });

  console.log(`Found ${draftBlogs.length} DRAFT blog pages without content\n`);

  for (const page of draftBlogs) {
    console.log(`Re-queuing: "${page.title}" (${page.microsite?.fullDomain})`);
    try {
      await addJob('CONTENT_GENERATE', {
        micrositeId: page.micrositeId!,
        pageId: page.id,
        contentType: 'blog',
        targetKeyword: page.title || 'travel blog',
      });
      console.log('  -> Queued successfully');
    } catch (err) {
      console.error('  -> Error:', err instanceof Error ? err.message : String(err));
    }
  }

  // Step 2: Bootstrap new blog pages for microsites that have none
  console.log('\n--- Bootstrapping new microsites ---\n');
  const result = await bootstrapBlogPostsForNewMicrosites();

  console.log('\n=== Summary ===');
  console.log(`DRAFT pages re-queued: ${draftBlogs.length}`);
  console.log(`New microsites checked: ${result.totalMicrosites}`);
  console.log(`New posts queued: ${result.postsQueued}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Errors: ${result.errors}`);
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
