#!/usr/bin/env npx tsx
/**
 * Create a test microsite for a supplier
 *
 * Usage:
 *   npx tsx scripts/create-test-microsite.ts <supplier-slug>
 *
 * Example:
 *   npx tsx scripts/create-test-microsite.ts london-experiences
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { prisma } from '@experience-marketplace/database';

const PARENT_DOMAIN = 'experiencess.com';

async function main() {
  const supplierSlug = process.argv[2];

  if (!supplierSlug) {
    console.error('Usage: npx tsx scripts/create-test-microsite.ts <supplier-slug>');
    console.error('');
    console.error('Available suppliers:');
    const suppliers = await prisma.supplier.findMany({
      orderBy: { productCount: 'desc' },
      select: { slug: true, name: true, productCount: true },
    });
    for (const s of suppliers) {
      console.error(`  - ${s.slug} (${s.productCount} products): ${s.name}`);
    }
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Create Test Microsite');
  console.log('='.repeat(60));

  try {
    // Find the supplier
    const supplier = await prisma.supplier.findUnique({
      where: { slug: supplierSlug },
      include: {
        products: {
          take: 1,
          select: { id: true, title: true },
        },
      },
    });

    if (!supplier) {
      console.error(`Supplier not found: ${supplierSlug}`);
      console.error('');
      console.error('Available suppliers:');
      const suppliers = await prisma.supplier.findMany({
        orderBy: { productCount: 'desc' },
        select: { slug: true, name: true, productCount: true },
      });
      for (const s of suppliers) {
        console.error(`  - ${s.slug} (${s.productCount} products): ${s.name}`);
      }
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log(`\nSupplier: ${supplier.name}`);
    console.log(`  ID: ${supplier.id}`);
    console.log(`  Products: ${supplier.productCount}`);
    console.log(`  Cities: ${supplier.cities.join(', ')}`);

    // Use supplier slug as subdomain
    const subdomain = supplier.slug;
    const fullDomain = `${subdomain}.${PARENT_DOMAIN}`;

    // Check if microsite already exists
    const existingMicrosite = await prisma.micrositeConfig.findUnique({
      where: { fullDomain },
    });

    if (existingMicrosite) {
      console.log(`\nMicrosite already exists: https://${fullDomain}`);
      console.log(`  Status: ${existingMicrosite.status}`);
      console.log(`  Entity Type: ${existingMicrosite.entityType}`);
      await prisma.$disconnect();
      return;
    }

    // Create the microsite config with a new Brand
    console.log(`\nCreating microsite: https://${fullDomain}`);

    // First create a Brand for the microsite
    const brand = await prisma.brand.create({
      data: {
        name: supplier.name,
        tagline: `Discover ${supplier.cities[0] || 'amazing'} experiences`,
        primaryColor: '#4F46E5',
        secondaryColor: '#818CF8',
        accentColor: '#C7D2FE',
        headingFont: 'Inter',
        bodyFont: 'Inter',
      },
    });

    console.log(`  Created Brand: ${brand.id}`);

    const microsite = await prisma.micrositeConfig.create({
      data: {
        subdomain,
        parentDomain: PARENT_DOMAIN,
        fullDomain,
        entityType: 'SUPPLIER',
        supplierId: supplier.id,
        brandId: brand.id,
        siteName: supplier.name,
        tagline: `Discover ${supplier.cities[0] || 'amazing'} experiences`,
        status: 'ACTIVE',
        seoConfig: {
          title: supplier.name,
          description: supplier.description || `Discover amazing experiences with ${supplier.name}`,
          keywords: supplier.categories,
        },
      },
    });

    console.log(`\nMicrosite created!`);
    console.log(`  ID: ${microsite.id}`);
    console.log(`  Subdomain: ${microsite.subdomain}`);
    console.log(`  Full Domain: ${microsite.fullDomain}`);
    console.log(`  Status: ${microsite.status}`);

    console.log('\n' + '='.repeat(60));
    console.log('Test your microsite:');
    console.log('='.repeat(60));
    console.log(`  URL: https://${fullDomain}`);
    console.log(`  curl: curl -I https://${fullDomain}`);
    console.log('');
    console.log('Note: DNS propagation may take 1-5 minutes.');

  } catch (error) {
    console.error('\nError:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
