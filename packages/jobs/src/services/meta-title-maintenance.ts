/**
 * Meta Title Maintenance Service
 * Ensures all pages have SEO-optimized meta titles
 * Runs as a scheduled maintenance job to catch any edge cases
 */

import { prisma, PageType, SiteStatus } from '@experience-marketplace/database';

interface MaintenanceResult {
  totalPages: number;
  pagesFixed: number;
  errors: string[];
}

// Generic titles that need improvement
const GENERIC_TITLE_PATTERNS = [
  /^Home\s*\|/i,
  /^About\s*(Us)?\s*\|/i,
  /^Contact\s*(Us)?\s*\|/i,
  /^Privacy\s*Policy\s*\|/i,
  /^Terms\s*(of\s*Service|&\s*Conditions)?\s*\|/i,
  /^FAQ\s*\|/i,
];

function isGenericTitle(metaTitle: string | null): boolean {
  if (!metaTitle) return true;
  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(metaTitle));
}

function needsImprovement(metaTitle: string | null): boolean {
  // Missing or empty
  if (!metaTitle || metaTitle.trim() === '') return true;

  // Too short (less than 30 chars usually means it's not optimized)
  if (metaTitle.length < 30) return true;

  // Too long (over 60 chars gets truncated in search results)
  if (metaTitle.length > 65) return true;

  // Generic title
  if (isGenericTitle(metaTitle)) return true;

  return false;
}

function generateMetaTitle(page: {
  title: string;
  type: PageType;
  site: {
    name: string;
    seoConfig: any;
    homepageConfig: any;
  };
}): string {
  const { type, title, site } = page;
  const siteName = site.name;
  const seoConfig = site.seoConfig || {};
  const homepageConfig = site.homepageConfig || {};

  // Extract niche/category from site config
  const niche =
    seoConfig.primaryKeywords?.[0] ||
    homepageConfig.categories?.[0]?.name ||
    homepageConfig.categories?.[0] ||
    'experiences';
  const destination = seoConfig.destination || seoConfig.location || '';

  // Type-specific meta title generation
  switch (type) {
    case 'HOMEPAGE':
      if (destination && niche) {
        return truncateWithBrand(`Best ${capitalize(niche)} in ${destination}`, siteName);
      } else if (niche) {
        return truncateWithBrand(`Discover Amazing ${capitalize(niche)}`, siteName);
      }
      return `${siteName} - Book Unforgettable Experiences`;

    case 'ABOUT':
      if (destination) {
        return truncateWithBrand(
          `About ${siteName} - ${capitalize(niche)} Experts in ${destination}`,
          siteName
        );
      }
      return truncateWithBrand(
        `About ${siteName} - Your Trusted ${capitalize(niche)} Guide`,
        siteName
      );

    case 'CONTACT':
      return truncateWithBrand(`Contact ${siteName} - Get in Touch`, siteName);

    case 'LEGAL':
      if (title.toLowerCase().includes('privacy')) {
        return `Privacy Policy | ${siteName}`;
      } else if (title.toLowerCase().includes('terms')) {
        return `Terms of Service | ${siteName}`;
      }
      return truncateWithBrand(title, siteName);

    case 'FAQ':
      if (destination) {
        return truncateWithBrand(`${capitalize(niche)} FAQ - ${destination}`, siteName);
      }
      return truncateWithBrand('Frequently Asked Questions', siteName);

    case 'BLOG':
      return truncateWithBrand(title, siteName);

    case 'LANDING':
      return truncateWithBrand(title, siteName);

    case 'CATEGORY':
      return truncateWithBrand(`${title} - Top ${capitalize(niche)}`, siteName);

    default:
      return truncateWithBrand(title, siteName);
  }
}

function truncateWithBrand(title: string, siteName: string): string {
  const MAX_LENGTH = 60;
  const withBrand = `${title} | ${siteName}`;

  if (withBrand.length <= MAX_LENGTH) {
    return withBrand;
  }

  // Title too long, truncate at word boundary
  const availableLength = MAX_LENGTH - siteName.length - 3; // " | " = 3 chars
  if (availableLength < 20) {
    // Not enough room for brand, just truncate title
    return truncateAtWord(title, MAX_LENGTH - 3) + '...';
  }

  return truncateAtWord(title, availableLength) + ` | ${siteName}`;
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const words = text.split(' ');
  let result = '';

  for (const word of words) {
    if ((result + ' ' + word).trim().length <= maxLength) {
      result = (result + ' ' + word).trim();
    } else {
      break;
    }
  }

  return result || text.substring(0, maxLength);
}

function capitalize(str: string): string {
  if (!str) return '';
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Run meta title maintenance for all active sites
 * Checks and fixes pages with missing or poor meta titles
 */
export async function runMetaTitleMaintenance(): Promise<MaintenanceResult> {
  console.log('[Meta Title Maintenance] Starting maintenance check...');

  const result: MaintenanceResult = {
    totalPages: 0,
    pagesFixed: 0,
    errors: [],
  };

  try {
    // Fetch all pages from active sites that might need fixing
    const pages = await prisma.page.findMany({
      where: {
        site: {
          status: SiteStatus.ACTIVE,
        },
      },
      include: {
        site: {
          select: {
            name: true,
            seoConfig: true,
            homepageConfig: true,
          },
        },
      },
    });

    result.totalPages = pages.length;

    // Filter pages that need improvement and have a site (not microsite)
    const pagesToFix = pages.filter((p) => p.site && needsImprovement(p.metaTitle));

    console.log(
      `[Meta Title Maintenance] Found ${pagesToFix.length} pages needing meta title fixes`
    );

    for (const page of pagesToFix) {
      try {
        // Skip pages without a site (microsite pages)
        if (!page.site) continue;

        const newMetaTitle = generateMetaTitle({
          title: page.title,
          type: page.type,
          site: page.site,
        });

        // Skip if the generated title is the same
        if (newMetaTitle === page.metaTitle) {
          continue;
        }

        await prisma.page.update({
          where: { id: page.id },
          data: { metaTitle: newMetaTitle },
        });

        result.pagesFixed++;

        if (result.pagesFixed % 50 === 0) {
          console.log(`[Meta Title Maintenance] Fixed ${result.pagesFixed} pages...`);
        }
      } catch (err: any) {
        result.errors.push(`Failed to fix page ${page.id}: ${err.message}`);
      }
    }

    console.log(`[Meta Title Maintenance] Complete - Fixed ${result.pagesFixed} pages`);
    if (result.errors.length > 0) {
      console.log(`[Meta Title Maintenance] Errors: ${result.errors.length}`);
    }

    return result;
  } catch (err: any) {
    console.error('[Meta Title Maintenance] Fatal error:', err);
    result.errors.push(`Fatal error: ${err.message}`);
    return result;
  }
}
