#!/usr/bin/env npx ts-node
/**
 * Review All Content Quality
 *
 * Reviews published BLOG, FAQ, LEGAL, and CONTACT pages using Sonnet
 * with type-specific quality criteria. Outputs per-type reports.
 *
 * Usage:
 *   npx ts-node scripts/review-all-content.ts                  # Review all types
 *   npx ts-node scripts/review-all-content.ts --type=BLOG      # Single type
 *   npx ts-node scripts/review-all-content.ts --limit=50       # Limit per type
 *   npx ts-node scripts/review-all-content.ts --fix            # Apply fixes
 *   npx ts-node scripts/review-all-content.ts --fix --delete-only
 */

import { PrismaClient, PageType, PageStatus } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const prisma = new PrismaClient();
const SONNET_MODEL = 'claude-sonnet-4-20250514';
const CONCURRENCY = 5;
const DELAY_MS = 2000;

interface Review {
  pageId: string;
  contentId: string | null;
  siteId: string | null;
  micrositeId: string | null;
  pageType: string;
  title: string;
  slug: string;
  siteName: string;
  siteType: 'main_site' | 'microsite';
  wordCount: number;
  overallScore: number;
  issues: string[];
  recommendation: 'publish' | 'rewrite' | 'delete';
}

// Type-specific review prompts — each focuses on what matters for that content type
function getReviewPrompt(
  type: string,
  title: string,
  body: string,
  wordCount: number,
  siteName: string,
  siteType: string
): string {
  const truncatedBody = body.substring(0, 4000) + (body.length > 4000 ? '\n[TRUNCATED]' : '');

  const baseHeader = `Review this ${type} page from "${siteName}" (${siteType}).
TITLE: ${title}
CONTENT (${wordCount} words):
${truncatedBody}`;

  const baseFooter = `Return ONLY valid JSON:
{"overallScore": 75, "issues": ["issue 1", "issue 2"], "recommendation": "publish|rewrite|delete"}

- "publish": Score 75+, good quality, safe to keep live
- "rewrite": Score 50-74, fixable issues worth salvaging
- "delete": Score <50, fundamentally flawed, harmful to keep live`;

  switch (type) {
    case 'BLOG':
      return `${baseHeader}

REVIEW CRITERIA FOR BLOG:
1. TRUNCATION: Is the article complete? Does it end mid-sentence? (instant "delete" if truncated)
2. LINK SPAM: Does it contain blocks of irrelevant destination links? (instant "delete" if 5+ unrelated links)
3. RELEVANCE: Is the content relevant to "${siteName}" and its niche? Wrong city/topic = major issue
4. SEO: Keyword usage, heading structure, meta-worthy title
5. READABILITY: Clear structure, no AI slop ("delve into", "tapestry of", "vibrant"), no repetitive filler
6. ACCURACY: No hallucinated facts, statistics, events, or venues
7. ENGAGEMENT: Would a traveler find this useful? Does it help them decide to book?

${baseFooter}`;

    case 'FAQ':
      return `${baseHeader}

REVIEW CRITERIA FOR FAQ PAGE:
1. FORMAT: Is it properly structured as Q&A? Questions as headings, clear answers?
2. RELEVANCE: Are the questions relevant to "${siteName}" and what it offers?
3. ACCURACY: Are answers factually correct? No fabricated policies, prices, or operational details?
4. HELPFULNESS: Would these questions actually help a customer? Not generic filler?
5. COMPLETENESS: Are answers substantive (not just 1 sentence)? Do they address the question fully?
6. NO HALLUCINATION: No fabricated business hours, phone numbers, refund policies, or team details
7. LEGAL CLAIMS: Any consumer rights references must be UK law (not US/EU unless stated)

${baseFooter}`;

    case 'LEGAL':
      return `${baseHeader}

REVIEW CRITERIA FOR LEGAL PAGE:
1. JURISDICTION: Legal references MUST be UK law. US law references (CCPA, California, etc.) = major issue
2. NO FABRICATION: No fabricated company registration numbers, addresses, or regulatory body references
3. ACCURACY: Consumer rights, refund policies, data protection must reference correct UK legislation (Consumer Rights Act 2015, UK GDPR, etc.)
4. COMPLETENESS: Does it cover essential sections? (Terms of use, liability, data handling, refunds)
5. NO PLACEHOLDER TEXT: No "[Company Name]", "[Address]", "TBD", or obviously template content
6. APPROPRIATE SCOPE: Is it relevant to a travel experience marketplace? Not copied from unrelated industry?
7. CONTACT DETAILS: No fabricated phone numbers, emails, or physical addresses

Score harshly — bad legal pages create real liability risk.

${baseFooter}`;

    case 'CONTACT':
      return `${baseHeader}

REVIEW CRITERIA FOR CONTACT PAGE:
1. NO FABRICATED DETAILS: No made-up phone numbers, email addresses, physical addresses, or business hours
2. APPROPRIATE: Does it direct users to actual contact methods (e.g., booking platform, general inquiry)?
3. NO PLACEHOLDER: No "[email]", "123-456-7890", or obviously fake details
4. RELEVANCE: Is it appropriate for "${siteName}"? Not a generic template?
5. EXPECTATIONS: Does it set reasonable expectations for response times without making false promises?
6. COMPLETENESS: Does it provide at least one valid way to get help?

Any fabricated contact details = automatic "delete". This directly harms user trust.

${baseFooter}`;

    default:
      return `${baseHeader}\n\nScore quality 0-100.\n\n${baseFooter}`;
  }
}

async function reviewBatch(client: Anthropic, pages: any[], type: string): Promise<Review[]> {
  const reviews: Review[] = [];

  for (let i = 0; i < pages.length; i += CONCURRENCY) {
    const batch = pages.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    const totalBatches = Math.ceil(pages.length / CONCURRENCY);

    if (batchNum % 5 === 1 || batchNum === totalBatches) {
      console.info(
        `  [${type}] Batch ${batchNum}/${totalBatches} (${reviews.length}/${pages.length} done)`
      );
    }

    const results = await Promise.all(
      batch.map(async (page: any) => {
        const body = page.content?.body || '';
        const wordCount = body.split(/\s+/).filter(Boolean).length;
        const siteName = page.site?.name || page.microsite?.siteName || 'Unknown';
        const siteType = page.micrositeId ? 'microsite' : 'main_site';

        try {
          const response = await client.messages.create({
            model: SONNET_MODEL,
            max_tokens: 400,
            temperature: 0.2,
            system:
              'You are a senior content editor auditing AI-generated pages for a UK-based travel experience marketplace. Be critical. Protecting user trust and SEO is the priority.',
            messages: [
              {
                role: 'user',
                content: getReviewPrompt(type, page.title, body, wordCount, siteName, siteType),
              },
            ],
          });

          const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) return null;

          const parsed = JSON.parse(jsonMatch[0]);
          return {
            pageId: page.id,
            contentId: page.contentId,
            siteId: page.siteId,
            micrositeId: page.micrositeId,
            pageType: type,
            title: page.title,
            slug: page.slug,
            siteName,
            siteType,
            wordCount,
            overallScore: parsed.overallScore,
            issues: parsed.issues || [],
            recommendation: parsed.recommendation,
          } as Review;
        } catch {
          return null;
        }
      })
    );

    reviews.push(...(results.filter(Boolean) as Review[]));

    if (i + CONCURRENCY < pages.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  return reviews;
}

function printTypeReport(type: string, reviews: Review[]) {
  if (reviews.length === 0) return;

  const avg = reviews.reduce((a, b) => a + b.overallScore, 0) / reviews.length;
  const toDelete = reviews.filter((r) => r.recommendation === 'delete');
  const toRewrite = reviews.filter((r) => r.recommendation === 'rewrite');
  const publishOk = reviews.filter((r) => r.recommendation === 'publish');

  console.info('');
  console.info(`=== ${type} (${reviews.length} reviewed) ===`);
  console.info(`  Avg score:    ${avg.toFixed(1)}/100`);
  console.info(
    `  Publish-ok:   ${publishOk.length} (${((publishOk.length / reviews.length) * 100).toFixed(0)}%)`
  );
  console.info(
    `  Need rewrite: ${toRewrite.length} (${((toRewrite.length / reviews.length) * 100).toFixed(0)}%)`
  );
  console.info(
    `  Should delete: ${toDelete.length} (${((toDelete.length / reviews.length) * 100).toFixed(0)}%)`
  );

  // Main site vs microsite
  const msReviews = reviews.filter((r) => r.siteType === 'microsite');
  const mainReviews = reviews.filter((r) => r.siteType === 'main_site');
  if (msReviews.length > 0 && mainReviews.length > 0) {
    const msAvg = msReviews.reduce((a, b) => a + b.overallScore, 0) / msReviews.length;
    const mainAvg = mainReviews.reduce((a, b) => a + b.overallScore, 0) / mainReviews.length;
    console.info(`  Main sites:   ${mainAvg.toFixed(1)}/100 (${mainReviews.length} pages)`);
    console.info(`  Microsites:   ${msAvg.toFixed(1)}/100 (${msReviews.length} pages)`);
  }

  // Top issues
  const issueCounts = new Map<string, number>();
  for (const r of reviews) {
    for (const issue of r.issues) {
      const key = issue.toLowerCase().substring(0, 80);
      issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
    }
  }
  const topIssues = [...issueCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (topIssues.length > 0) {
    console.info('  Top issues:');
    for (const [issue, count] of topIssues) {
      console.info(`    [${count}x] ${issue}`);
    }
  }

  // Worst 5
  const worst = [...reviews].sort((a, b) => a.overallScore - b.overallScore).slice(0, 5);
  console.info('  Worst 5:');
  for (const w of worst) {
    console.info(
      `    ${String(w.overallScore).padStart(3)}/100 | ${w.recommendation.padEnd(7)} | ${w.title.substring(0, 55)}`
    );
    if (w.issues[0]) console.info(`            ${w.issues[0].substring(0, 70)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const deleteOnly = args.includes('--delete-only');
  const typeArg = args
    .find((a) => a.startsWith('--type='))
    ?.split('=')[1]
    ?.toUpperCase();
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limitPerType = limitArg ? parseInt(limitArg.split('=')[1] || '9999', 10) : 9999;

  const apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'];
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY or CLAUDE_API_KEY required');
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });

  const typesToReview = typeArg ? [typeArg] : ['BLOG', 'FAQ', 'LEGAL', 'CONTACT'];

  console.info('='.repeat(70));
  console.info(shouldFix ? 'CONTENT QUALITY FIX' : 'CONTENT QUALITY AUDIT (dry run)');
  console.info('='.repeat(70));
  console.info(`Types: ${typesToReview.join(', ')} | Limit/type: ${limitPerType}`);
  console.info('');

  const allReviews: Review[] = [];

  for (const type of typesToReview) {
    console.info(`--- Fetching ${type} pages ---`);

    const pages = await prisma.page.findMany({
      where: {
        type: type as any,
        status: PageStatus.PUBLISHED,
        contentId: { not: null },
      },
      include: {
        content: { select: { id: true, body: true, qualityScore: true } },
        site: { select: { id: true, name: true } },
        microsite: { select: { id: true, siteName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limitPerType,
    });

    // Filter out very short content (< 50 words)
    const eligible = pages.filter((p) => {
      const wc = (p.content?.body || '').split(/\s+/).filter(Boolean).length;
      return wc >= 50;
    });

    console.info(`  Found ${pages.length} published, ${eligible.length} with 50+ words`);

    if (eligible.length === 0) continue;

    const reviews = await reviewBatch(client, eligible, type);
    allReviews.push(...reviews);

    printTypeReport(type, reviews);
  }

  // Overall summary
  const totalDelete = allReviews.filter((r) => r.recommendation === 'delete');
  const totalRewrite = allReviews.filter((r) => r.recommendation === 'rewrite');
  const totalOk = allReviews.filter((r) => r.recommendation === 'publish');

  console.info('');
  console.info('='.repeat(70));
  console.info('OVERALL SUMMARY');
  console.info('='.repeat(70));
  console.info(`Total reviewed:  ${allReviews.length}`);
  console.info(`Publish-ok:      ${totalOk.length}`);
  console.info(`Need rewrite:    ${totalRewrite.length}`);
  console.info(`Should delete:   ${totalDelete.length}`);
  console.info('');

  if (!shouldFix) {
    console.info('Dry run complete. Re-run with --fix to apply changes.');
    await prisma.$disconnect();
    return;
  }

  // Apply fixes
  let unpublished = 0;

  if (totalDelete.length > 0) {
    console.info(`Unpublishing ${totalDelete.length} pages...`);
    for (const article of totalDelete) {
      try {
        await prisma.page.update({
          where: { id: article.pageId },
          data: { status: PageStatus.DRAFT, noIndex: true },
        });
        unpublished++;
      } catch {
        console.warn(`  Failed: ${article.pageId}`);
      }
    }
    console.info(`  Done: ${unpublished} unpublished`);
  }

  if (!deleteOnly && totalRewrite.length > 0) {
    console.info(`\nRewrite jobs should be queued separately using:`);
    console.info(`  npx ts-node scripts/fix-live-blog-quality.ts --fix --rewrite-only`);
    console.info(`(Requires Redis connection for BullMQ queue)`);
  }

  console.info('');
  console.info('='.repeat(70));
  console.info(`Unpublished: ${unpublished} | Rewrite candidates: ${totalRewrite.length}`);
  console.info('='.repeat(70));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
