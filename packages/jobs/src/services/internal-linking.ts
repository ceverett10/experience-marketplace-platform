/**
 * Internal Linking Service
 * Generates contextual internal links for SEO optimization
 *
 * Benefits:
 * - Improves crawlability by search engines
 * - Distributes page authority (PageRank) throughout the site
 * - Helps users discover related content
 * - Reduces bounce rate by encouraging exploration
 * - Signals topic relevance through anchor text
 */

import { prisma, PageType } from '@experience-marketplace/database';

export interface InternalLink {
  url: string;
  anchorText: string;
  title: string;
  relevanceScore: number;
  pageType: 'experience' | 'destination' | 'category' | 'blog';
}

export interface LinkSuggestion {
  links: InternalLink[];
  contentWithLinks: string;
}

/**
 * Find related pages for internal linking
 * Uses keyword matching and content type relationships
 */
export async function findRelatedPages(params: {
  siteId: string;
  contentType: 'blog' | 'destination' | 'category' | 'experience';
  keywords: string[];
  destination?: string;
  category?: string;
  excludePageId?: string;
  limit?: number;
}): Promise<InternalLink[]> {
  const { siteId, contentType, keywords: rawKeywords, destination, category, excludePageId, limit = 5 } = params;

  // Ensure keywords are valid non-empty strings before using in queries
  const keywords = rawKeywords.filter(
    (kw): kw is string => typeof kw === 'string' && kw.length > 0
  );

  const relatedLinks: InternalLink[] = [];

  try {
    // 1. Find related blog posts by keyword overlap
    if (contentType !== 'blog' && keywords.length > 0) {
      const relatedBlogs = await prisma.page.findMany({
        where: {
          siteId,
          type: PageType.BLOG,
          status: 'PUBLISHED',
          id: excludePageId ? { not: excludePageId } : undefined,
          OR: keywords.map((kw) => ({
            OR: [
              { title: { contains: kw, mode: 'insensitive' as const } },
              { metaTitle: { contains: kw, mode: 'insensitive' as const } },
              { metaDescription: { contains: kw, mode: 'insensitive' as const } },
            ],
          })),
        },
        select: {
          id: true,
          slug: true,
          title: true,
          metaDescription: true,
        },
        take: 3,
      });

      for (const blog of relatedBlogs) {
        const matchedKeywords = keywords.filter(
          (kw) =>
            blog.title?.toLowerCase().includes(kw.toLowerCase()) ||
            blog.metaDescription?.toLowerCase().includes(kw.toLowerCase())
        );

        relatedLinks.push({
          url: `/${blog.slug}`,
          anchorText: blog.title,
          title: blog.title,
          relevanceScore: matchedKeywords.length / keywords.length,
          pageType: 'blog',
        });
      }
    }

    // 2. Find related destination pages (stored as LANDING type)
    if (contentType !== 'destination' && destination) {
      const destinationPage = await prisma.page.findFirst({
        where: {
          siteId,
          type: PageType.LANDING,
          status: 'PUBLISHED',
          OR: [
            { title: { contains: destination, mode: 'insensitive' } },
            { slug: { contains: destination.toLowerCase().replace(/\s+/g, '-') } },
          ],
        },
        select: {
          id: true,
          slug: true,
          title: true,
        },
      });

      if (destinationPage) {
        relatedLinks.push({
          url: `/destinations/${destinationPage.slug}`,
          anchorText: destinationPage.title,
          title: `Explore ${destinationPage.title}`,
          relevanceScore: 0.9,
          pageType: 'destination',
        });
      }
    }

    // 3. Find related category pages
    if (contentType !== 'category' && category) {
      const categoryPage = await prisma.page.findFirst({
        where: {
          siteId,
          type: PageType.CATEGORY,
          status: 'PUBLISHED',
          OR: [
            { title: { contains: category, mode: 'insensitive' } },
            { slug: { contains: category.toLowerCase().replace(/\s+/g, '-') } },
          ],
        },
        select: {
          id: true,
          slug: true,
          title: true,
        },
      });

      if (categoryPage) {
        relatedLinks.push({
          url: `/categories/${categoryPage.slug}`,
          anchorText: categoryPage.title,
          title: `Browse ${categoryPage.title}`,
          relevanceScore: 0.85,
          pageType: 'category',
        });
      }
    }

    // 4. Find other related pages by keyword matching
    const keywordSlice = keywords.slice(0, 3);
    const otherRelated = keywordSlice.length > 0
      ? await prisma.page.findMany({
          where: {
            siteId,
            status: 'PUBLISHED',
            id: excludePageId ? { not: excludePageId } : undefined,
            type: { notIn: [PageType.BLOG] }, // Already handled above
            OR: keywordSlice.map((kw) => ({
              OR: [
                { title: { contains: kw, mode: 'insensitive' as const } },
                { metaDescription: { contains: kw, mode: 'insensitive' as const } },
              ],
            })),
          },
          select: {
            id: true,
            slug: true,
            title: true,
            type: true,
          },
          take: 3,
        })
      : [];

    for (const page of otherRelated) {
      // Skip if already added
      if (relatedLinks.some((l) => l.url.includes(page.slug))) continue;

      const pageType = (page.type || 'blog').toLowerCase() as InternalLink['pageType'];
      const urlPrefix =
        pageType === 'destination'
          ? '/destinations/'
          : pageType === 'category'
            ? '/categories/'
            : pageType === 'experience'
              ? '/experiences/'
              : '/';

      relatedLinks.push({
        url: `${urlPrefix}${page.slug}`,
        anchorText: page.title,
        title: page.title,
        relevanceScore: 0.7,
        pageType,
      });
    }

    // 5. Generate experience listing page links (blog → experience search pages)
    const experienceListingLinks = generateExperienceListingLinks({
      destination,
      category,
      keywords,
    });
    for (const link of experienceListingLinks) {
      if (!relatedLinks.some((l) => l.url === link.url)) {
        relatedLinks.push(link);
      }
    }

    // Sort by relevance and limit
    return relatedLinks.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);
  } catch (error) {
    console.error('[Internal Linking] Error finding related pages:', error);
    return [];
  }
}

/**
 * Generate internal link suggestions based on content analysis
 * Identifies good insertion points and appropriate anchor text
 */
export async function suggestInternalLinks(params: {
  siteId: string;
  content: string;
  contentType: 'blog' | 'destination' | 'category' | 'experience';
  targetKeyword: string;
  secondaryKeywords?: string[];
  destination?: string;
  category?: string;
  pageId?: string;
}): Promise<LinkSuggestion> {
  const {
    siteId,
    content,
    contentType,
    targetKeyword,
    secondaryKeywords = [],
    destination,
    category,
    pageId,
  } = params;

  // Combine keywords for searching — ensure all are non-empty strings
  const keywords = [targetKeyword, ...secondaryKeywords].filter(
    (kw): kw is string => typeof kw === 'string' && kw.length > 0
  );

  // Find related pages
  const relatedPages = await findRelatedPages({
    siteId,
    contentType,
    keywords,
    destination,
    category,
    excludePageId: pageId,
    limit: 5,
  });

  if (relatedPages.length === 0) {
    return { links: [], contentWithLinks: content };
  }

  // Insert links into content at appropriate locations
  let contentWithLinks = content;
  const insertedLinks: InternalLink[] = [];

  for (const link of relatedPages) {
    // Find a good place to insert the link
    // Look for mentions of the topic or natural insertion points
    const insertionResult = findAndInsertLink(contentWithLinks, link, insertedLinks.length);
    if (insertionResult.inserted) {
      contentWithLinks = insertionResult.content;
      insertedLinks.push(link);
    }

    // Limit to 3-5 internal links per piece of content (SEO best practice)
    if (insertedLinks.length >= 4) break;
  }

  return {
    links: insertedLinks,
    contentWithLinks,
  };
}

/**
 * Find a natural place to insert a link in the content
 * Uses contextual matching to find appropriate anchor text
 */
function findAndInsertLink(
  content: string,
  link: InternalLink,
  existingLinkCount: number
): { content: string; inserted: boolean } {
  // Extract potential anchor words from link title
  const titleWords = link.title.split(/\s+/).filter((w) => w.length > 3);

  // Try to find a matching phrase in the content that isn't already linked
  for (const word of titleWords) {
    // Case-insensitive search for the word
    const regex = new RegExp(
      `(?<!\\[)\\b(${escapeRegex(word)}(?:s|es|ing|ed)?)\\b(?!\\])(?![^\\[]*\\])`,
      'gi'
    );
    const matches = content.match(regex);

    if (matches && matches.length > 0) {
      // Pick the first unlinked occurrence after the intro paragraph
      // (avoid linking in the first paragraph)
      const introEnd = content.indexOf('\n\n');
      const searchStart = introEnd > 0 ? introEnd : 0;

      const searchContent = content.substring(searchStart);
      const matchIndex = searchContent.search(regex);

      if (matchIndex !== -1) {
        const absoluteIndex = searchStart + matchIndex;
        const matchedText = searchContent.match(regex)?.[0];

        if (matchedText) {
          // Create markdown link
          const linkedText = `[${matchedText}](${link.url})`;

          // Replace the first occurrence after intro
          const before = content.substring(0, absoluteIndex);
          const after = content.substring(absoluteIndex + matchedText.length);

          return {
            content: before + linkedText + after,
            inserted: true,
          };
        }
      }
    }
  }

  // If no natural anchor found, try to insert a "related" section at the end
  // But only if we haven't added many links already
  if (existingLinkCount < 2) {
    // Try to find a paragraph break to insert a contextual mention
    const lastParagraphBreak = content.lastIndexOf('\n\n');
    if (lastParagraphBreak > content.length / 2) {
      // Insert before the last paragraph with a contextual sentence
      const contextSentence = generateContextualSentence(link);
      const before = content.substring(0, lastParagraphBreak);
      const after = content.substring(lastParagraphBreak);

      return {
        content: before + '\n\n' + contextSentence + after,
        inserted: true,
      };
    }
  }

  return { content, inserted: false };
}

/**
 * Generate a contextual sentence that includes the link
 */
function generateContextualSentence(link: InternalLink): string {
  const templates = {
    blog: [
      `For more insights, check out our guide on [${link.anchorText}](${link.url}).`,
      `You might also enjoy reading about [${link.anchorText}](${link.url}).`,
      `Learn more in our article: [${link.anchorText}](${link.url}).`,
    ],
    destination: [
      `Discover more about [${link.anchorText}](${link.url}) and what it has to offer.`,
      `Planning a trip? Explore [${link.anchorText}](${link.url}).`,
      `See all experiences available in [${link.anchorText}](${link.url}).`,
    ],
    category: [
      `Browse our full selection of [${link.anchorText}](${link.url}).`,
      `Interested in similar activities? Check out [${link.anchorText}](${link.url}).`,
      `Explore more options in [${link.anchorText}](${link.url}).`,
    ],
    experience: [
      `Ready to book? Browse [${link.anchorText}](${link.url}) and find the perfect activity.`,
      `Looking for something to do? Explore [${link.anchorText}](${link.url}).`,
      `Find and book [${link.anchorText}](${link.url}) for your next trip.`,
    ],
  };

  const typeTemplates = templates[link.pageType] || templates.blog;
  const randomIndex = Math.floor(Math.random() * typeTemplates.length);
  return typeTemplates[randomIndex] || `Learn more about [${link.anchorText}](${link.url}).`;
}

/**
 * Generate links to experience listing pages
 * Creates links from blog content to filtered experience search results
 */
function generateExperienceListingLinks(params: {
  destination?: string;
  category?: string;
  keywords: string[];
}): InternalLink[] {
  const { destination, category, keywords } = params;
  const links: InternalLink[] = [];

  // Link to destination experience listing
  if (destination) {
    links.push({
      url: `/experiences?destination=${encodeURIComponent(destination)}`,
      anchorText: `things to do in ${destination}`,
      title: `Explore experiences in ${destination}`,
      relevanceScore: 0.88,
      pageType: 'experience',
    });

    // Combined destination + category link
    if (category) {
      links.push({
        url: `/experiences?destination=${encodeURIComponent(destination)}&q=${encodeURIComponent(category)}`,
        anchorText: `${category.toLowerCase()} in ${destination}`,
        title: `${category} experiences in ${destination}`,
        relevanceScore: 0.92,
        pageType: 'experience',
      });
    }
  }

  // Link to category experience listing
  if (category) {
    links.push({
      url: `/experiences?q=${encodeURIComponent(category)}`,
      anchorText: `${category.toLowerCase()} experiences`,
      title: `Browse ${category} experiences`,
      relevanceScore: 0.85,
      pageType: 'experience',
    });
  }

  // Generate links from significant keywords (filter out non-string/empty values)
  const validKeywords = keywords.filter(
    (kw): kw is string => typeof kw === 'string' && kw.length > 4
  );
  for (const keyword of validKeywords.slice(0, 2)) {
    if (keyword !== destination && keyword !== category) {
      links.push({
        url: `/experiences?q=${encodeURIComponent(keyword)}`,
        anchorText: `${keyword.toLowerCase()} experiences`,
        title: `Search ${keyword} experiences`,
        relevanceScore: 0.75,
        pageType: 'experience',
      });
    }
  }

  return links;
}

/**
 * Escape special regex characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Analyze existing content for internal linking opportunities
 * Returns suggestions for improving internal link structure
 */
export async function analyzeInternalLinkOpportunities(siteId: string): Promise<{
  pagesNeedingLinks: Array<{
    pageId: string;
    pageTitle: string;
    currentLinkCount: number;
    suggestedLinks: InternalLink[];
  }>;
  orphanPages: Array<{
    pageId: string;
    pageTitle: string;
    pageType: string;
  }>;
}> {
  try {
    // Find pages with few or no internal links pointing to them
    const allPages = await prisma.page.findMany({
      where: {
        siteId,
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        title: true,
        slug: true,
        type: true,
        content: {
          select: {
            body: true,
          },
        },
      },
    });

    const pagesNeedingLinks: Array<{
      pageId: string;
      pageTitle: string;
      currentLinkCount: number;
      suggestedLinks: InternalLink[];
    }> = [];

    const orphanPages: Array<{
      pageId: string;
      pageTitle: string;
      pageType: string;
    }> = [];

    // Analyze each page
    for (const page of allPages) {
      const content = page.content?.body || '';

      // Count internal links in content
      const internalLinkPattern = /\[([^\]]+)\]\(\/[^)]+\)/g;
      const internalLinks = content.match(internalLinkPattern) || [];

      if (internalLinks.length < 2) {
        // This page needs more internal links
        const keywords = extractKeywordsFromContent(content, page.title);
        const suggestedLinks = await findRelatedPages({
          siteId,
          contentType: (page.type || 'blog').toLowerCase() as
            | 'blog'
            | 'destination'
            | 'category'
            | 'experience',
          keywords,
          excludePageId: page.id,
          limit: 3,
        });

        if (suggestedLinks.length > 0) {
          pagesNeedingLinks.push({
            pageId: page.id,
            pageTitle: page.title,
            currentLinkCount: internalLinks.length,
            suggestedLinks,
          });
        }
      }

      // Check if any other page links to this one (orphan detection)
      let hasIncomingLinks = false;
      for (const otherPage of allPages) {
        if (otherPage.id === page.id) continue;
        const otherContent = otherPage.content?.body || '';
        if (otherContent.includes(`(/${page.slug})`) || otherContent.includes(`/${page.slug})`)) {
          hasIncomingLinks = true;
          break;
        }
      }

      if (!hasIncomingLinks && page.type !== PageType.HOMEPAGE) {
        orphanPages.push({
          pageId: page.id,
          pageTitle: page.title,
          pageType: page.type,
        });
      }
    }

    return { pagesNeedingLinks, orphanPages };
  } catch (error) {
    console.error('[Internal Linking] Error analyzing opportunities:', error);
    return { pagesNeedingLinks: [], orphanPages: [] };
  }
}

/**
 * Extract keywords from content for linking analysis
 */
function extractKeywordsFromContent(content: string, title: string): string[] {
  // Start with title words
  const keywords: string[] = title
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map((w) => w.toLowerCase());

  // Extract potential keywords from headers
  const headerPattern = /^#{1,3}\s+(.+)$/gm;
  let match;
  while ((match = headerPattern.exec(content)) !== null) {
    const headerText = match[1];
    if (headerText) {
      const headerWords = headerText.split(/\s+/).filter((w) => w.length > 3);
      keywords.push(...headerWords.map((w) => w.toLowerCase()));
    }
  }

  // Remove duplicates and common words
  const commonWords = new Set([
    'the',
    'and',
    'for',
    'are',
    'but',
    'not',
    'you',
    'all',
    'can',
    'her',
    'was',
    'one',
    'our',
    'out',
    'with',
    'this',
    'that',
    'have',
    'from',
    'they',
    'been',
    'will',
    'more',
    'when',
    'what',
    'your',
    'which',
    'their',
    'about',
    'would',
    'there',
    'could',
    'other',
  ]);

  return [...new Set(keywords)].filter((w) => !commonWords.has(w)).slice(0, 10);
}
