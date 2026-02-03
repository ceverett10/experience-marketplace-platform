/**
 * Regenerate About Us pages for all sites
 *
 * This script queues CONTENT_GENERATE jobs for all About pages
 * using the new 'about' content type which has strict factual guardrails
 * to prevent AI hallucination of founders, dates, statistics, and broken links.
 *
 * Usage: heroku run node scripts/regenerate-about-pages.js
 */

const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const prisma = new PrismaClient();

async function main() {
  console.log('[Regenerate About Pages] Starting...');

  // Find all sites with About pages
  const aboutPages = await prisma.page.findMany({
    where: {
      type: 'ABOUT',
      slug: 'about',
    },
    include: {
      site: {
        select: {
          id: true,
          name: true,
          seoConfig: true,
        },
      },
      content: {
        select: {
          id: true,
          body: true,
          isAiGenerated: true,
        },
      },
    },
  });

  console.log(`[Regenerate About Pages] Found ${aboutPages.length} About pages across all sites`);

  if (aboutPages.length === 0) {
    console.log('[Regenerate About Pages] No About pages found. Exiting.');
    return;
  }

  // Analyze current content for issues
  for (const page of aboutPages) {
    const content = page.content?.body || '';
    const siteName = page.site?.name || 'Unknown';

    // Check for common hallucination patterns
    const issues = [];
    if (/founded in \d{4}/i.test(content)) issues.push('fabricated founding date');
    if (/founded by [A-Z][a-z]+ [A-Z][a-z]+/i.test(content)) issues.push('fabricated founder name');
    if (/over [\d,]+ (travelers|customers|visitors|tours)/i.test(content))
      issues.push('fabricated statistics');
    if (/partnership with|partnered with/i.test(content)) issues.push('fabricated partnerships');
    if (/24\/7 (support|customer service)/i.test(content))
      issues.push('unverifiable support claim');

    // Check for broken links (links to non-standard routes)
    const linkPattern = /\[([^\]]+)\]\(\/([^)]+)\)/g;
    const validPrefixes = [
      'experiences',
      'destinations',
      'categories',
      'about',
      'contact',
      'privacy',
      'terms',
    ];
    let match;
    const brokenLinks = [];
    while ((match = linkPattern.exec(content)) !== null) {
      const path = match[2];
      const isValid = validPrefixes.some(
        (p) => path === p || path.startsWith(p + '?') || path.startsWith(p + '/')
      );
      if (!isValid) {
        brokenLinks.push(`/${path}`);
      }
    }
    if (brokenLinks.length > 0) {
      issues.push(`${brokenLinks.length} broken links: ${brokenLinks.join(', ')}`);
    }

    console.log(`\n  Site: ${siteName} (${page.site?.id})`);
    console.log(`  Page ID: ${page.id}`);
    console.log(`  AI Generated: ${page.content?.isAiGenerated || false}`);
    console.log(`  Issues found: ${issues.length > 0 ? issues.join('; ') : 'none detected'}`);
  }

  // Queue regeneration jobs
  console.log('\n[Regenerate About Pages] Queuing regeneration jobs...');

  const redis = new Redis(process.env.REDIS_URL);
  const queue = new Queue('content', { connection: redis });

  let queued = 0;
  for (const page of aboutPages) {
    const siteName = page.site?.name || 'Unknown Site';
    const seoConfig = page.site?.seoConfig;
    const niche =
      typeof seoConfig === 'object' && seoConfig !== null && 'niche' in seoConfig
        ? seoConfig.niche
        : '';

    const job = await queue.add(
      'CONTENT_GENERATE',
      {
        siteId: page.site?.id,
        pageId: page.id,
        contentType: 'about',
        targetKeyword: `About ${siteName}`,
        secondaryKeywords: [niche, 'travel experiences'].filter(Boolean),
      },
      {
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    console.log(`  Queued regeneration for ${siteName} (job: ${job.id})`);
    queued++;
  }

  await queue.close();
  await redis.quit();

  console.log(`\n[Regenerate About Pages] Done! ${queued} regeneration jobs queued.`);
  console.log('[Regenerate About Pages] About pages will be regenerated with factual guardrails.');
  console.log('[Regenerate About Pages] - No fabricated founders, dates, or statistics');
  console.log('[Regenerate About Pages] - No broken internal links');
  console.log('[Regenerate About Pages] - Only verifiable claims from brand identity');
}

main()
  .catch((error) => {
    console.error('[Regenerate About Pages] Error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
