/**
 * Cross-Site Linking Service
 * Injects contextual links to related microsites in blog content.
 *
 * Quality safeguards:
 * - Only links between microsites sharing city OR category (relevance score >= 2)
 * - Only links to PUBLISHED pages with body content > 500 chars
 * - Max 2-3 cross-site links per blog post
 * - Descriptive anchor text (never generic "click here")
 * - One-directional per page (no reciprocal link farms)
 */

import { prisma } from '@experience-marketplace/database';

export interface CrossSiteLink {
  targetUrl: string;
  targetDomain: string;
  targetSiteName: string;
  anchorText: string;
  relevanceScore: number;
}

export interface CrossSiteLinkResult {
  links: CrossSiteLink[];
  contentWithLinks: string;
}

/**
 * Find relevant pages on related microsites and inject contextual links into blog content.
 */
export async function suggestCrossSiteLinks(params: {
  micrositeId: string;
  content: string;
  targetKeyword: string;
  secondaryKeywords?: string[];
  destination?: string;
  category?: string;
  maxLinks?: number;
}): Promise<CrossSiteLinkResult> {
  const {
    micrositeId,
    content,
    targetKeyword,
    secondaryKeywords = [],
    destination,
    category,
    maxLinks = 2,
  } = params;

  try {
    // 1. Get the current microsite's context (cities, categories)
    const currentMicrosite = await prisma.micrositeConfig.findUnique({
      where: { id: micrositeId },
      include: {
        supplier: {
          select: { cities: true, categories: true },
        },
      },
    });

    if (!currentMicrosite?.supplier) {
      return { links: [], contentWithLinks: content };
    }

    const myCities = (currentMicrosite.supplier.cities as string[]) || [];
    const myCategories = (currentMicrosite.supplier.categories as string[]) || [];

    if (myCities.length === 0 && myCategories.length === 0) {
      return { links: [], contentWithLinks: content };
    }

    // 2. Find related microsites with relevance scoring
    const candidates = await prisma.micrositeConfig.findMany({
      where: {
        id: { not: micrositeId },
        status: 'ACTIVE',
        cachedProductCount: { gt: 0 },
      },
      include: {
        supplier: {
          select: { cities: true, categories: true },
        },
      },
      take: 30,
    });

    const citySet = new Set(myCities.map((c) => c.toLowerCase()));
    const categorySet = new Set(myCategories.map((c) => c.toLowerCase()));

    // Score and filter by relevance (minimum score 2 = at least one shared category)
    const relatedMicrosites = candidates
      .map((ms) => {
        const msCities = (ms.supplier?.cities as string[]) || [];
        const msCategories = (ms.supplier?.categories as string[]) || [];
        const sharedCities = msCities.filter((c) => citySet.has(c.toLowerCase())).length;
        const sharedCategories = msCategories.filter((c) => categorySet.has(c.toLowerCase())).length;
        const score = sharedCities * 3 + sharedCategories * 2;
        return { ms, score };
      })
      .filter((item) => item.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (relatedMicrosites.length === 0) {
      return { links: [], contentWithLinks: content };
    }

    // 3. Find PUBLISHED blog pages on related microsites that match our keywords
    const relatedMicrositeIds = relatedMicrosites.map((r) => r.ms.id);
    const keywords = [targetKeyword, ...secondaryKeywords].filter(
      (kw): kw is string => typeof kw === 'string' && kw.length > 0
    );

    // Build keyword search conditions
    const keywordConditions = keywords.slice(0, 5).map((kw) => ({
      OR: [
        { title: { contains: kw, mode: 'insensitive' as const } },
        { metaDescription: { contains: kw, mode: 'insensitive' as const } },
      ],
    }));

    // Also match by destination/category in page title
    const locationConditions = [];
    if (destination) {
      locationConditions.push({
        title: { contains: destination, mode: 'insensitive' as const },
      });
    }
    if (category) {
      locationConditions.push({
        title: { contains: category, mode: 'insensitive' as const },
      });
    }

    const allConditions = [...keywordConditions, ...locationConditions];
    if (allConditions.length === 0) {
      return { links: [], contentWithLinks: content };
    }

    const candidatePages = await prisma.page.findMany({
      where: {
        micrositeId: { in: relatedMicrositeIds },
        type: 'BLOG',
        status: 'PUBLISHED',
        contentId: { not: null },
        OR: allConditions,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        micrositeId: true,
        contentId: true,
      },
      take: 20,
    });

    // 4. Fetch content bodies and filter by quality (body > 500 chars)
    const contentIds = candidatePages
      .map((p) => p.contentId)
      .filter((id): id is string => id !== null);

    const contents = contentIds.length > 0
      ? await prisma.content.findMany({
          where: { id: { in: contentIds } },
          select: { id: true, body: true },
        })
      : [];
    const contentMap = new Map(contents.map((c) => [c.id, c.body]));

    const micrositeMap = new Map(relatedMicrosites.map((r) => [r.ms.id, r]));

    const scoredPages = candidatePages
      .filter((page) => (contentMap.get(page.contentId || '')?.length || 0) > 500)
      .map((page) => {
        const msInfo = micrositeMap.get(page.micrositeId || '');
        const ms = msInfo?.ms;
        if (!ms) return null;

        // Score by keyword match count in title
        const matchedKeywords = keywords.filter((kw) =>
          page.title.toLowerCase().includes(kw.toLowerCase())
        );
        const keywordScore = matchedKeywords.length / Math.max(keywords.length, 1);
        const totalScore = (msInfo.score / 10) + keywordScore;

        return {
          page,
          ms,
          relevanceScore: totalScore,
          matchedKeywords,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxLinks * 2); // Get extra candidates in case some can't be inserted

    if (scoredPages.length === 0) {
      return { links: [], contentWithLinks: content };
    }

    // 5. Insert links into content at natural positions
    let contentWithLinks = content;
    const insertedLinks: CrossSiteLink[] = [];
    const usedDomains = new Set<string>(); // One link per domain max

    for (const item of scoredPages) {
      if (insertedLinks.length >= maxLinks) break;
      if (usedDomains.has(item.ms.fullDomain)) continue;

      const targetUrl = `https://${item.ms.fullDomain}/${item.page.slug}`;

      // Find natural anchor text from the page title words
      const insertResult = findAndInsertCrossSiteLink(
        contentWithLinks,
        {
          url: targetUrl,
          title: item.page.title,
          siteName: item.ms.siteName,
        },
        insertedLinks.length
      );

      if (insertResult.inserted) {
        contentWithLinks = insertResult.content;
        insertedLinks.push({
          targetUrl,
          targetDomain: item.ms.fullDomain,
          targetSiteName: item.ms.siteName,
          anchorText: insertResult.anchorText,
          relevanceScore: item.relevanceScore,
        });
        usedDomains.add(item.ms.fullDomain);
      }
    }

    if (insertedLinks.length > 0) {
      console.log(
        `[Cross-Site Linking] Injected ${insertedLinks.length} cross-site links: ${insertedLinks
          .map((l) => `${l.targetDomain} (${l.anchorText})`)
          .join(', ')}`
      );
    }

    return { links: insertedLinks, contentWithLinks };
  } catch (error) {
    console.error('[Cross-Site Linking] Error:', error);
    return { links: [], contentWithLinks: content };
  }
}

/**
 * Find a natural insertion point for a cross-site link.
 * Uses title word matching to find contextual anchor text.
 */
function findAndInsertCrossSiteLink(
  content: string,
  link: { url: string; title: string; siteName: string },
  existingLinkCount: number
): { content: string; inserted: boolean; anchorText: string } {
  // Extract significant words from the target page title for anchor matching
  const titleWords = link.title
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map((w) => w.replace(/[^a-zA-Z]/g, ''))
    .filter((w) => w.length > 3);

  // Try to find matching phrases in the content body (not in existing links)
  for (const word of titleWords) {
    const regex = new RegExp(
      `(?<!\\[)\\b(${escapeRegex(word)}(?:s|es|ing|ed)?)\\b(?!\\])(?![^\\[]*\\])`,
      'gi'
    );

    // Skip the intro paragraph
    const introEnd = content.indexOf('\n\n');
    const searchStart = introEnd > 0 ? introEnd : 0;
    const searchContent = content.substring(searchStart);
    const matchIndex = searchContent.search(regex);

    if (matchIndex !== -1) {
      const absoluteIndex = searchStart + matchIndex;
      const matchedText = searchContent.match(regex)?.[0];

      if (matchedText) {
        const linkedText = `[${matchedText}](${link.url})`;
        const before = content.substring(0, absoluteIndex);
        const after = content.substring(absoluteIndex + matchedText.length);

        return {
          content: before + linkedText + after,
          inserted: true,
          anchorText: matchedText,
        };
      }
    }
  }

  // Fallback: add a contextual sentence if we haven't added many links
  if (existingLinkCount < 1) {
    const lastParagraphBreak = content.lastIndexOf('\n\n');
    if (lastParagraphBreak > content.length / 2) {
      const contextSentence = generateCrossSiteContextSentence(link);
      const before = content.substring(0, lastParagraphBreak);
      const after = content.substring(lastParagraphBreak);
      const anchorText = link.title;

      return {
        content: before + '\n\n' + contextSentence + after,
        inserted: true,
        anchorText,
      };
    }
  }

  return { content, inserted: false, anchorText: '' };
}

/**
 * Generate a contextual sentence for cross-site link insertion.
 */
function generateCrossSiteContextSentence(link: { url: string; title: string; siteName: string }): string {
  const templates = [
    `For a different perspective, explore [${link.title}](${link.url}) from ${link.siteName}.`,
    `You may also find [${link.title}](${link.url}) on ${link.siteName} helpful for planning your trip.`,
    `Travellers also recommend [${link.title}](${link.url}) by ${link.siteName} for related experiences.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)] || templates[0]!;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
