#!/usr/bin/env npx tsx
/**
 * Fix destination page titles and meta titles.
 *
 * Fixes three issues:
 * 1. Pages with "Paid_traffic" in their title → replace with proper niche title
 * 2. Pages with "Travel Experiences in" generic title → replace with niche title
 * 3. Meta titles containing "| SiteName" suffix → strip it (titleTemplate adds it)
 * 4. Meta titles containing "Paid_traffic" → regenerate
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/fix-destination-titles.ts [options]
 *
 * Options:
 *   --dry-run       Show what would change without applying
 *   --regen-content Also re-queue content generation for pages that had bad titles
 */

import { prisma, PageType } from '@experience-marketplace/database';
import { addJob } from '../queues/index.js';

const STAGGER_DELAY_MS = 5_000;

/** Domain → niche display name mapping */
const DOMAIN_NICHE: Record<string, string> = {
  'food-tour-guide.com': 'Food Tours',
  'water-tours.com': 'Boat Tours',
  'outdoorexploring.com': 'Adventure Tours',
  'cultural-tours.com': 'Cultural Tours',
  'attractionbooking.com': 'Tours & Attractions',
  'harry-potter-tours.com': 'Harry Potter Tours',
  'london-food-tours.com': 'Food Tours',
  'honeymoonexperiences.com': 'Honeymoon Experiences',
  'broke-nomad.com': 'Budget Travel',
  'grad-trip.com': 'Safari & Wildlife Tours',
  'zen-journeys.com': 'Mindful Travel',
  'bachelorette-party-ideas.com': 'Bachelorette Party Experiences',
  'experiences-corporate-team-builders.com': 'Team Building Experiences',
  'experiences-solo-female-travelers.com': 'Solo Travel',
  'experiences-anniversary-celebrators.com': 'Anniversary Experiences',
  'winetravelcollective.com': 'Wine Tours',
  'barcelona-food-tours.com': 'Food Tours',
  'experiencess.com': 'Tours & Experiences',
};

interface ScriptOptions {
  dryRun: boolean;
  regenContent: boolean;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    regenContent: args.includes('--regen-content'),
  };
}

function capitalize(str: string): string {
  return str
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Known slug → proper name corrections for edge cases */
const SLUG_CORRECTIONS: Record<string, string> = {
  'canc-n': 'Cancun',
  'champs-lys-es': 'Champs-Elysees',
  'hell-s-kitchen': "Hell's Kitchen",
  'miami-usa': 'Miami, USA',
  'napa-valley-usa': 'Napa Valley, USA',
  'bangkok-thailand': 'Bangkok, Thailand',
  'barcelona-spain': 'Barcelona, Spain',
  'bordeaux-france': 'Bordeaux, France',
  'tuscany-italy': 'Tuscany, Italy',
  'mendoza-argentina': 'Mendoza, Argentina',
  'douro-valley-portugal': 'Douro Valley, Portugal',
  'barossa-valley-australia': 'Barossa Valley, Australia',
  'rioja-spain': 'Rioja, Spain',
  'kyoto-japan': 'Kyoto, Japan',
  'bali-indonesia': 'Bali, Indonesia',
  'durham-england': 'Durham, England',
  'edinburgh-scotland': 'Edinburgh, Scotland',
  'highlands-scotland': 'Highlands, Scotland',
  'lacock-england': 'Lacock, England',
  'oxford-england': 'Oxford, England',
  'york-england': 'York, England',
  'london-england': 'London, England',
  'paris-france': 'Paris, France',
  'marrakech-morocco': 'Marrakech, Morocco',
  'istanbul-turkey': 'Istanbul, Turkey',
  'lisbon-portugal': 'Lisbon, Portugal',
  'marlborough-new-zealand': 'Marlborough, New Zealand',
  'hwange-national-park-zimbabwe': 'Hwange National Park, Zimbabwe',
  'amboseli-national-park-kenya': 'Amboseli National Park, Kenya',
  'chobe-national-park-botswana': 'Chobe National Park, Botswana',
  'serengeti-tanzania': 'Serengeti, Tanzania',
  'okavango-delta-botswana': 'Okavango Delta, Botswana',
  'kruger-national-park-south-africa': 'Kruger National Park, South Africa',
  'masai-mara-kenya': 'Masai Mara, Kenya',
  'ngorongoro-crater-tanzania': 'Ngorongoro Crater, Tanzania',
  'warner-bros-studio': 'Warner Bros Studio',
};

function extractLocation(slug: string): string {
  const slugPart = slug.replace('destinations/', '');
  if (SLUG_CORRECTIONS[slugPart]) {
    return SLUG_CORRECTIONS[slugPart];
  }
  const city = slugPart.replace(/-/g, ' ');
  return capitalize(city);
}

function generateCleanMetaTitle(niche: string, location: string, _siteName: string): string {
  const MAX_LENGTH = 60;
  // Do NOT include "| siteName" — titleTemplate adds it
  const full = `Best ${niche} in ${location}`;
  if (full.length <= MAX_LENGTH) return full;
  return `${niche} in ${location}`;
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.info('='.repeat(60));
  console.info('Fix Destination Page Titles & Meta Titles');
  console.info(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.info('='.repeat(60));

  // Get all destination pages
  const pages = await prisma.page.findMany({
    where: {
      type: PageType.LANDING,
      slug: { startsWith: 'destinations/' },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      metaTitle: true,
      contentId: true,
      siteId: true,
      site: {
        select: {
          name: true,
          domains: { select: { domain: true }, take: 1 },
        },
      },
    },
  });

  console.info(`\nFound ${pages.length} destination pages total\n`);

  let titlesFix = 0;
  let metaTitlesFix = 0;
  let contentRequeue = 0;
  const pagesToRegenContent: Array<{
    id: string;
    siteId: string | null;
    title: string;
    slug: string;
  }> = [];

  for (const page of pages) {
    const domain = page.site?.domains[0]?.domain ?? 'unknown';
    const niche = DOMAIN_NICHE[domain];
    const location = extractLocation(page.slug);
    const siteName = page.site?.name ?? 'Unknown';
    const changes: { title?: string; metaTitle?: string } = {};
    let needsContentRegen = false;

    // Fix 1: "Paid_traffic" in title
    if (page.title.includes('Paid_traffic') || page.title.includes('Paid traffic')) {
      if (niche) {
        changes.title = `${niche} in ${location}`;
        needsContentRegen = true;
      }
    }

    // Fix 2: Generic "Travel Experiences in" title
    if (page.title.startsWith('Travel Experiences in')) {
      if (niche) {
        changes.title = `${niche} in ${location}`;
        needsContentRegen = true;
      }
    }

    // Fix 3: Meta title containing "Paid_traffic" or "Paid traffic"
    if (
      page.metaTitle &&
      (page.metaTitle.includes('Paid_traffic') || page.metaTitle.includes('Paid traffic'))
    ) {
      if (niche) {
        changes.metaTitle = generateCleanMetaTitle(niche, location, siteName);
      }
    }

    // Fix 4: Meta title with duplicated brand name (contains "| SiteName" which titleTemplate will add again)
    if (page.metaTitle && !changes.metaTitle) {
      const brandSuffix = ` | ${siteName}`;
      if (page.metaTitle.endsWith(brandSuffix)) {
        changes.metaTitle = page.metaTitle.slice(0, -brandSuffix.length);
      }
    }

    if (Object.keys(changes).length === 0) continue;

    // Log the change
    if (changes.title) {
      console.info(`  TITLE FIX  ${domain}/${page.slug}`);
      console.info(`    "${page.title}" -> "${changes.title}"`);
      titlesFix++;
    }
    if (changes.metaTitle) {
      console.info(`  META FIX   ${domain}/${page.slug}`);
      console.info(`    "${page.metaTitle}" -> "${changes.metaTitle}"`);
      metaTitlesFix++;
    }

    if (needsContentRegen && page.contentId) {
      pagesToRegenContent.push({
        id: page.id,
        siteId: page.siteId,
        title: changes.title ?? page.title,
        slug: page.slug,
      });
    }

    if (!options.dryRun) {
      await prisma.page.update({
        where: { id: page.id },
        data: changes,
      });
    }
  }

  console.info(`\n${'='.repeat(60)}`);
  console.info(`Title fixes: ${titlesFix}`);
  console.info(`Meta title fixes: ${metaTitlesFix}`);

  // Re-queue content for pages that had bad titles
  if (options.regenContent && pagesToRegenContent.length > 0) {
    console.info(
      `\nRe-queuing content for ${pagesToRegenContent.length} pages with fixed titles...`
    );

    if (!options.dryRun) {
      // Clear existing content so it gets regenerated fresh
      for (let i = 0; i < pagesToRegenContent.length; i++) {
        const p = pagesToRegenContent[i];
        if (p === undefined) continue;
        const location = extractLocation(p.slug);
        const delayMs = i * STAGGER_DELAY_MS;

        // Disconnect the old content so the generator creates fresh content
        await prisma.page.update({
          where: { id: p.id },
          data: { contentId: null },
        });

        await addJob(
          'CONTENT_GENERATE',
          {
            siteId: p.siteId ?? undefined,
            pageId: p.id,
            contentType: 'destination',
            targetKeyword: p.title.toLowerCase(),
            destination: location,
          },
          delayMs > 0 ? { delay: delayMs } : undefined
        );
        contentRequeue++;
      }
    } else {
      contentRequeue = pagesToRegenContent.length;
      for (const p of pagesToRegenContent) {
        console.info(`  REGEN ${p.slug} — "${p.title}"`);
      }
    }

    console.info(`Content re-queued: ${contentRequeue}`);
  }

  console.info('='.repeat(60));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
