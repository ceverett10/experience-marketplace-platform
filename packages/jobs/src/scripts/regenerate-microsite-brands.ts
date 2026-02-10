#!/usr/bin/env npx tsx
/**
 * Regenerate brand identities for microsites stuck with the generic
 * "Premium Travel Experiences" fallback brand name.
 */

import 'dotenv/config';
import { prisma } from '@experience-marketplace/database';
import { generateComprehensiveBrandIdentity } from '../services/brand-identity.js';

async function main() {
  console.log('Regenerating microsite brand identities with AI...\n');
  console.log('ANTHROPIC_API_KEY:', process.env['ANTHROPIC_API_KEY'] ? 'set' : 'NOT SET');
  console.log('');

  // Only regenerate microsites affected by the generic fallback brand
  const microsites = await prisma.micrositeConfig.findMany({
    where: {
      parentDomain: 'experiencess.com',
      supplierId: { not: null },
      brand: { name: 'Premium Travel Experiences' },
    },
    include: {
      brand: true,
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

  console.log(`Found ${microsites.length} microsites with "Premium Travel Experiences" brand to regenerate\n`);

  for (const ms of microsites) {
    if (!ms.supplier) continue;

    const operatorName = ms.supplier.name;
    const cities = (ms.supplier.cities as string[]) || [];
    const categories = (ms.supplier.categories as string[]) || [];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Operator: ${operatorName}`);
    console.log(`Current Brand: ${ms.brand.name}`);
    console.log(`Cities: ${cities.slice(0, 3).join(', ')}`);
    console.log(`Categories: ${categories.slice(0, 3).join(', ')}`);

    try {
      // Generate new brand identity
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
        where: { id: ms.brandId },
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

      console.log('✓ Updated successfully');
    } catch (error) {
      console.error('✗ Error:', error instanceof Error ? error.message : String(error));
    }
  }

  console.log('\n\nDone! Updated microsites:');
  const updated = await prisma.micrositeConfig.findMany({
    where: { parentDomain: 'experiencess.com', status: 'ACTIVE' },
    include: { brand: true },
    orderBy: { createdAt: 'desc' },
  });

  for (const ms of updated) {
    console.log(`- ${ms.fullDomain} -> ${ms.brand.name}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
