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

// ============================================================================
// ENHANCED SEO OPTIMIZATIONS
// ============================================================================

/**
 * Power words that improve click-through rates in titles
 */
const POWER_WORDS = ['Best', 'Top', 'Ultimate', 'Complete', 'Essential', 'Amazing'];

/**
 * Enhanced title generation with power words and current year for CTR optimization
 */
export function generateCTROptimizedTitle(
  title: string,
  pageType: PageType,
  options: { addYear?: boolean; addPowerWord?: boolean } = {}
): string {
  const currentYear = new Date().getFullYear();
  const { addYear = true, addPowerWord = true } = options;

  let metaTitle = title;

  // Check if title already has a power word
  const hasPowerWord = POWER_WORDS.some((pw) =>
    title.toLowerCase().startsWith(pw.toLowerCase())
  );

  // Add power word prefix for category/landing pages if not present
  if (
    addPowerWord &&
    !hasPowerWord &&
    (pageType === PageType.CATEGORY || pageType === PageType.LANDING)
  ) {
    metaTitle = `Best ${metaTitle}`;
  }

  // Add year for blog posts to signal freshness
  const hasYear = /20\d{2}/.test(metaTitle);
  if (addYear && pageType === PageType.BLOG && !hasYear) {
    // Check if we have room for the year
    if (metaTitle.length + 7 <= 60) {
      // " (2026)" = 7 chars
      metaTitle = `${metaTitle} (${currentYear})`;
    }
  }

  // Add type-specific suffixes if we have room
  if (metaTitle.length < 45) {
    if (pageType === PageType.BLOG && !metaTitle.toLowerCase().includes('guide')) {
      metaTitle = `${metaTitle} - Guide`;
    } else if (pageType === PageType.CATEGORY) {
      metaTitle = `${metaTitle} - Tours & Activities`;
    } else if (pageType === PageType.LANDING) {
      metaTitle = `${metaTitle} - Book Online`;
    }
  }

  // Ensure target length 50-60 chars
  if (metaTitle.length > 60) {
    metaTitle = metaTitle.substring(0, 57) + '...';
  }

  return metaTitle;
}

/**
 * Update content freshness by updating dates in content that reference outdated years
 */
export async function updateContentFreshness(siteId: string): Promise<{
  updatedCount: number;
  updates: Array<{ pageId: string; title: string; reason: string }>;
}> {
  const currentYear = new Date().getFullYear();
  const updates: Array<{ pageId: string; title: string; reason: string }> = [];

  const pages = await prisma.page.findMany({
    where: {
      siteId,
      status: 'PUBLISHED',
      type: PageType.BLOG,
    },
    include: { content: true },
  });

  for (const page of pages) {
    const body = page.content?.body || '';
    const title = page.metaTitle || page.title;

    // Check for outdated years (2020-2024 for a 2026 current year, etc.)
    const outdatedYears: number[] = [];
    for (let year = 2020; year < currentYear; year++) {
      if (body.includes(String(year)) || title.includes(String(year))) {
        outdatedYears.push(year);
      }
    }

    if (outdatedYears.length > 0) {
      // Update the page's updatedAt to signal freshness to search engines
      await prisma.page.update({
        where: { id: page.id },
        data: { updatedAt: new Date() },
      });

      updates.push({
        pageId: page.id,
        title: page.title,
        reason: `Contains outdated year references: ${outdatedYears.join(', ')}`,
      });
    }
  }

  return {
    updatedCount: updates.length,
    updates,
  };
}

/**
 * Keyword optimization analysis result
 */
export interface KeywordOptimization {
  pageId: string;
  pageTitle: string;
  keyword: string;
  currentDensity: number;
  targetDensity: number;
  inFirstParagraph: boolean;
  inH1: boolean;
  recommendations: string[];
}

/**
 * Analyze keyword optimization for all pages in a site
 * Returns recommendations for pages that need keyword improvements
 */
export async function analyzeKeywordOptimization(
  siteId: string
): Promise<KeywordOptimization[]> {
  const optimizations: KeywordOptimization[] = [];

  const pages = await prisma.page.findMany({
    where: { siteId, status: 'PUBLISHED' },
    include: { content: true },
  });

  for (const page of pages) {
    const content = page.content?.body || '';
    const keyword = extractPrimaryKeyword(page.title, page.metaTitle);

    if (!keyword || keyword.length < 3) continue;

    const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
    if (wordCount < 100) continue; // Skip very short content

    // Count keyword occurrences (case-insensitive, whole word)
    const keywordRegex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
    const matches = content.match(keywordRegex) || [];
    const keywordCount = matches.length;
    const density = (keywordCount / wordCount) * 100;

    // Check if keyword is in first 100 words
    const first100Words = content.split(/\s+/).slice(0, 100).join(' ');
    const inFirstParagraph = keywordRegex.test(first100Words);

    // Check if keyword is in H1/first heading
    const h1Match = content.match(/^#\s+(.+)$/m);
    const inH1 = h1Match && h1Match[1] ? keywordRegex.test(h1Match[1]) : false;

    const recommendations: string[] = [];

    if (!inFirstParagraph) {
      recommendations.push('Add primary keyword to first paragraph (within first 100 words)');
    }

    if (!inH1 && page.type === PageType.BLOG) {
      recommendations.push('Include primary keyword in the main heading (H1)');
    }

    if (density < 0.5) {
      recommendations.push(
        `Keyword density is very low (${density.toFixed(1)}%). Consider adding more natural mentions of "${keyword}"`
      );
    } else if (density < 1) {
      recommendations.push(
        `Keyword density is slightly low (${density.toFixed(1)}%). Target 1-2% for optimal SEO`
      );
    } else if (density > 3) {
      recommendations.push(
        `Keyword density is high (${density.toFixed(1)}%). Consider reducing to avoid keyword stuffing penalty`
      );
    }

    if (recommendations.length > 0) {
      optimizations.push({
        pageId: page.id,
        pageTitle: page.title,
        keyword,
        currentDensity: Math.round(density * 100) / 100,
        targetDensity: 1.5,
        inFirstParagraph,
        inH1,
        recommendations,
      });
    }
  }

  return optimizations;
}

/**
 * Extract primary keyword from page title
 */
function extractPrimaryKeyword(title: string, metaTitle?: string | null): string {
  const source = metaTitle || title;

  // Remove common suffixes and patterns
  return source
    .replace(/\s*[-|–—]\s*.+$/, '') // Remove " - suffix" or " | suffix"
    .replace(/\s*\(\d{4}\)/, '') // Remove " (2024)"
    .replace(/\s*\d{4}$/, '') // Remove trailing year
    .replace(/^(Best|Top|Ultimate|Complete|Essential)\s+/i, '') // Remove power word prefix
    .trim()
    .toLowerCase();
}

/**
 * Escape special regex characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fix missing image alt text in page content
 * Returns count of pages with fixed images
 */
export async function fixMissingImageAltText(siteId: string): Promise<{
  pagesFixed: number;
  imagesFixed: number;
  details: Array<{ pageId: string; pageTitle: string; imagesFixed: number }>;
}> {
  let pagesFixed = 0;
  let totalImagesFixed = 0;
  const details: Array<{ pageId: string; pageTitle: string; imagesFixed: number }> = [];

  const pages = await prisma.page.findMany({
    where: { siteId, status: 'PUBLISHED' },
    include: { content: true },
  });

  for (const page of pages) {
    const content = page.content?.body || '';

    // Find markdown images with missing or empty alt text: ![](url) or ![   ](url)
    const imgPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let updatedContent = content;
    let imagesFixedInPage = 0;

    // Reset regex state
    imgPattern.lastIndex = 0;

    while ((match = imgPattern.exec(content)) !== null) {
      const [fullMatch, altText, imageUrl] = match;

      if ((!altText || altText.trim() === '') && imageUrl) {
        const generatedAlt = generateAltText(imageUrl, page.title);
        updatedContent = updatedContent.replace(
          fullMatch,
          `![${generatedAlt}](${imageUrl})`
        );
        imagesFixedInPage++;
      }
    }

    if (imagesFixedInPage > 0 && page.content?.id) {
      await prisma.content.update({
        where: { id: page.content.id },
        data: { body: updatedContent },
      });

      pagesFixed++;
      totalImagesFixed += imagesFixedInPage;
      details.push({
        pageId: page.id,
        pageTitle: page.title,
        imagesFixed: imagesFixedInPage,
      });
    }
  }

  return {
    pagesFixed,
    imagesFixed: totalImagesFixed,
    details,
  };
}

/**
 * Generate descriptive alt text for an image
 */
function generateAltText(imageUrl: string, pageTitle: string): string {
  // Extract meaningful text from image filename
  const urlParts = imageUrl.split('/');
  const filename = urlParts[urlParts.length - 1] || '';
  const nameWithoutExtension = filename.split('.')[0] || '';

  // Clean up filename (replace dashes/underscores, remove numbers)
  const cleanFilename = nameWithoutExtension
    .replace(/[-_]/g, ' ')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Use cleaned filename if it's meaningful (more than 5 chars)
  if (cleanFilename.length > 5) {
    // Capitalize first letter of each word
    const capitalized = cleanFilename
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    return `${capitalized} - ${pageTitle}`;
  }

  // Fall back to page title based alt
  return `Image for ${pageTitle}`;
}
