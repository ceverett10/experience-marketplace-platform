/**
 * Shared utility for topic cluster internal linking.
 *
 * Finds related pages across content types (blog <-> destination <-> category <-> experience)
 * using keyword matching against titles and descriptions.
 * No new DB models — all relationships derived at render time from existing data.
 */

import { prisma } from './prisma';
import type { SiteConfig } from './tenant';
import {
  getHolibobClient,
  type ExperienceListItem,
  formatPrice,
  parseIsoDuration,
  formatDuration,
} from './holibob';

// Common stop words to exclude from keyword extraction
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'it',
  'as',
  'be',
  'was',
  'are',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'this',
  'that',
  'these',
  'those',
  'my',
  'your',
  'our',
  'their',
  'what',
  'which',
  'who',
  'how',
  'when',
  'where',
  'why',
  'not',
  'no',
  'so',
  'if',
  'about',
  'up',
  'out',
  'then',
  'than',
  'too',
  'very',
  'just',
  'also',
  'more',
  'best',
  'top',
  'guide',
  'tips',
  'things',
  'complete',
  'ultimate',
  'essential',
]);

export interface RelatedPage {
  id: string;
  slug: string;
  title: string;
  metaDescription: string | null;
  qualityScore: number | null;
  publishedAt: Date | null;
  content?: {
    body: string;
    qualityScore: number | null;
  } | null;
}

/**
 * Extract meaningful keywords from a title and optional description.
 * Strips stop words and short terms, returns lowercase unique terms.
 */
export function extractContentKeywords(title: string, description?: string | null): string[] {
  const text = [title, description ?? ''].join(' ').toLowerCase();
  const words = text
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  return [...new Set(words)];
}

/**
 * Build a URL for a page, respecting the slug prefix convention.
 *
 * BLOG: slug = 'blog/my-post' -> URL '/blog/my-post'
 * LANDING: slug = 'destinations/london' -> URL '/destinations/london'
 * FAQ: slug = 'faq/topic' -> URL '/faq/topic'
 * CATEGORY: slug = 'food-tours' (NO prefix) -> URL '/categories/food-tours'
 */
export function getPageUrl(slug: string, type: string): string {
  if (type === 'CATEGORY') {
    return `/categories/${slug}`;
  }
  return `/${slug}`;
}

/**
 * Find related pages by keyword matching against title + metaDescription.
 * Fetches a broader pool, scores in JS, returns top N by relevance.
 */
export async function getRelatedPagesByKeywords(params: {
  siteId: string;
  micrositeId?: string;
  pageType: 'BLOG' | 'LANDING' | 'CATEGORY' | 'FAQ';
  keywords: string[];
  excludePageId?: string;
  limit?: number;
}): Promise<RelatedPage[]> {
  const { siteId, micrositeId, pageType, keywords, excludePageId, limit = 3 } = params;

  if (keywords.length === 0) return [];

  try {
    const pageTypeValue: 'BLOG' | 'LANDING' | 'CATEGORY' | 'FAQ' = pageType;
    const whereClause = micrositeId
      ? { micrositeId, type: pageTypeValue, status: 'PUBLISHED' as const, noIndex: false }
      : { siteId, type: pageTypeValue, status: 'PUBLISHED' as const, noIndex: false };

    const candidates = await prisma.page.findMany({
      where: whereClause,
      include: {
        content: {
          select: { body: true, qualityScore: true },
        },
      },
      orderBy: [{ content: { qualityScore: 'desc' } }, { createdAt: 'desc' }],
      take: limit * 3,
    });

    const scored = candidates
      .filter((p) => p.id !== excludePageId)
      .map((page) => {
        let score = 0;
        const titleLower = page.title.toLowerCase();
        const descLower = (page.metaDescription || '').toLowerCase();

        for (const keyword of keywords) {
          if (titleLower.includes(keyword)) score += 3;
          if (descLower.includes(keyword)) score += 1;
        }

        if (page.content?.qualityScore && page.content.qualityScore >= 80) {
          score += 2;
        }

        return { page, score };
      })
      .filter((item) => item.score > 0);

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => ({
        id: item.page.id,
        slug: item.page.slug,
        title: item.page.title,
        metaDescription: item.page.metaDescription,
        qualityScore: item.page.content?.qualityScore ?? null,
        publishedAt: item.page.publishedAt ?? item.page.createdAt,
        content: item.page.content,
      }));
  } catch (error) {
    console.error(`Error fetching related ${pageType} pages:`, error);
    return [];
  }
}

/**
 * Fetch related experiences from Holibob for a content page (blog, FAQ, etc.).
 * Uses keywords to search via Product Discovery API.
 */
export async function getRelatedExperiencesForContent(
  site: SiteConfig,
  keywords: string[],
  limit: number = 4
): Promise<ExperienceListItem[]> {
  if (keywords.length === 0) return [];

  try {
    const client = await getHolibobClient(site);
    const searchText = keywords.slice(0, 3).join(' ');
    const filter = {
      freeText: searchText,
      currency: site.primaryCurrency ?? 'GBP',
    };

    const response = await client.discoverProducts(filter, { pageSize: limit });

    return response.products.map((product) => {
      const primaryImage =
        product.imageList?.[0]?.urlMedium ??
        product.imageList?.[0]?.url ??
        product.primaryImageUrl ??
        '/placeholder-experience.jpg';
      const priceAmount = product.guidePrice ?? product.priceFrom ?? 0;
      const priceCurrency =
        product.guidePriceCurrency ?? product.priceCurrency ?? product.currency ?? 'GBP';
      const priceFormatted =
        priceAmount > 0
          ? (product.guidePriceFormattedText ??
            product.priceFromFormatted ??
            formatPrice(priceAmount, priceCurrency))
          : 'Check price';

      let durationFormatted = '';
      if (product.durationText && !product.durationText.includes('NaN')) {
        durationFormatted = product.durationText;
      } else if (product.maxDuration != null) {
        const minutes = parseIsoDuration(product.maxDuration);
        if (minutes > 0) durationFormatted = formatDuration(minutes, 'minutes');
      }

      return {
        id: product.id,
        title: product.name ?? 'Experience',
        slug: product.id,
        shortDescription: product.shortDescription ?? '',
        imageUrl: primaryImage,
        price: { amount: priceAmount, currency: priceCurrency, formatted: priceFormatted },
        duration: { formatted: durationFormatted },
        rating: product.reviewRating
          ? { average: product.reviewRating, count: product.reviewCount ?? 0 }
          : null,
        location: { name: product.place?.name ?? product.place?.cityName ?? '' },
      };
    });
  } catch (error) {
    console.error('Error fetching related experiences for content:', error);
    return [];
  }
}
