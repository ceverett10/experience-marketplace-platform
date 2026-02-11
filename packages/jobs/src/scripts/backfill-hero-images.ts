/**
 * Backfill hero images for all existing microsites using Unsplash.
 *
 * Fetches relevant hero images based on each microsite's niche/location
 * using the existing Unsplash image service with R2 caching.
 *
 * Rate limiting: Unsplash free tier = 50 req/hour, production = 5000 req/hour.
 * This script processes in batches with delays to stay within limits.
 *
 * Run: set -a && source .env.local && npx tsx packages/jobs/src/scripts/backfill-hero-images.ts
 * Heroku: heroku run "node packages/jobs/dist/scripts/backfill-hero-images.js" --no-tty
 *
 * Options:
 *   --limit N     Process only N microsites (default: all)
 *   --batch N     Batch size (default: 10)
 *   --delay N     Delay between batches in ms (default: 5000)
 */

import { prisma } from '@experience-marketplace/database';
import { enrichHomepageConfigWithImages } from '../services/unsplash-images.js';

async function main() {
  console.log('=== Backfill Hero Images via Unsplash ===\n');

  // Parse CLI args
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const batchIdx = args.indexOf('--batch');
  const delayIdx = args.indexOf('--delay');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] || '0', 10) : 0;
  const batchSize = batchIdx >= 0 ? parseInt(args[batchIdx + 1] || '10', 10) : 10;
  const delayMs = delayIdx >= 0 ? parseInt(args[delayIdx + 1] || '5000', 10) : 5000;

  // Get all microsites that need hero images
  const microsites = await prisma.micrositeConfig.findMany({
    where: {
      supplierId: { not: null },
    },
    select: {
      id: true,
      siteName: true,
      homepageConfig: true,
      supplier: {
        select: {
          categories: true,
          cities: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    ...(limit > 0 ? { take: limit } : {}),
  });

  // Filter to those without hero images
  const needsImage = microsites.filter((ms) => {
    const config = ms.homepageConfig as any;
    return !config?.hero?.backgroundImage;
  });

  const alreadyHave = microsites.length - needsImage.length;
  console.log(`Total microsites: ${microsites.length}`);
  console.log(`Already have hero image: ${alreadyHave}`);
  console.log(`Need hero image: ${needsImage.length}`);
  console.log(`Batch size: ${batchSize}, delay: ${delayMs}ms\n`);

  let updated = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < needsImage.length; i += batchSize) {
    const batch = needsImage.slice(i, i + batchSize);
    console.log(`--- Batch ${Math.floor(i / batchSize) + 1} (${i + 1}-${Math.min(i + batchSize, needsImage.length)} of ${needsImage.length}) ---`);

    for (const ms of batch) {
      const config = ms.homepageConfig as any;
      const categories = ms.supplier?.categories as string[] | null;
      const cities = ms.supplier?.cities as string[] | null;
      const niche = categories?.[0] || 'travel experiences';
      const location = cities?.[0] || undefined;

      try {
        const enriched = await enrichHomepageConfigWithImages(
          { hero: { title: config?.hero?.title || ms.siteName, subtitle: config?.hero?.subtitle } },
          { niche, location }
        );

        if (enriched.hero?.backgroundImage) {
          const updatedConfig = {
            ...config,
            hero: {
              ...(config?.hero || {}),
              backgroundImage: enriched.hero.backgroundImage,
              backgroundImageAttribution: enriched.hero.backgroundImageAttribution,
            },
          };

          await prisma.micrositeConfig.update({
            where: { id: ms.id },
            data: { homepageConfig: updatedConfig },
          });

          updated++;
          console.log(`  [OK] ${ms.siteName} (${niche}, ${location || 'no location'})`);
        } else {
          failed++;
          console.log(`  [NO IMAGE] ${ms.siteName} - Unsplash returned no results`);
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [ERROR] ${ms.siteName}: ${msg}`);

        // If rate limited, wait longer
        if (msg.includes('403') || msg.includes('rate') || msg.includes('429')) {
          console.log('  Rate limited - waiting 60s...');
          await new Promise((r) => setTimeout(r, 60_000));
        }
      }
    }

    // Delay between batches to respect rate limits
    if (i + batchSize < needsImage.length) {
      console.log(`  Waiting ${delayMs}ms before next batch...\n`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated:       ${updated}`);
  console.log(`Already had:   ${alreadyHave}`);
  console.log(`Failed/No img: ${failed}`);
  console.log(`Total:         ${microsites.length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
