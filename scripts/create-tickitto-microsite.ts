#!/usr/bin/env npx tsx
/**
 * Create the Tickitto microsite at tickitto.experiencess.com
 *
 * This microsite uses the Tickitto API (supplierType=TICKITTO) instead of Holibob.
 * It does NOT require a local Supplier record — all events come from Tickitto's REST API.
 *
 * Usage:
 *   npx tsx scripts/create-tickitto-microsite.ts
 *
 * Environment:
 *   DATABASE_URL must be set (reads from .env / .env.local)
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { prisma } from '@experience-marketplace/database';

const PARENT_DOMAIN = 'experiencess.com';
const SUBDOMAIN = 'tickitto';
const FULL_DOMAIN = `${SUBDOMAIN}.${PARENT_DOMAIN}`;

async function main() {
  console.log(`\nCreating Tickitto microsite: ${FULL_DOMAIN}\n`);

  // Check if microsite already exists
  const existing = await prisma.micrositeConfig.findUnique({
    where: { fullDomain: FULL_DOMAIN },
  });

  if (existing) {
    console.log(`Microsite already exists: ${FULL_DOMAIN} (id: ${existing.id})`);
    console.log(`Status: ${existing.status}`);
    console.log(`Supplier type: ${existing.supplierType}`);
    console.log('\nTo recreate, delete the existing record first.');
    return;
  }

  // Step 1: Create Brand for Tickitto
  console.log('1. Creating brand...');
  const brand = await prisma.brand.create({
    data: {
      name: 'Tickitto',
      tagline: 'Discover unforgettable events and experiences worldwide',
      primaryColor: '#6366F1', // Indigo
      secondaryColor: '#818CF8',
      accentColor: '#C7D2FE',
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
  });
  console.log(`   Brand created: ${brand.id}`);

  // Step 2: Create MicrositeConfig
  console.log('2. Creating microsite config...');
  const microsite = await prisma.micrositeConfig.create({
    data: {
      subdomain: SUBDOMAIN,
      parentDomain: PARENT_DOMAIN,
      fullDomain: FULL_DOMAIN,
      entityType: 'SUPPLIER',
      // No supplierId — Tickitto events come from external API
      brandId: brand.id,
      siteName: 'Tickitto',
      tagline: 'Discover unforgettable events and experiences worldwide',
      supplierType: 'TICKITTO',
      tickittoConfig: {
        apiUrl: 'https://dev.tickitto.tech',
      },
      layoutType: 'MARKETPLACE', // Tickitto has 95+ events
      cachedProductCount: 95,
      productCountUpdatedAt: new Date(),
      seoConfig: {
        titleTemplate: '%s | Tickitto',
        defaultTitle: 'Tickitto - Events & Experiences',
        defaultDescription:
          'Discover and book unforgettable events, shows, and experiences worldwide. From concerts to theater, sports to attractions.',
        keywords: [
          'events',
          'tickets',
          'experiences',
          'concerts',
          'theater',
          'shows',
          'attractions',
        ],
        gaMeasurementId: process.env['MICROSITE_GA4_MEASUREMENT_ID'] || null,
      },
      homepageConfig: {
        hero: {
          title: 'Tickitto',
          subtitle: 'Discover unforgettable events and experiences worldwide',
        },
        popularExperiences: {
          title: 'Popular Events',
          searchTerms: ['concerts', 'theater', 'sports'],
        },
      },
      status: 'ACTIVE',
    },
  });
  console.log(`   Microsite created: ${microsite.id}`);

  console.log('\n--- Summary ---');
  console.log(`Domain:        ${FULL_DOMAIN}`);
  console.log(`Microsite ID:  ${microsite.id}`);
  console.log(`Brand ID:      ${brand.id}`);
  console.log(`Supplier Type: TICKITTO`);
  console.log(`Status:        ACTIVE`);
  console.log(`Layout:        MARKETPLACE`);
  console.log('\nNext steps:');
  console.log('  1. Add CNAME record for tickitto.experiencess.com → Heroku');
  console.log('  2. Set TICKITTO_API_KEY and TICKITTO_API_URL env vars on Heroku');
  console.log('  3. Deploy and verify at https://tickitto.experiencess.com/experiences');
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
