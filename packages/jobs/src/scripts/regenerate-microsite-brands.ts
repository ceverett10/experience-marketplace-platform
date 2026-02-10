#!/usr/bin/env npx tsx
/**
 * Regenerate brand identities for microsites with duplicate/generic brand names.
 *
 * Targets microsites where the brand name is shared by more than one microsite
 * (e.g. "VoyageVault" x23, "Wanderlust Collective" x19) — these were generated
 * by the AI using generic travel-themed names instead of the actual operator name.
 *
 * Usage: npx tsx packages/jobs/src/scripts/regenerate-microsite-brands.ts [--dry-run]
 */

import 'dotenv/config';
import { prisma } from '@experience-marketplace/database';
import { generateComprehensiveBrandIdentity } from '../services/brand-identity.js';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`Regenerating duplicate microsite brand names${dryRun ? ' (DRY RUN)' : ''}...\n`);
  console.log('ANTHROPIC_API_KEY:', process.env['ANTHROPIC_API_KEY'] ? 'set' : 'NOT SET');
  console.log('');

  // Step 1: Find brand names used by more than one microsite
  const allMicrosites = await prisma.micrositeConfig.findMany({
    where: {
      parentDomain: 'experiencess.com',
      supplierId: { not: null },
    },
    include: {
      brand: { select: { id: true, name: true } },
      supplier: {
        select: {
          name: true,
          description: true,
          cities: true,
          categories: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Count how many microsites share each brand name
  const brandNameCounts: Record<string, number> = {};
  for (const ms of allMicrosites) {
    brandNameCounts[ms.brand.name] = (brandNameCounts[ms.brand.name] || 0) + 1;
  }

  // Filter to only those with duplicate brand names (2+ microsites sharing the same name)
  const microsites = allMicrosites.filter((ms) => brandNameCounts[ms.brand.name]! > 1);

  const duplicateNames = Object.entries(brandNameCounts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  console.log(`Total microsites: ${allMicrosites.length}`);
  console.log(`Duplicate brand names: ${duplicateNames.length}`);
  console.log(`Microsites to regenerate: ${microsites.length}\n`);

  console.log('Top duplicate names:');
  for (const [name, count] of duplicateNames.slice(0, 15)) {
    console.log(`  ${count}x  ${name}`);
  }
  console.log('');

  if (dryRun) {
    console.log('DRY RUN — no changes made.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const ms of microsites) {
    if (!ms.supplier) continue;

    const operatorName = ms.supplier.name;
    const cities = (ms.supplier.cities as string[]) || [];
    const categories = (ms.supplier.categories as string[]) || [];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Operator: ${operatorName}`);
    console.log(`Current Brand: ${ms.brand.name} (${brandNameCounts[ms.brand.name]}x duplicate)`);

    try {
      const brandIdentity = await generateComprehensiveBrandIdentity({
        keyword: operatorName,
        location: cities[0] || undefined,
        niche: categories[0] || 'travel experiences',
        searchVolume: 100,
        intent: 'TRANSACTIONAL',
        entityName: operatorName,
        entityDescription: ms.supplier.description || undefined,
      });

      console.log(`NEW Brand: ${brandIdentity.name}`);
      console.log(`NEW Tagline: ${brandIdentity.tagline}`);

      // Update the brand record
      await prisma.brand.update({
        where: { id: ms.brand.id },
        data: {
          name: brandIdentity.name,
          tagline: brandIdentity.tagline,
          primaryColor: brandIdentity.primaryColor,
          secondaryColor: brandIdentity.secondaryColor,
          accentColor: brandIdentity.accentColor,
        },
      });

      // Update the microsite siteName
      await prisma.micrositeConfig.update({
        where: { id: ms.id },
        data: {
          siteName: brandIdentity.name,
          tagline: brandIdentity.tagline,
        },
      });

      console.log('Updated successfully');
      updated++;
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      failed++;
    }
  }

  console.log(`\n\nDone! Updated: ${updated}, Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(console.error);
