#!/usr/bin/env npx tsx
/**
 * Regenerate Missing Logos
 *
 * This script regenerates logos for brands that don't have them,
 * using the SVG-based logo generator instead of DALL-E.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/regenerate-missing-logos.ts [options]
 *
 * Options:
 *   --limit=N       Limit to N brands
 *   --dry-run       Show what would be done without doing it
 */

import { prisma } from '@experience-marketplace/database';
import { generateSvgLogos, isSvgLogoGenerationAvailable } from '../services/svg-logo-generator.js';

// Rate limiting
const DELAY_BETWEEN_GENERATES_MS = 500;

interface Options {
  limit?: number;
  dryRun?: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {};

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.replace('--limit=', ''), 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(80));
  console.log('REGENERATE MISSING LOGOS (SVG-based)');
  console.log('='.repeat(80));
  console.log('Options:', options);
  console.log('');

  // Check if SVG logo generation is available
  if (!isSvgLogoGenerationAvailable()) {
    console.error('ERROR: SVG logo generation not available. Check S3 configuration.');
    process.exit(1);
  }

  // Find brands without logos that belong to microsites
  const brandsWithoutLogos = await prisma.brand.findMany({
    where: {
      logoUrl: null,
      micrositeConfig: {
        isNot: null, // Has a microsite
      },
    },
    include: {
      micrositeConfig: {
        include: {
          supplier: {
            select: {
              categories: true,
            },
          },
        },
      },
    },
    take: options.limit,
  });

  console.log(`Found ${brandsWithoutLogos.length} brands without logos\n`);

  if (options.dryRun) {
    console.log('DRY RUN - No logos will be generated');
    for (const brand of brandsWithoutLogos.slice(0, 10)) {
      console.log(`  Would generate logo for: ${brand.name}`);
    }
    if (brandsWithoutLogos.length > 10) {
      console.log(`  ... and ${brandsWithoutLogos.length - 10} more`);
    }
    await prisma.$disconnect();
    return;
  }

  let generated = 0;
  let errors = 0;
  const errorDetails: Array<{ name: string; error: string }> = [];

  for (const [i, brand] of brandsWithoutLogos.entries()) {
    const niche = brand.micrositeConfig?.supplier?.categories?.[0] || 'experiences';

    console.log(`[${i + 1}/${brandsWithoutLogos.length}] ${brand.name}`);

    try {
      const logoResult = await generateSvgLogos({
        brandName: brand.name,
        niche,
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor || undefined,
      });

      await prisma.brand.update({
        where: { id: brand.id },
        data: {
          logoUrl: logoResult.logoUrl,
          logoDarkUrl: logoResult.logoDarkUrl,
        },
      });

      console.log(`  ✓ Generated: ${logoResult.logoUrl}`);
      generated++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Error: ${errorMsg}`);
      errors++;
      errorDetails.push({ name: brand.name, error: errorMsg });
    }

    // Rate limiting
    if (i < brandsWithoutLogos.length - 1) {
      await delay(DELAY_BETWEEN_GENERATES_MS);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Generated: ${generated}`);
  console.log(`Errors:    ${errors}`);
  console.log(`Total:     ${brandsWithoutLogos.length}`);

  if (errorDetails.length > 0) {
    console.log('\nErrors:');
    for (const err of errorDetails.slice(0, 10)) {
      console.log(`  - ${err.name}: ${err.error}`);
    }
    if (errorDetails.length > 10) {
      console.log(`  ... and ${errorDetails.length - 10} more`);
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
