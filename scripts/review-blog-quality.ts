#!/usr/bin/env npx ts-node
/**
 * Blog Quality Review Script
 *
 * Uses Claude Sonnet to review blog posts written by Haiku, assessing quality
 * and identifying issues. Outputs a summary report with per-article scores.
 *
 * Usage:
 *   npx ts-node scripts/review-blog-quality.ts                     # Review 200 blogs (default)
 *   npx ts-node scripts/review-blog-quality.ts --limit=50          # Review 50 blogs
 *   npx ts-node scripts/review-blog-quality.ts --microsite-only    # Only microsite blogs
 *   npx ts-node scripts/review-blog-quality.ts --site-only         # Only main site blogs
 *   npx ts-node scripts/review-blog-quality.ts --min-words=100     # Skip very short content
 *
 * Requires: ANTHROPIC_API_KEY or CLAUDE_API_KEY env var
 *
 * Estimated cost: ~$0.15-0.30 per 100 reviews (Sonnet input-heavy, short output)
 */

import { PrismaClient, PageType, PageStatus } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const prisma = new PrismaClient();

const SONNET_MODEL = 'claude-sonnet-4-20250514';
const CONCURRENCY = 5; // Parallel reviews
const DELAY_BETWEEN_BATCHES_MS = 2000;

interface BlogReview {
  pageId: string;
  title: string;
  slug: string;
  siteName: string;
  siteType: 'main_site' | 'microsite';
  wordCount: number;
  existingQualityScore: number | null;
  // Sonnet review results
  overallScore: number;
  relevanceScore: number;
  seoScore: number;
  readabilityScore: number;
  accuracyScore: number;
  engagementScore: number;
  issues: string[];
  strengths: string[];
  recommendation: 'publish' | 'rewrite' | 'delete';
}

interface ReviewSummary {
  totalReviewed: number;
  averageScore: number;
  scoreDistribution: Record<string, number>;
  topIssues: Array<{ issue: string; count: number }>;
  recommendationBreakdown: Record<string, number>;
  worstArticles: BlogReview[];
  bestArticles: BlogReview[];
  costEstimate: number;
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '200', 10) : 200;
  const micrositeOnly = args.includes('--microsite-only');
  const siteOnly = args.includes('--site-only');
  const minWordsArg = args.find((arg) => arg.startsWith('--min-words='));
  const minWords = minWordsArg ? parseInt(minWordsArg.split('=')[1] || '100', 10) : 100;

  const apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'];
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY or CLAUDE_API_KEY env var required');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  console.info('='.repeat(70));
  console.info('BLOG QUALITY REVIEW — Sonnet reviewing Haiku-generated blogs');
  console.info('='.repeat(70));
  console.info(`Limit: ${limit} | Min words: ${minWords}`);
  console.info(
    `Filter: ${micrositeOnly ? 'microsites only' : siteOnly ? 'main sites only' : 'all blogs'}`
  );
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
      content: true,
      site: { select: { id: true, name: true } },
      microsite: { select: { id: true, siteName: true, entityType: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  console.info(`Found ${blogs.length} published blog pages to review`);

  if (blogs.length === 0) {
    console.info('No blogs found matching criteria. Exiting.');
    await prisma.$disconnect();
    return;
  }

  // Filter by word count
  const eligibleBlogs = blogs.filter((blog) => {
    const body = blog.content?.body || '';
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    return wordCount >= minWords;
  });

  console.info(`${eligibleBlogs.length} blogs meet minimum word count (${minWords} words)`);
  console.info('');
  console.info('Starting Sonnet reviews...');
  console.info('');

  // Process in batches
  const reviews: BlogReview[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < eligibleBlogs.length; i += CONCURRENCY) {
    const batch = eligibleBlogs.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    const totalBatches = Math.ceil(eligibleBlogs.length / CONCURRENCY);

    console.info(
      `Batch ${batchNum}/${totalBatches} (${reviews.length}/${eligibleBlogs.length} done)`
    );

    const batchResults = await Promise.all(
      batch.map(async (blog) => {
        const body = blog.content?.body || '';
        const wordCount = body.split(/\s+/).filter(Boolean).length;
        const siteName = blog.site?.name || blog.microsite?.siteName || 'Unknown';
        const siteType = blog.micrositeId ? 'microsite' : 'main_site';

        try {
          const response = await client.messages.create({
            model: SONNET_MODEL,
            max_tokens: 500,
            temperature: 0.2,
            system: `You are a senior content editor reviewing AI-generated blog posts for a travel experience marketplace. Be critical but fair. Focus on issues that hurt SEO, user trust, or conversion.`,
            messages: [
              {
                role: 'user',
                content: `Review this blog post. The site is "${siteName}" (${siteType}).

TITLE: ${blog.title}
SLUG: ${blog.slug}

CONTENT (${wordCount} words):
${body.substring(0, 4000)}${body.length > 4000 ? '\n\n[TRUNCATED — full article is longer]' : ''}

Score each dimension 0-100 and list specific issues. Return ONLY valid JSON:
{
  "overallScore": 75,
  "relevanceScore": 80,
  "seoScore": 70,
  "readabilityScore": 85,
  "accuracyScore": 75,
  "engagementScore": 65,
  "issues": ["Issue 1", "Issue 2"],
  "strengths": ["Strength 1"],
  "recommendation": "publish|rewrite|delete"
}

Scoring guide:
- relevance: Is content relevant to the site's niche and location? Generic filler = low
- seo: Keyword usage, headings, meta-worthy title, internal linking opportunities
- readability: Clear structure, no AI slop (repetitive phrases, "delve into", "tapestry")
- accuracy: Factual claims, no hallucinated places/events/statistics
- engagement: Would a traveler find this useful? Does it drive bookings?
- recommendation: "publish" (75+), "rewrite" (50-74), "delete" (<50 or fundamentally flawed)`,
              },
            ],
          });

          totalInputTokens += response.usage.input_tokens;
          totalOutputTokens += response.usage.output_tokens;

          const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);

          if (!jsonMatch) {
            console.warn(`  [WARN] Failed to parse review for: ${blog.title}`);
            return null;
          }

          const review = JSON.parse(jsonMatch[0]) as Omit<
            BlogReview,
            | 'pageId'
            | 'title'
            | 'slug'
            | 'siteName'
            | 'siteType'
            | 'wordCount'
            | 'existingQualityScore'
          >;

          return {
            pageId: blog.id,
            title: blog.title,
            slug: blog.slug,
            siteName,
            siteType,
            wordCount,
            existingQualityScore: blog.content?.qualityScore ?? null,
            ...review,
          } as BlogReview;
        } catch (error) {
          console.warn(
            `  [ERROR] Review failed for "${blog.title}": ${error instanceof Error ? error.message : 'Unknown'}`
          );
          return null;
        }
      })
    );

    reviews.push(...(batchResults.filter(Boolean) as BlogReview[]));

    // Rate limit between batches
    if (i + CONCURRENCY < eligibleBlogs.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  // Generate summary
  const summary = generateSummary(reviews, totalInputTokens, totalOutputTokens);
  printReport(summary, reviews);

  await prisma.$disconnect();
}

function generateSummary(
  reviews: BlogReview[],
  inputTokens: number,
  outputTokens: number
): ReviewSummary {
  const scores = reviews.map((r) => r.overallScore);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  // Score distribution
  const distribution: Record<string, number> = {
    'excellent (90-100)': 0,
    'good (75-89)': 0,
    'needs_rewrite (50-74)': 0,
    'poor (25-49)': 0,
    'delete (<25)': 0,
  };

  for (const score of scores) {
    if (score >= 90) distribution['excellent (90-100)']!++;
    else if (score >= 75) distribution['good (75-89)']!++;
    else if (score >= 50) distribution['needs_rewrite (50-74)']!++;
    else if (score >= 25) distribution['poor (25-49)']!++;
    else distribution['delete (<25)']!++;
  }

  // Top issues
  const issueCounts = new Map<string, number>();
  for (const review of reviews) {
    for (const issue of review.issues) {
      const normalized = issue.toLowerCase().trim();
      issueCounts.set(normalized, (issueCounts.get(normalized) || 0) + 1);
    }
  }
  const topIssues = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([issue, count]) => ({ issue, count }));

  // Recommendation breakdown
  const recommendations: Record<string, number> = { publish: 0, rewrite: 0, delete: 0 };
  for (const review of reviews) {
    recommendations[review.recommendation] = (recommendations[review.recommendation] || 0) + 1;
  }

  // Worst and best
  const sorted = [...reviews].sort((a, b) => a.overallScore - b.overallScore);
  const worstArticles = sorted.slice(0, 10);
  const bestArticles = sorted.slice(-5).reverse();

  // Cost estimate (Sonnet pricing)
  const costEstimate = (inputTokens / 1_000_000) * 3.0 + (outputTokens / 1_000_000) * 15.0;

  return {
    totalReviewed: reviews.length,
    averageScore: Math.round(avgScore * 10) / 10,
    scoreDistribution: distribution,
    topIssues,
    recommendationBreakdown: recommendations,
    worstArticles,
    bestArticles,
    costEstimate,
  };
}

function printReport(summary: ReviewSummary, reviews: BlogReview[]) {
  console.info('');
  console.info('='.repeat(70));
  console.info('BLOG QUALITY REVIEW REPORT');
  console.info('='.repeat(70));
  console.info('');

  // Overview
  console.info(`Total reviewed: ${summary.totalReviewed}`);
  console.info(`Average score:  ${summary.averageScore}/100`);
  console.info(`Review cost:    $${summary.costEstimate.toFixed(2)}`);
  console.info('');

  // Score distribution
  console.info('--- SCORE DISTRIBUTION ---');
  for (const [bucket, count] of Object.entries(summary.scoreDistribution)) {
    const pct =
      summary.totalReviewed > 0 ? ((count / summary.totalReviewed) * 100).toFixed(1) : '0';
    const bar = '#'.repeat(Math.round(count / Math.max(summary.totalReviewed / 40, 1)));
    console.info(
      `  ${bucket.padEnd(25)} ${String(count).padStart(4)} (${pct.padStart(5)}%) ${bar}`
    );
  }
  console.info('');

  // Recommendations
  console.info('--- RECOMMENDATIONS ---');
  for (const [rec, count] of Object.entries(summary.recommendationBreakdown)) {
    const pct =
      summary.totalReviewed > 0 ? ((count / summary.totalReviewed) * 100).toFixed(1) : '0';
    console.info(`  ${rec.padEnd(10)} ${String(count).padStart(4)} (${pct}%)`);
  }
  console.info('');

  // Dimension averages
  const dimAvg = (dim: keyof BlogReview) => {
    const vals = reviews.map((r) => r[dim] as number).filter((v) => typeof v === 'number');
    return vals.length > 0
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      : 0;
  };
  console.info('--- DIMENSION AVERAGES ---');
  console.info(`  Relevance:   ${dimAvg('relevanceScore')}/100`);
  console.info(`  SEO:         ${dimAvg('seoScore')}/100`);
  console.info(`  Readability: ${dimAvg('readabilityScore')}/100`);
  console.info(`  Accuracy:    ${dimAvg('accuracyScore')}/100`);
  console.info(`  Engagement:  ${dimAvg('engagementScore')}/100`);
  console.info('');

  // Microsite vs main site comparison
  const micrositeReviews = reviews.filter((r) => r.siteType === 'microsite');
  const mainSiteReviews = reviews.filter((r) => r.siteType === 'main_site');
  if (micrositeReviews.length > 0 && mainSiteReviews.length > 0) {
    const msAvg =
      micrositeReviews.reduce((a, b) => a + b.overallScore, 0) / micrositeReviews.length;
    const mainAvg =
      mainSiteReviews.reduce((a, b) => a + b.overallScore, 0) / mainSiteReviews.length;
    console.info('--- SITE TYPE COMPARISON ---');
    console.info(
      `  Microsites:  ${msAvg.toFixed(1)}/100 avg (${micrositeReviews.length} reviewed)`
    );
    console.info(
      `  Main sites:  ${mainAvg.toFixed(1)}/100 avg (${mainSiteReviews.length} reviewed)`
    );
    console.info('');
  }

  // Top issues
  console.info('--- TOP ISSUES (most common) ---');
  for (const { issue, count } of summary.topIssues) {
    console.info(`  [${count}x] ${issue}`);
  }
  console.info('');

  // Worst articles
  console.info('--- WORST 10 ARTICLES ---');
  for (const article of summary.worstArticles) {
    console.info(
      `  ${String(article.overallScore).padStart(3)}/100 | ${article.recommendation.padEnd(7)} | ${article.title.substring(0, 55)}`
    );
    console.info(`         ${article.siteName} | ${article.slug}`);
    if (article.issues.length > 0) {
      console.info(`         Issues: ${article.issues.slice(0, 3).join('; ')}`);
    }
    console.info('');
  }

  // Best articles
  console.info('--- BEST 5 ARTICLES ---');
  for (const article of summary.bestArticles) {
    console.info(
      `  ${String(article.overallScore).padStart(3)}/100 | ${article.title.substring(0, 60)}`
    );
    console.info(`         ${article.siteName}`);
    if (article.strengths.length > 0) {
      console.info(`         Strengths: ${article.strengths.slice(0, 2).join('; ')}`);
    }
    console.info('');
  }

  // Haiku quality score vs Sonnet review comparison
  const withBothScores = reviews.filter(
    (r) => r.existingQualityScore !== null && r.existingQualityScore !== undefined
  );
  if (withBothScores.length > 0) {
    const haikuAvg =
      withBothScores.reduce((a, b) => a + (b.existingQualityScore || 0), 0) / withBothScores.length;
    const sonnetAvg =
      withBothScores.reduce((a, b) => a + b.overallScore, 0) / withBothScores.length;
    const diff = haikuAvg - sonnetAvg;
    console.info('--- HAIKU SELF-ASSESSMENT vs SONNET REVIEW ---');
    console.info(`  Haiku avg self-score:  ${haikuAvg.toFixed(1)}/100`);
    console.info(`  Sonnet review avg:     ${sonnetAvg.toFixed(1)}/100`);
    console.info(
      `  Gap:                   ${diff > 0 ? '+' : ''}${diff.toFixed(1)} (${diff > 0 ? 'Haiku overestimates' : 'Haiku underestimates'})`
    );
    console.info(`  Compared across:       ${withBothScores.length} articles`);
    console.info('');
  }

  console.info('='.repeat(70));
  console.info('Review complete.');
  console.info('='.repeat(70));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
