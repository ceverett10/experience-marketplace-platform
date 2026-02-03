/**
 * SEO Optimization Service
 * Automatically fixes common SEO issues on sites
 */

import { prisma, PageType } from '@experience-marketplace/database';

export interface SEOOptimization {
  pageId: string;
  changes: string[];
  before: {
    metaTitle?: string;
    metaDescription?: string;
    priority?: number;
  };
  after: {
    metaTitle?: string;
    metaDescription?: string;
    priority?: number;
  };
}

/**
 * Auto-fix common SEO issues for a site
 */
export async function autoOptimizeSiteSEO(siteId: string): Promise<SEOOptimization[]> {
  const optimizations: SEOOptimization[] = [];

  const pages = await prisma.page.findMany({
    where: {
      siteId,
      status: 'PUBLISHED',
    },
    include: {
      content: true,
    },
  });

  for (const page of pages) {
    const changes: string[] = [];
    const before = {
      metaTitle: page.metaTitle || undefined,
      metaDescription: page.metaDescription || undefined,
      priority: page.priority || undefined,
    };
    const after = { ...before };

    // Fix 1: Missing or poor meta titles
    if (!page.metaTitle) {
      after.metaTitle = generateOptimalMetaTitle(page.title, page.type);
      changes.push('Generated meta title');
    } else if (page.metaTitle.length < 30 || page.metaTitle.length > 60) {
      after.metaTitle = optimizeMetaTitleLength(page.metaTitle, page.title);
      changes.push('Optimized meta title length');
    }

    // Fix 2: Missing or poor meta descriptions
    if (!page.metaDescription) {
      after.metaDescription = generateOptimalMetaDescription(page.content?.body || '', page.type);
      changes.push('Generated meta description');
    } else if (page.metaDescription.length < 120 || page.metaDescription.length > 160) {
      after.metaDescription = optimizeMetaDescriptionLength(page.metaDescription);
      changes.push('Optimized meta description length');
    }

    // Fix 3: Set appropriate sitemap priority
    if (!page.priority || page.priority < 0.3) {
      after.priority = calculateOptimalPriority(page.type, page.slug);
      changes.push('Set sitemap priority');
    }

    // Apply changes if any were made
    if (changes.length > 0) {
      await prisma.page.update({
        where: { id: page.id },
        data: {
          metaTitle: after.metaTitle,
          metaDescription: after.metaDescription,
          priority: after.priority,
        },
      });

      optimizations.push({
        pageId: page.id,
        changes,
        before,
        after,
      });
    }
  }

  return optimizations;
}

/**
 * Generate optimal meta title from page title
 */
function generateOptimalMetaTitle(title: string, pageType: PageType): string {
  // Target: 50-60 characters
  let metaTitle = title;

  // Add type-specific keywords
  if (pageType === PageType.BLOG) {
    metaTitle = `${title} - Guide`;
  } else if (pageType === PageType.CATEGORY) {
    metaTitle = `${title} - Experiences & Tours`;
  } else if (pageType === PageType.LANDING) {
    metaTitle = `Things to Do - ${title}`;
  }

  // Trim if too long
  if (metaTitle.length > 60) {
    metaTitle = metaTitle.substring(0, 57) + '...';
  }

  return metaTitle;
}

/**
 * Optimize existing meta title to ideal length
 */
function optimizeMetaTitleLength(currentTitle: string, fallbackTitle: string): string {
  if (currentTitle.length >= 50 && currentTitle.length <= 60) {
    return currentTitle;
  }

  // Too short - try to expand
  if (currentTitle.length < 50) {
    // Add year for blog posts to make them more current
    if (!currentTitle.includes('2026') && !currentTitle.includes('2025')) {
      const expanded = `${currentTitle} (2026)`;
      if (expanded.length <= 60) {
        return expanded;
      }
    }
    return currentTitle;
  }

  // Too long - trim intelligently
  // Remove common filler words from the end first
  let optimized = currentTitle
    .replace(/ - [^-]+$/, '') // Remove " - suffix"
    .replace(/ \| [^|]+$/, ''); // Remove " | suffix"

  if (optimized.length > 60) {
    optimized = optimized.substring(0, 57) + '...';
  }

  return optimized;
}

/**
 * Generate optimal meta description from content
 */
function generateOptimalMetaDescription(content: string, pageType: PageType): string {
  // Target: 150-160 characters
  const plainText = content
    .replace(/#{1,6}\s/g, '') // Remove markdown headers
    .replace(/\*\*/g, '') // Remove bold markdown
    .replace(/\*/g, '') // Remove italic markdown
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();

  let description = plainText.substring(0, 160);

  // Try to end at a sentence
  const lastPeriod = description.lastIndexOf('.');
  const lastExclamation = description.lastIndexOf('!');
  const lastQuestion = description.lastIndexOf('?');
  const lastSentence = Math.max(lastPeriod, lastExclamation, lastQuestion);

  if (lastSentence > 120) {
    description = description.substring(0, lastSentence + 1);
  } else if (description.length >= 160) {
    // End at last complete word
    const lastSpace = description.lastIndexOf(' ');
    if (lastSpace > 120) {
      description = description.substring(0, lastSpace) + '...';
    }
  }

  // Add call-to-action if space allows
  if (description.length < 140) {
    if (pageType === PageType.BLOG) {
      description += ' Read more.';
    } else if (pageType === PageType.CATEGORY || pageType === PageType.LANDING) {
      description += ' Book now.';
    }
  }

  return description;
}

/**
 * Optimize existing meta description to ideal length
 */
function optimizeMetaDescriptionLength(currentDescription: string): string {
  if (currentDescription.length >= 150 && currentDescription.length <= 160) {
    return currentDescription;
  }

  // Too short - try to expand with call-to-action
  if (currentDescription.length < 150) {
    const additions = [
      ' Book with instant confirmation.',
      ' Free cancellation available.',
      ' Read more about this topic.',
      ' Discover more information.',
    ];

    for (const addition of additions) {
      const expanded = currentDescription + addition;
      if (expanded.length >= 150 && expanded.length <= 160) {
        return expanded;
      }
    }

    return currentDescription;
  }

  // Too long - trim intelligently
  const trimmed = currentDescription.substring(0, 157);
  const lastSpace = trimmed.lastIndexOf(' ');
  return trimmed.substring(0, lastSpace) + '...';
}

/**
 * Calculate optimal sitemap priority based on page type and importance
 */
function calculateOptimalPriority(pageType: PageType, slug: string): number {
  // Homepage gets highest priority
  if (slug === '' || slug === 'home') {
    return 1.0;
  }

  // Important pages get high priority
  switch (pageType) {
    case PageType.HOMEPAGE:
      return 1.0;
    case PageType.LANDING:
      return 0.9;
    case PageType.CATEGORY:
      return 0.8;
    case PageType.PRODUCT:
      return 0.7;
    case PageType.BLOG:
      return 0.6;
    case PageType.ABOUT:
    case PageType.CONTACT:
    case PageType.FAQ:
      return 0.7;
    case PageType.LEGAL:
      return 0.4;
    default:
      return 0.5;
  }
}

/**
 * Add missing structured data to pages
 */
export async function addMissingStructuredData(siteId: string): Promise<number> {
  let updatedCount = 0;

  const pages = await prisma.page.findMany({
    where: {
      siteId,
      status: 'PUBLISHED',
    },
    include: {
      content: true,
      site: true,
    },
  });

  for (const page of pages) {
    const hasStructuredData =
      page.content?.structuredData && Object.keys(page.content.structuredData as object).length > 0;

    if (!hasStructuredData && page.content) {
      let structuredData: object | null = null;

      // Generate appropriate structured data based on page type
      switch (page.type) {
        case PageType.BLOG:
          structuredData = {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: page.title,
            description: page.metaDescription || '',
            datePublished: page.publishedAt?.toISOString(),
            dateModified: page.updatedAt.toISOString(),
            author: {
              '@type': 'Organization',
              name: page.site?.name,
            },
          };
          break;

        case PageType.CATEGORY:
          structuredData = {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: page.title,
            description: page.metaDescription || '',
          };
          break;

        case PageType.LANDING:
          structuredData = {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: page.title,
            description: page.metaDescription || '',
          };
          break;
      }

      if (structuredData && page.content?.id) {
        await prisma.content.update({
          where: { id: page.content.id },
          data: { structuredData },
        });
        updatedCount++;
      }
    }
  }

  return updatedCount;
}

/**
 * Improve thin content by expanding it
 */
export async function flagThinContentForExpansion(
  siteId: string
): Promise<Array<{ pageId: string; wordCount: number; minWords: number }>> {
  const thinPages: Array<{ pageId: string; wordCount: number; minWords: number }> = [];

  const pages = await prisma.page.findMany({
    where: {
      siteId,
      status: 'PUBLISHED',
    },
    include: {
      content: true,
    },
  });

  for (const page of pages) {
    const contentBody = page.content?.body || '';
    const wordCount = contentBody.split(/\s+/).length;
    const minWords = page.type === PageType.BLOG ? 800 : 300;

    if (wordCount < minWords) {
      thinPages.push({
        pageId: page.id,
        wordCount,
        minWords,
      });
    }
  }

  return thinPages;
}
