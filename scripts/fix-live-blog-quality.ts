#!/usr/bin/env npx ts-node
/**
 * Fix Live Blog Quality Script
 *
 * Reviews published blog posts using Sonnet, then:
 * - Unpublishes articles scored "delete" (< 50 or fundamentally flawed)
 * - Queues CONTENT_OPTIMIZE jobs for articles scored "rewrite" (50-74)
 * - Leaves articles scored "publish" (75+) untouched
 *
 * Usage:
 *   npx ts-node scripts/fix-live-blog-quality.ts                    # Audit only (dry run)
 *   npx ts-node scripts/fix-live-blog-quality.ts --fix              # Unpublish + queue rewrites
 *   npx ts-node scripts/fix-live-blog-quality.ts --limit=50         # Process 50 blogs
 *   npx ts-node scripts/fix-live-blog-quality.ts --microsite-only   # Only microsite blogs
 *   npx ts-node scripts/fix-live-blog-quality.ts --site-only        # Only main site blogs
 *   npx ts-node scripts/fix-live-blog-quality.ts --fix --delete-only # Only unpublish bad articles
 *   npx ts-node scripts/fix-live-blog-quality.ts --fix --rewrite-only # Only queue rewrites
 *
 * Requires: ANTHROPIC_API_KEY, DATABASE_URL, REDIS_URL (for job queue)
 *
 * Estimated cost: ~$0.15-0.30 per 100 reviews (Sonnet input-heavy, short output)
 */

import { PrismaClient, PageType, PageStatus } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import { Queue } from 'bullmq';

const prisma = new PrismaClient();

const SONNET_MODEL = 'claude-sonnet-4-20250514';
const CONCURRENCY = 5;
const DELAY_BETWEEN_BATCHES_MS = 2000;

interface BlogReview {
  pageId: string;
  contentId: string | null;
  siteId: string | null;
  micrositeId: string | null;
  title: string;
  slug: string;
  siteName: string;
  wordCount: number;
  overallScore: number;
  issues: string[];
  recommendation: 'publish' | 'rewrite' | 'delete';
}

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const deleteOnly = args.includes('--delete-only');
  const rewriteOnly = args.includes('--rewrite-only');
  const micrositeOnly = args.includes('--microsite-only');
  const siteOnly = args.includes('--site-only');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '200', 10) : 200;

  const apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'];
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY or CLAUDE_API_KEY env var required');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  console.info('='.repeat(70));
  console.info(shouldFix ? 'FIX LIVE BLOG QUALITY' : 'AUDIT LIVE BLOG QUALITY (dry run)');
  console.info('='.repeat(70));
  console.info(`Limit: ${limit} | Mode: ${shouldFix ? 'FIX' : 'AUDIT'}`);
  if (shouldFix) {
    console.info(
      `Actions: ${deleteOnly ? 'unpublish only' : rewriteOnly ? 'rewrite only' : 'unpublish + rewrite'}`
    );
  }
  console.info('');

  // Build query filter
  const siteFilter = micrositeOnly
    ? { micrositeId: { not: null }, siteId: null }
    : siteOnly
      ? { siteId: { not: null }, micrositeId: null }
      : {};

  // Fetch published blog pages with content
  const blogs = await prisma.page.findMany({
    where: {
      type: PageType.BLOG,
      status: PageStatus.PUBLISHED,
      contentId: { not: null },
      ...siteFilter,
    },
    include: {
      content: { select: { id: true, body: true, qualityScore: true } },
      site: { select: { id: true, name: true } },
      microsite: { select: { id: true, siteName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  // Filter by minimum word count
  const eligibleBlogs = blogs.filter((blog) => {
    const body = blog.content?.body || '';
    return body.split(/\s+/).filter(Boolean).length >= 100;
  });

  console.info(`Found ${blogs.length} published blogs, ${eligibleBlogs.length} with 100+ words`);
  console.info('');

  if (eligibleBlogs.length === 0) {
    console.info('No blogs to process. Exiting.');
    await prisma.$disconnect();
    return;
  }

  // Review with Sonnet
  console.info('Reviewing with Sonnet...');
  const reviews: BlogReview[] = [];

  for (let i = 0; i < eligibleBlogs.length; i += CONCURRENCY) {
    const batch = eligibleBlogs.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    const totalBatches = Math.ceil(eligibleBlogs.length / CONCURRENCY);
    console.info(`  Batch ${batchNum}/${totalBatches} (${reviews.length}/${eligibleBlogs.length})`);

    const batchResults = await Promise.all(
      batch.map(async (blog) => {
        const body = blog.content?.body || '';
        const wordCount = body.split(/\s+/).filter(Boolean).length;
        const siteName = blog.site?.name || blog.microsite?.siteName || 'Unknown';

        try {
          const response = await client.messages.create({
            model: SONNET_MODEL,
            max_tokens: 400,
            temperature: 0.2,
            system:
              'You are a senior content editor reviewing AI-generated blog posts for a travel experience marketplace. Be critical but fair.',
            messages: [
              {
                role: 'user',
                content: `Review this blog post from "${siteName}".

TITLE: ${blog.title}
CONTENT (${wordCount} words):
${body.substring(0, 4000)}${body.length > 4000 ? '\n[TRUNCATED]' : ''}

Score 0-100 and list issues. Return ONLY valid JSON:
{"overallScore": 75, "issues": ["issue 1"], "recommendation": "publish|rewrite|delete"}

- "publish": Score 75+, good quality
- "rewrite": Score 50-74, fixable issues
- "delete": Score <50, fundamentally flawed (truncated, spam links, wrong topic, gibberish)`,
              },
            ],
          });

          const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) return null;

          const review = JSON.parse(jsonMatch[0]);
          return {
            pageId: blog.id,
            contentId: blog.contentId,
            siteId: blog.siteId,
            micrositeId: blog.micrositeId,
            title: blog.title,
            slug: blog.slug,
            siteName,
            wordCount,
            overallScore: review.overallScore,
            issues: review.issues || [],
            recommendation: review.recommendation,
          } as BlogReview;
        } catch (error) {
          console.warn(`  [ERROR] Failed: "${blog.title}"`);
          return null;
        }
      })
    );

    reviews.push(...(batchResults.filter(Boolean) as BlogReview[]));

    if (i + CONCURRENCY < eligibleBlogs.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  // Categorize results
  const toDelete = reviews.filter((r) => r.recommendation === 'delete');
  const toRewrite = reviews.filter((r) => r.recommendation === 'rewrite');
  const publishOk = reviews.filter((r) => r.recommendation === 'publish');
  const avgScore =
    reviews.length > 0 ? reviews.reduce((a, b) => a + b.overallScore, 0) / reviews.length : 0;

  console.info('');
  console.info('--- RESULTS ---');
  console.info(`Reviewed:     ${reviews.length}`);
  console.info(`Avg score:    ${avgScore.toFixed(1)}/100`);
  console.info(`Publish-ok:   ${publishOk.length} (${((publishOk.length / reviews.length) * 100).toFixed(0)}%)`);
  console.info(`Need rewrite: ${toRewrite.length} (${((toRewrite.length / reviews.length) * 100).toFixed(0)}%)`);
  console.info(`Should delete:${toDelete.length} (${((toDelete.length / reviews.length) * 100).toFixed(0)}%)`);
  console.info('');

  if (toDelete.length > 0) {
    console.info('--- ARTICLES TO UNPUBLISH ---');
    for (const article of toDelete.slice(0, 20)) {
      console.info(`  ${String(article.overallScore).padStart(3)}/100 | ${article.title.substring(0, 60)}`);
      if (article.issues.length > 0) {
        console.info(`         ${article.issues[0]}`);
      }
    }
    if (toDelete.length > 20) {
      console.info(`  ... and ${toDelete.length - 20} more`);
    }
    console.info('');
  }

  if (!shouldFix) {
    console.info('This was a dry run. Re-run with --fix to apply changes.');
    await prisma.$disconnect();
    return;
  }

  // --- APPLY FIXES ---

  let unpublished = 0;
  let rewritesQueued = 0;

  // 1. Unpublish articles recommended for deletion
  if (!rewriteOnly && toDelete.length > 0) {
    console.info(`Unpublishing ${toDelete.length} articles...`);
    for (const article of toDelete) {
      try {
        await prisma.page.update({
          where: { id: article.pageId },
          data: { status: PageStatus.DRAFT, noIndex: true },
        });
        unpublished++;
      } catch (error) {
        console.warn(`  [ERROR] Failed to unpublish: ${article.pageId}`);
      }
    }
    console.info(`  Unpublished: ${unpublished}/${toDelete.length}`);
  }

  // 2. Queue CONTENT_OPTIMIZE jobs for articles needing rewrite
  if (!deleteOnly && toRewrite.length > 0) {
    const redisUrl = process.env['REDIS_TLS_URL'] || process.env['REDIS_URL'];
    if (!redisUrl) {
      console.warn('REDIS_URL not set — skipping rewrite job queue. Set REDIS_URL to queue jobs.');
    } else {
      console.info(`Queuing ${toRewrite.length} rewrite jobs...`);

      const isTLS = redisUrl.startsWith('rediss://');
      const connection = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        ...(isTLS ? { tls: { rejectUnauthorized: false } } : {}),
      });

      const queue = new Queue('content', { connection });

      for (let i = 0; i < toRewrite.length; i++) {
        const article = toRewrite[i]!;
        try {
          await queue.add(
            'CONTENT_OPTIMIZE',
            {
              siteId: article.siteId || undefined,
              micrositeId: article.micrositeId || undefined,
              pageId: article.pageId,
              contentId: article.contentId || undefined,
              reason: 'low_ctr' as const,
              optimizationPrompt: `Quality review found issues: ${article.issues.slice(0, 3).join('; ')}. Rewrite to fix these problems while maintaining SEO value.`,
            },
            {
              delay: i * 15_000, // 15s stagger to prevent queue flooding
            }
          );
          rewritesQueued++;
        } catch (error) {
          console.warn(`  [ERROR] Failed to queue: ${article.pageId}`);
        }
      }

      await queue.close();
      await connection.quit();
      console.info(`  Queued: ${rewritesQueued}/${toRewrite.length} (staggered 15s apart)`);
    }
  }

  console.info('');
  console.info('--- SUMMARY ---');
  console.info(`Articles unpublished: ${unpublished}`);
  console.info(`Rewrite jobs queued:  ${rewritesQueued}`);
  console.info(`Articles already ok:  ${publishOk.length}`);
  console.info('='.repeat(70));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
