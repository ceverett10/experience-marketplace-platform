/**
 * Fix blog post slugs that are missing the 'blog/' prefix
 *
 * The frontend expects blog slugs to be stored WITH the 'blog/' prefix
 * (e.g., 'blog/my-post'), but some posts were created without it.
 * This script adds the prefix to any blog posts missing it.
 *
 * Run with: npx tsx scripts/fix-blog-slugs.ts
 */

import 'dotenv/config';
import { PrismaClient, PageType } from '@prisma/client';

const prisma = new PrismaClient();

async function fixBlogSlugs() {
  console.log('Finding blog posts with missing blog/ prefix...\n');

  // Find all BLOG type pages that don't have the blog/ prefix
  const blogsWithoutPrefix = await prisma.page.findMany({
    where: {
      type: PageType.BLOG,
      NOT: {
        slug: {
          startsWith: 'blog/',
        },
      },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      siteId: true,
      site: {
        select: {
          name: true,
          primaryDomain: true,
        },
      },
    },
  });

  if (blogsWithoutPrefix.length === 0) {
    console.log('✅ No blog posts found with missing prefix. All slugs are correct.');
    return;
  }

  console.log(`Found ${blogsWithoutPrefix.length} blog posts to fix:\n`);

  let fixedCount = 0;
  let errorCount = 0;

  for (const blog of blogsWithoutPrefix) {
    const oldSlug = blog.slug;
    const newSlug = `blog/${oldSlug}`;

    console.log(`  Site: ${blog.site.name} (${blog.site.primaryDomain || 'no domain'})`);
    console.log(`  Title: ${blog.title}`);
    console.log(`  Old slug: ${oldSlug}`);
    console.log(`  New slug: ${newSlug}`);

    try {
      // Check if new slug already exists (avoid duplicates)
      const existing = await prisma.page.findFirst({
        where: {
          siteId: blog.siteId,
          slug: newSlug,
        },
      });

      if (existing) {
        console.log(`  ⚠️  Skipped: New slug already exists\n`);
        errorCount++;
        continue;
      }

      // Update the slug
      await prisma.page.update({
        where: { id: blog.id },
        data: { slug: newSlug },
      });

      console.log(`  ✅ Fixed\n`);
      fixedCount++;
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
      errorCount++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total found: ${blogsWithoutPrefix.length}`);
  console.log(`Fixed: ${fixedCount}`);
  console.log(`Skipped/Errors: ${errorCount}`);
}

async function main() {
  try {
    await fixBlogSlugs();
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
