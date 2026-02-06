#!/usr/bin/env npx tsx
/**
 * Fix Meta Titles Script
 *
 * Generates SEO-optimized meta titles for pages that:
 * 1. Have null or empty meta titles
 * 2. Have generic meta titles (e.g., "Home | Site Name")
 * 3. Have meta titles that are too short (<30 chars) or too long (>60 chars)
 *
 * Usage:
 *   npx tsx scripts/fix-meta-titles.ts [options]
 *
 * Options:
 *   --site=<slug>    Only process pages for a specific site
 *   --dry-run        Show what would be changed without making changes
 *   --force          Regenerate ALL meta titles, not just problematic ones
 */

import { PrismaClient, PageType, PageStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface PageWithSite {
  id: string;
  title: string;
  slug: string;
  type: PageType;
  status: PageStatus;
  metaTitle: string | null;
  metaDescription: string | null;
  site: {
    id: string;
    name: string;
    slug: string;
    seoConfig: any;
    homepageConfig: any;
  };
  content: {
    body: string;
  } | null;
}

interface Options {
  siteSlug?: string;
  dryRun: boolean;
  force: boolean;
}

function parseArgs(): Options {
  const options: Options = {
    dryRun: false,
    force: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--site=')) {
      options.siteSlug = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    }
  }

  return options;
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

function needsImprovement(page: PageWithSite, force: boolean): boolean {
  if (force) return true;

  const metaTitle = page.metaTitle;

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

function generateMetaTitle(page: PageWithSite): string {
  const { type, title, site, content } = page;
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
        return `Best ${capitalize(niche)} in ${destination} | ${siteName}`;
      } else if (niche) {
        return `Discover Amazing ${capitalize(niche)} | ${siteName}`;
      }
      return `${siteName} - Book Unforgettable Experiences`;

    case 'ABOUT':
      if (destination) {
        return `About ${siteName} - Your ${capitalize(niche)} Experts in ${destination}`;
      }
      return `About ${siteName} - Your Trusted ${capitalize(niche)} Guide`;

    case 'CONTACT':
      return `Contact ${siteName} - Get in Touch | ${capitalize(niche)} Inquiries`;

    case 'LEGAL':
      if (title.toLowerCase().includes('privacy')) {
        return `Privacy Policy | ${siteName}`;
      } else if (title.toLowerCase().includes('terms')) {
        return `Terms of Service | ${siteName}`;
      }
      return `${title} | ${siteName}`;

    case 'FAQ':
      if (destination) {
        return `FAQ - ${capitalize(niche)} in ${destination} | ${siteName}`;
      }
      return `Frequently Asked Questions | ${siteName}`;

    case 'BLOG':
      // For blog posts, try to optimize the existing title
      return optimizeBlogTitle(title, siteName, niche);

    case 'LANDING':
      // Destination/landing pages
      if (title.toLowerCase() !== 'home') {
        return optimizeLandingTitle(title, siteName, niche);
      }
      return `${title} | ${siteName}`;

    case 'CATEGORY':
      return `${title} - Top ${capitalize(niche)} | ${siteName}`;

    default:
      // Fallback: use title with site name
      const withBrand = `${title} | ${siteName}`;
      if (withBrand.length <= 60) {
        return withBrand;
      }
      return truncateAtWord(title, 55);
  }
}

function optimizeBlogTitle(title: string, siteName: string, niche: string): string {
  // If title is already good length, append site name
  if (title.length <= 45) {
    const withBrand = `${title} | ${siteName}`;
    if (withBrand.length <= 60) {
      return withBrand;
    }
  }

  // Truncate at word boundary and add ellipsis indicator
  return truncateAtWord(title, 57);
}

function optimizeLandingTitle(title: string, siteName: string, niche: string): string {
  // Check if title contains location-like patterns
  const locationPattern = /in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;
  const match = title.match(locationPattern);

  if (match) {
    const location = match[1];
    return `${capitalize(niche)} in ${location} | ${siteName}`;
  }

  const withBrand = `${title} | ${siteName}`;
  if (withBrand.length <= 60) {
    return withBrand;
  }
  return truncateAtWord(title, 55);
}

function capitalize(str: string): string {
  if (!str) return '';
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const words = text.split(' ');
  let result = '';

  for (const word of words) {
    if ((result + ' ' + word).trim().length <= maxLength - 3) {
      result = (result + ' ' + word).trim();
    } else {
      break;
    }
  }

  return result || text.substring(0, maxLength - 3);
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('Meta Title Fix Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Force regenerate all: ${options.force}`);
  if (options.siteSlug) {
    console.log(`Site filter: ${options.siteSlug}`);
  }
  console.log('');

  // Build query
  const whereClause: any = {};
  if (options.siteSlug) {
    whereClause.site = { slug: options.siteSlug };
  }

  // Fetch all pages
  const pages = await prisma.page.findMany({
    where: whereClause,
    include: {
      site: {
        select: {
          id: true,
          name: true,
          slug: true,
          seoConfig: true,
          homepageConfig: true,
        },
      },
      content: {
        select: {
          body: true,
        },
      },
    },
    orderBy: [{ site: { name: 'asc' } }, { type: 'asc' }],
  });

  console.log(`Found ${pages.length} total pages\n`);

  // Filter pages that need improvement
  const pagesToFix = pages.filter((p) => needsImprovement(p as PageWithSite, options.force));
  console.log(`Pages needing meta title improvement: ${pagesToFix.length}\n`);

  if (pagesToFix.length === 0) {
    console.log('No pages need meta title fixes!');
    await prisma.$disconnect();
    return;
  }

  // Group by site for reporting
  const bySite = new Map<string, typeof pagesToFix>();
  for (const page of pagesToFix) {
    const siteName = page.site.name;
    if (!bySite.has(siteName)) {
      bySite.set(siteName, []);
    }
    bySite.get(siteName)!.push(page);
  }

  let fixed = 0;
  let errors = 0;

  for (const [siteName, sitePages] of bySite) {
    console.log(`\n📍 ${siteName} (${sitePages.length} pages)`);
    console.log('-'.repeat(50));

    for (const page of sitePages) {
      const oldTitle = page.metaTitle || '(null)';
      const newTitle = generateMetaTitle(page as PageWithSite);

      if (oldTitle === newTitle) {
        continue;
      }

      console.log(`  [${page.type}] ${page.title}`);
      console.log(`    Old: ${oldTitle}`);
      console.log(`    New: ${newTitle} (${newTitle.length} chars)`);

      if (!options.dryRun) {
        try {
          await prisma.page.update({
            where: { id: page.id },
            data: { metaTitle: newTitle },
          });
          fixed++;
        } catch (err: any) {
          console.log(`    ❌ Error: ${err.message}`);
          errors++;
        }
      } else {
        fixed++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Pages processed: ${pagesToFix.length}`);
  console.log(`Meta titles ${options.dryRun ? 'would be ' : ''}updated: ${fixed}`);
  if (errors > 0) {
    console.log(`Errors: ${errors}`);
  }

  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN - No changes made. Remove --dry-run to apply changes.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
