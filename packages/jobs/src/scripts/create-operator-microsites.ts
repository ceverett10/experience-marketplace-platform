#!/usr/bin/env npx tsx
/**
 * Create operator microsites for top suppliers
 * This script creates MicrositeConfig entries for the top-rated Holibob operators
 */

import 'dotenv/config';
import { prisma } from '@experience-marketplace/database';
import { handleMicrositeCreate } from '../workers/microsite.js';

const PARENT_DOMAIN = 'experiencess.com';

// Fake job wrapper to call the worker directly
function createFakeJob<T>(data: T) {
  return {
    data,
    id: `manual-${Date.now()}`,
    name: 'MICROSITE_CREATE',
    attemptsMade: 0,
    timestamp: Date.now(),
  } as any;
}

async function main() {
  console.log('Creating operator microsites...\n');

  // Get top suppliers by product count and rating (exclude fake city-* IDs)
  const suppliers = await prisma.supplier.findMany({
    where: {
      NOT: {
        holibobSupplierId: {
          startsWith: 'city-',
        },
      },
    },
    orderBy: [
      { rating: 'desc' },
      { productCount: 'desc' },
    ],
    take: 10,
    select: {
      id: true,
      holibobSupplierId: true,
      name: true,
      slug: true,
      productCount: true,
      rating: true,
      reviewCount: true,
      cities: true,
      categories: true,
    },
  });

  console.log(`Found ${suppliers.length} operators to create microsites for:\n`);

  for (const s of suppliers) {
    console.log(`- ${s.name} (${s.productCount} products, ${s.rating?.toFixed(2)} rating)`);
  }
  console.log('');

  // Create microsites
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const supplier of suppliers) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Creating microsite for: ${supplier.name}`);
    console.log(`${'='.repeat(60)}`);

    try {
      const result = await handleMicrositeCreate(
        createFakeJob({
          supplierId: supplier.id,
          parentDomain: PARENT_DOMAIN,
        })
      );

      if (result.success) {
        if (result.data?.['recovered']) {
          console.log(`  SKIPPED: Microsite already exists`);
          skipped++;
        } else {
          console.log(`  CREATED: ${result.data?.['fullDomain']}`);
          console.log(`  Brand: ${result.data?.['micrositeId']}`);
          created++;
        }
      } else {
        console.log(`  ERROR: ${result.error}`);
        errors++;
      }
    } catch (error) {
      console.error(`  EXCEPTION: ${error instanceof Error ? error.message : String(error)}`);
      errors++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`Created: ${created}`);
  console.log(`Skipped (already exists): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${suppliers.length}`);

  // List created microsites
  console.log('\n\nCreated Microsites:');
  const microsites = await prisma.micrositeConfig.findMany({
    where: {
      parentDomain: PARENT_DOMAIN,
      supplierId: { not: null },
    },
    include: {
      brand: true,
      supplier: {
        select: { name: true, holibobSupplierId: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });

  for (const ms of microsites) {
    console.log(`\n${ms.fullDomain}`);
    console.log(`  Original operator: ${ms.supplier?.name}`);
    console.log(`  Brand name: ${ms.brand.name}`);
    console.log(`  Tagline: ${ms.brand.tagline}`);
    console.log(`  Status: ${ms.status}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
