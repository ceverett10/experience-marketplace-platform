/**
 * Cross-Site Link Enrichment Service
 * Batch-processes existing blog posts to inject cross-site links where missing.
 *
 * Processes 5% of microsites per day for full coverage in ~20 days.
 * Only injects links into posts that have fewer than 2 cross-site links.
 *
 * Quality safeguards:
 * - Same relevance scoring as cross-site-linking.ts (city +3, category +2, min score 2)
 * - Only targets PUBLISHED pages with content > 500 chars
 * - Max 2 cross-site links per blog post
 * - Descriptive anchor text, no generic phrases
 */

import { prisma } from '@experience-marketplace/database';
import { suggestCrossSiteLinks } from './cross-site-linking';

export interface EnrichmentResult {
  micrositesProcessed: number;
  blogsScanned: number;
  blogsEnriched: number;
  linksAdded: number;
  errors: number;
}

/**
 * Count existing cross-site links in content (links to other *.experiencess.com subdomains)
 */
function countCrossSiteLinks(content: string): number {
  // Match markdown links pointing to external experiencess.com subdomains
  const crossSiteLinkPattern = /\[([^\]]+)\]\(https?:\/\/[a-z0-9-]+\.experiencess\.com[^)]*\)/gi;
  const matches = content.match(crossSiteLinkPattern);
  return matches?.length || 0;
}

/**
 * Extract keywords from a blog page title for cross-site link matching
 */
function extractKeywordsFromTitle(title: string): string[] {
  const commonWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
    'was', 'one', 'our', 'out', 'with', 'this', 'that', 'have', 'from',
    'they', 'been', 'will', 'more', 'when', 'what', 'your', 'which',
    'their', 'about', 'would', 'there', 'could', 'other', 'best', 'top',
    'ultimate', 'complete', 'guide', 'things',
  ]);

  return title
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^a-z]/g, ''))
    .filter((w) => w.length > 3 && !commonWords.has(w));
}

/**
 * Run batch enrichment: process a percentage of microsites, scan their blogs,
 * and inject cross-site links where < 2 exist.
 */
export async function runCrossSiteLinkEnrichment(
  percentagePerRun: number = 5
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    micrositesProcessed: 0,
    blogsScanned: 0,
    blogsEnriched: 0,
    linksAdded: 0,
    errors: 0,
  };

  try {
    // Get all active microsites
    const totalMicrosites = await prisma.micrositeConfig.count({
      where: { status: 'ACTIVE', cachedProductCount: { gt: 0 } },
    });

    if (totalMicrosites === 0) {
      console.log('[Cross-Site Enrichment] No active microsites found');
      return result;
    }

    // Process a percentage per run (rotate through all microsites over time)
    const batchSize = Math.max(1, Math.ceil(totalMicrosites * (percentagePerRun / 100)));

    // Use a deterministic offset based on the day of year for rotation
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );
    const offset = (dayOfYear * batchSize) % totalMicrosites;

    const microsites = await prisma.micrositeConfig.findMany({
      where: { status: 'ACTIVE', cachedProductCount: { gt: 0 } },
      include: {
        supplier: {
          select: { cities: true, categories: true },
        },
      },
      skip: offset,
      take: batchSize,
      orderBy: { id: 'asc' },
    });

    console.log(
      `[Cross-Site Enrichment] Processing ${microsites.length}/${totalMicrosites} microsites (offset ${offset})`
    );

    for (const microsite of microsites) {
      try {
        // Find blog pages for this microsite with content
        const blogPages = await prisma.page.findMany({
          where: {
            micrositeId: microsite.id,
            type: 'BLOG',
            status: 'PUBLISHED',
            contentId: { not: null },
          },
          select: {
            id: true,
            title: true,
            slug: true,
            contentId: true,
          },
          take: 20,
        });

        for (const page of blogPages) {
          result.blogsScanned++;

          if (!page.contentId) continue;

          // Fetch the content body
          const content = await prisma.content.findUnique({
            where: { id: page.contentId },
            select: { id: true, body: true },
          });

          if (!content?.body || content.body.length < 500) continue;

          // Count existing cross-site links
          const existingCrossSiteLinks = countCrossSiteLinks(content.body);

          if (existingCrossSiteLinks >= 2) continue; // Already has enough

          // Inject cross-site links
          const keywords = extractKeywordsFromTitle(page.title);
          const targetKeyword = keywords[0] || page.title;
          const maxNewLinks = 2 - existingCrossSiteLinks;

          const linkResult = await suggestCrossSiteLinks({
            micrositeId: microsite.id,
            content: content.body,
            targetKeyword,
            secondaryKeywords: keywords.slice(1),
            maxLinks: maxNewLinks,
          });

          if (linkResult.links.length > 0) {
            // Update the content in the database
            await prisma.content.update({
              where: { id: content.id },
              data: { body: linkResult.contentWithLinks },
            });

            result.blogsEnriched++;
            result.linksAdded += linkResult.links.length;

            console.log(
              `[Cross-Site Enrichment] Enriched "${page.title}" with ${linkResult.links.length} cross-site links`
            );
          }
        }

        result.micrositesProcessed++;
      } catch (err) {
        result.errors++;
        console.error(
          `[Cross-Site Enrichment] Error processing microsite ${microsite.id}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    console.log(
      `[Cross-Site Enrichment] Done: ${result.micrositesProcessed} microsites, ${result.blogsScanned} blogs scanned, ${result.blogsEnriched} enriched, ${result.linksAdded} links added`
    );

    return result;
  } catch (error) {
    console.error('[Cross-Site Enrichment] Fatal error:', error);
    result.errors++;
    return result;
  }
}
