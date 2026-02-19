#!/usr/bin/env npx tsx
/**
 * Pilot Logo Generation v2
 *
 * Generates Satori-based logos for 5 sites + 5 microsites to validate
 * the new logo system before rolling out to all 11K brands.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/pilot-logos-v2.ts
 *   npx tsx packages/jobs/src/scripts/pilot-logos-v2.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/pilot-logos-v2.ts --sites-only
 *   npx tsx packages/jobs/src/scripts/pilot-logos-v2.ts --microsites-only
 *
 * Output: Table with brand name, template used, and all 4 image URLs
 * for visual review before wider rollout.
 */

import { prisma } from '@experience-marketplace/database';
import { generateLogos } from '../services/satori-logo-generator.js';
import { preloadFonts, validateFontName } from '../services/google-font-cache.js';

interface Options {
  dryRun: boolean;
  sitesOnly: boolean;
  micrositesOnly: boolean;
  limit: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    sitesOnly: args.includes('--sites-only'),
    micrositesOnly: args.includes('--microsites-only'),
    limit: (() => {
      const limitArg = args.find((a) => a.startsWith('--limit='));
      return limitArg ? parseInt(limitArg.replace('--limit=', ''), 10) : 5;
    })(),
  };
}

interface BrandTarget {
  type: 'site' | 'microsite';
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  tagline: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  niche: string;
  location: string | null;
}

interface PilotResult {
  brand: BrandTarget;
  templateId: string;
  logoUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  error?: string;
}

async function getSiteTargets(limit: number): Promise<BrandTarget[]> {
  const sites = await prisma.site.findMany({
    where: {
      status: 'ACTIVE',
      brand: { isNot: null },
    },
    include: {
      brand: true,
      opportunities: {
        take: 1,
        select: { niche: true, location: true },
      },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  return sites
    .filter((s) => s.brand)
    .map((s) => ({
      type: 'site' as const,
      id: s.id,
      name: s.name,
      brandId: s.brand!.id,
      brandName: s.brand!.name,
      tagline: s.brand!.tagline,
      primaryColor: s.brand!.primaryColor,
      secondaryColor: s.brand!.secondaryColor,
      accentColor: s.brand!.accentColor,
      headingFont: s.brand!.headingFont,
      bodyFont: s.brand!.bodyFont,
      niche: s.opportunities[0]?.niche ?? 'travel experiences',
      location: s.opportunities[0]?.location ?? null,
    }));
}

async function getMicrositeTargets(limit: number): Promise<BrandTarget[]> {
  const microsites = await prisma.micrositeConfig.findMany({
    where: {
      status: 'ACTIVE',
    },
    include: {
      brand: true,
      supplier: {
        select: { name: true, categories: true, cities: true },
      },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  return microsites.map((m) => ({
    type: 'microsite' as const,
    id: m.id,
    name: m.siteName,
    brandId: m.brandId,
    brandName: m.brand.name,
    tagline: m.brand.tagline,
    primaryColor: m.brand.primaryColor,
    secondaryColor: m.brand.secondaryColor,
    accentColor: m.brand.accentColor,
    headingFont: m.brand.headingFont,
    bodyFont: m.brand.bodyFont,
    niche: (m.supplier?.categories as string[] | null)?.[0] ?? 'travel experiences',
    location: (m.supplier?.cities as string[] | null)?.[0] ?? null,
  }));
}

async function main() {
  const options = parseArgs();

  console.info('='.repeat(80));
  console.info('PILOT LOGO GENERATION v2 (Satori-based)');
  console.info('='.repeat(80));
  console.info(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.info(`Limit: ${options.limit} per type`);
  console.info('');

  // Gather targets
  const targets: BrandTarget[] = [];

  if (!options.micrositesOnly) {
    const siteTargets = await getSiteTargets(options.limit);
    targets.push(...siteTargets);
    console.info(`Found ${siteTargets.length} site targets`);
  }

  if (!options.sitesOnly) {
    const micrositeTargets = await getMicrositeTargets(options.limit);
    targets.push(...micrositeTargets);
    console.info(`Found ${micrositeTargets.length} microsite targets`);
  }

  if (targets.length === 0) {
    console.info('No targets found. Exiting.');
    await prisma.$disconnect();
    return;
  }

  console.info(`\nTotal targets: ${targets.length}`);
  console.info('');

  // Preload all unique fonts
  const uniqueFonts = [
    ...new Set(
      targets.flatMap((t) => [validateFontName(t.headingFont), validateFontName(t.bodyFont)])
    ),
  ];
  console.info(`Preloading ${uniqueFonts.length} unique fonts...`);
  await preloadFonts(uniqueFonts);
  console.info('');

  // Generate logos
  const results: PilotResult[] = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    const prefix = `[${i + 1}/${targets.length}]`;

    console.info(`${prefix} ${target.type.toUpperCase()}: "${target.brandName}"`);
    console.info(`  Niche: ${target.niche} | Location: ${target.location ?? 'N/A'}`);
    console.info(`  Font: ${target.headingFont} | Color: ${target.primaryColor}`);

    if (options.dryRun) {
      console.info('  [DRY RUN] Would generate logos');
      results.push({
        brand: target,
        templateId: 'dry-run',
        logoUrl: 'dry-run',
        logoDarkUrl: 'dry-run',
        faviconUrl: 'dry-run',
        ogImageUrl: 'dry-run',
      });
      continue;
    }

    try {
      const result = await generateLogos({
        brandName: target.brandName,
        tagline: target.tagline ?? undefined,
        niche: target.niche,
        primaryColor: target.primaryColor,
        secondaryColor: target.secondaryColor,
        accentColor: target.accentColor,
        headingFont: target.headingFont,
        bodyFont: target.bodyFont,
        location: target.location ?? undefined,
      });

      // Update the database with new logo URLs
      await prisma.brand.update({
        where: { id: target.brandId },
        data: {
          logoUrl: result.logoUrl,
          logoDarkUrl: result.logoDarkUrl,
          faviconUrl: result.faviconUrl,
          ogImageUrl: result.ogImageUrl,
        },
      });

      results.push({
        brand: target,
        templateId: result.templateId,
        logoUrl: result.logoUrl,
        logoDarkUrl: result.logoDarkUrl,
        faviconUrl: result.faviconUrl,
        ogImageUrl: result.ogImageUrl,
      });

      console.info(`  Template: ${result.templateId}`);
      console.info(`  Light:    ${result.logoUrl}`);
      console.info(`  Dark:     ${result.logoDarkUrl}`);
      console.info(`  Favicon:  ${result.faviconUrl}`);
      console.info(`  OG:       ${result.ogImageUrl}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ERROR: ${message}`);
      results.push({
        brand: target,
        templateId: 'error',
        logoUrl: '',
        logoDarkUrl: '',
        faviconUrl: '',
        ogImageUrl: '',
        error: message,
      });
    }

    console.info('');
  }

  // Print summary
  console.info('='.repeat(80));
  console.info('SUMMARY');
  console.info('='.repeat(80));

  const successful = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  console.info(`Total: ${results.length}`);
  console.info(`Success: ${successful.length}`);
  console.info(`Failed: ${failed.length}`);
  console.info('');

  if (successful.length > 0) {
    console.info('--- Successful Logos ---');
    for (const r of successful) {
      console.info(`\n${r.brand.type.toUpperCase()}: ${r.brand.brandName}`);
      console.info(`  Template: ${r.templateId}`);
      console.info(`  Light:    ${r.logoUrl}`);
      console.info(`  Dark:     ${r.logoDarkUrl}`);
      console.info(`  Favicon:  ${r.faviconUrl}`);
      console.info(`  OG:       ${r.ogImageUrl}`);
    }
  }

  if (failed.length > 0) {
    console.info('\n--- Failed ---');
    for (const r of failed) {
      console.info(`${r.brand.brandName}: ${r.error}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
