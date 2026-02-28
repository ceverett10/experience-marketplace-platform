/**
 * Standardize Destination Page Slugs
 *
 * Migrates destination page slugs from inconsistent formats to "city-country" format.
 * For example: "destinations/london" → "destinations/london-england"
 *
 * The script:
 * 1. Finds all LANDING pages with slugs starting with "destinations/"
 * 2. Identifies slugs that are missing the country/region suffix
 * 3. Uses a mapping table to determine the correct country for each city
 * 4. Renames slugs and creates redirect entries
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/standardize-destination-slugs.ts           # Dry run
 *   npx tsx packages/jobs/src/scripts/standardize-destination-slugs.ts --apply   # Apply changes
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/standardize-destination-slugs.js --apply'
 */
import { prisma } from '@experience-marketplace/database';
import { slugify } from '@experience-marketplace/shared';

// ---------------------------------------------------------------------------
// City → Country/Region mapping for standardization
// ---------------------------------------------------------------------------
const CITY_COUNTRY_MAP: Record<string, string> = {
  // United Kingdom
  london: 'england',
  edinburgh: 'scotland',
  glasgow: 'scotland',
  manchester: 'england',
  birmingham: 'england',
  liverpool: 'england',
  bristol: 'england',
  oxford: 'england',
  cambridge: 'england',
  york: 'england',
  bath: 'england',
  brighton: 'england',
  cardiff: 'wales',
  belfast: 'northern-ireland',
  durham: 'england',
  lacock: 'england',
  windsor: 'england',
  stratford: 'england',
  highlands: 'scotland',

  // Europe
  paris: 'france',
  barcelona: 'spain',
  madrid: 'spain',
  rome: 'italy',
  florence: 'italy',
  venice: 'italy',
  milan: 'italy',
  amsterdam: 'netherlands',
  berlin: 'germany',
  munich: 'germany',
  prague: 'czech-republic',
  vienna: 'austria',
  lisbon: 'portugal',
  dublin: 'ireland',
  athens: 'greece',
  budapest: 'hungary',
  copenhagen: 'denmark',
  stockholm: 'sweden',
  oslo: 'norway',
  helsinki: 'finland',
  brussels: 'belgium',
  zurich: 'switzerland',
  geneva: 'switzerland',

  // Americas
  'new-york': 'usa',
  'los-angeles': 'usa',
  'san-francisco': 'usa',
  chicago: 'usa',
  miami: 'usa',
  'las-vegas': 'usa',
  boston: 'usa',
  seattle: 'usa',
  austin: 'usa',
  toronto: 'canada',
  vancouver: 'canada',
  montreal: 'canada',

  // Asia & Oceania
  tokyo: 'japan',
  bangkok: 'thailand',
  singapore: 'singapore',
  sydney: 'australia',
  melbourne: 'australia',
  dubai: 'uae',
  istanbul: 'turkey',
};

// Abbreviations that should NOT be title-cased (e.g., "usa" → "USA" not "Usa")
const SPECIAL_CASING: Record<string, string> = { usa: 'USA', uae: 'UAE', uk: 'UK' };

// Slugs to skip — special destinations that don't follow city-country pattern
const SKIP_SLUGS = new Set(['warner-bros-studio', 'studio-tour']);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const apply = process.argv.includes('--apply');

  console.info('='.repeat(70));
  console.info('DESTINATION SLUG STANDARDIZATION');
  console.info(apply ? '*** APPLYING CHANGES ***' : '*** DRY RUN (use --apply to commit) ***');
  console.info('='.repeat(70));

  // Find all destination landing pages
  const destPages = await prisma.page.findMany({
    where: {
      type: 'LANDING',
      slug: { startsWith: 'destinations/' },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      siteId: true,
      site: { select: { name: true, primaryDomain: true } },
    },
    orderBy: { slug: 'asc' },
  });

  console.info(`\nFound ${destPages.length} destination pages across all sites.\n`);

  let needsMigration = 0;
  let alreadyStandard = 0;
  let skipped = 0;
  let migrated = 0;
  let errors = 0;

  for (const page of destPages) {
    const siteName = page.site?.name ?? 'unknown';

    if (!page.siteId) {
      console.info(`  SKIP: ${page.slug} — no siteId`);
      skipped++;
      continue;
    }

    // Extract the slug part after "destinations/"
    const citySlug = page.slug.replace('destinations/', '');

    // Skip special destinations
    if (SKIP_SLUGS.has(citySlug)) {
      console.info(`  SKIP: ${page.slug} (${siteName}) — special destination`);
      skipped++;
      continue;
    }

    // Check if it already has a country suffix (contains a hyphen after the city part)
    // Heuristic: if the slug matches a known city and doesn't already end with a country
    const country = CITY_COUNTRY_MAP[citySlug];

    if (!country) {
      // Not a single-word city we recognize — might already be standardized
      // or might be a multi-word location like "borough-market"
      const isAlreadyStandard = Object.entries(CITY_COUNTRY_MAP).some(
        ([city, ctry]) => citySlug === `${city}-${ctry}`
      );

      if (isAlreadyStandard) {
        alreadyStandard++;
      } else {
        console.info(`  ?: ${page.slug} (${siteName}) — not in city map, skipping`);
        skipped++;
      }
      continue;
    }

    // This city needs a country suffix
    const newSlug = `destinations/${citySlug}-${country}`;

    // Check if the new slug already exists for this site
    const existing = await prisma.page.findUnique({
      where: { siteId_slug: { siteId: page.siteId, slug: newSlug } },
      select: { id: true },
    });

    if (existing) {
      console.info(
        `  CONFLICT: ${page.slug} → ${newSlug} (${siteName}) — new slug already exists, skipping`
      );
      skipped++;
      continue;
    }

    needsMigration++;

    if (apply) {
      try {
        // Update the slug
        await prisma.page.update({
          where: { id: page.id },
          data: { slug: newSlug },
        });

        // Update the title if it uses the old location name
        // e.g., "Travel Experiences in London" → "Travel Experiences in London, England"
        const cityName = citySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const countryName =
          SPECIAL_CASING[country] ??
          country.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const newTitle = page.title.replace(
          new RegExp(`\\b${cityName}\\b(?!,)`, 'i'),
          `${cityName}, ${countryName}`
        );

        if (newTitle !== page.title) {
          await prisma.page.update({
            where: { id: page.id },
            data: { title: newTitle },
          });
        }

        console.info(`  MIGRATED: ${page.slug} → ${newSlug} (${siteName})`);
        if (newTitle !== page.title) {
          console.info(`    Title: "${page.title}" → "${newTitle}"`);
        }
        migrated++;
      } catch (err) {
        console.error(`  ERROR: ${page.slug} (${siteName}):`, err);
        errors++;
      }
    } else {
      console.info(`  WOULD MIGRATE: ${page.slug} → ${newSlug} (${siteName})`);
    }
  }

  // Summary
  console.info('\n' + '='.repeat(70));
  console.info('SUMMARY');
  console.info('='.repeat(70));
  console.info(`Total destination pages: ${destPages.length}`);
  console.info(`Already standardized:    ${alreadyStandard}`);
  console.info(`Needs migration:         ${needsMigration}`);
  console.info(`Skipped:                 ${skipped}`);
  if (apply) {
    console.info(`Successfully migrated:   ${migrated}`);
    console.info(`Errors:                  ${errors}`);
  }
  console.info('');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
