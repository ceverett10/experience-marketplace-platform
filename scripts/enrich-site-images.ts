/**
 * Script to enrich an existing site's homepage config with Unsplash images
 *
 * This script fetches images from Unsplash for destinations and categories
 * and updates the site's homepageConfig in the database.
 *
 * Run with: npx tsx scripts/enrich-site-images.ts [site-slug-or-id]
 *
 * Example:
 *   npx tsx scripts/enrich-site-images.ts london-food-tours
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { enrichHomepageConfigWithImages } from '../packages/jobs/src/services/unsplash-images.js';

const prisma = new PrismaClient();

interface HomepageConfig {
  hero?: {
    title?: string;
    subtitle?: string;
  };
  popularExperiences?: {
    title?: string;
    subtitle?: string;
    destination?: string;
    categoryPath?: string;
    searchTerms?: string[];
  };
  destinations?: Array<{
    name: string;
    slug: string;
    icon: string;
    imageUrl?: string;
    description?: string;
    imageAttribution?: {
      photographerName: string;
      photographerUrl: string;
      unsplashUrl: string;
    };
  }>;
  categories?: Array<{
    name: string;
    slug: string;
    icon: string;
    imageUrl?: string;
    description?: string;
    imageAttribution?: {
      photographerName: string;
      photographerUrl: string;
      unsplashUrl: string;
    };
  }>;
  testimonials?: Array<{
    name: string;
    location: string;
    text: string;
    rating: number;
  }>;
}

async function enrichSiteWithImages(siteIdentifier: string) {
  console.log('\n🖼️  Enriching Site with Unsplash Images\n');
  console.log('='.repeat(60));

  // Check for Unsplash API key
  if (!process.env.UNSPLASH_ACCESS_KEY) {
    console.error('❌ ERROR: UNSPLASH_ACCESS_KEY not found in environment variables');
    console.log('Make sure you have set it in your .env file');
    process.exit(1);
  }

  // Find the site by slug or ID
  console.log(`\n🔍 Looking for site: ${siteIdentifier}...`);

  let site = await prisma.site.findFirst({
    where: {
      OR: [
        { id: siteIdentifier },
        { slug: siteIdentifier },
        { name: { contains: siteIdentifier, mode: 'insensitive' } },
      ],
    },
    include: {
      opportunities: {
        take: 1,
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!site) {
    console.error(`❌ Site not found: ${siteIdentifier}`);
    console.log('\nAvailable sites:');
    const sites = await prisma.site.findMany({
      select: { id: true, slug: true, name: true },
      take: 10,
    });
    sites.forEach((s) => console.log(`  - ${s.slug} (${s.name})`));
    process.exit(1);
  }

  console.log(`✅ Found site: ${site.name} (${site.slug})`);
  console.log(`   ID: ${site.id}`);

  // Get current homepage config
  const currentConfig = (site.homepageConfig as HomepageConfig) || {};

  console.log('\n📊 Current homepage config:');
  console.log(`   Destinations: ${currentConfig.destinations?.length || 0}`);
  console.log(`   Categories: ${currentConfig.categories?.length || 0}`);

  // Check which items already have images
  const destinationsWithImages = currentConfig.destinations?.filter((d) => d.imageUrl)?.length || 0;
  const categoriesWithImages = currentConfig.categories?.filter((c) => c.imageUrl)?.length || 0;

  console.log(`   Destinations with images: ${destinationsWithImages}`);
  console.log(`   Categories with images: ${categoriesWithImages}`);

  if (
    destinationsWithImages === (currentConfig.destinations?.length || 0) &&
    categoriesWithImages === (currentConfig.categories?.length || 0) &&
    (currentConfig.destinations?.length || 0) > 0
  ) {
    console.log('\n✅ All items already have images! Skipping...');
    console.log('   (Use --force to re-fetch images anyway)');

    if (!process.argv.includes('--force')) {
      process.exit(0);
    }
    console.log('\n⚠️  --force flag detected, re-fetching images...');
  }

  // Get context from opportunity
  const opportunity = site.opportunities[0];
  const context = {
    location: opportunity?.location || undefined,
    niche: opportunity?.niche || undefined,
  };

  console.log(
    `\n🌍 Context: ${context.location || 'Unknown location'}, ${context.niche || 'Unknown niche'}`
  );

  // Clear existing images if forcing
  if (process.argv.includes('--force')) {
    if (currentConfig.destinations) {
      currentConfig.destinations = currentConfig.destinations.map((d) => ({
        ...d,
        imageUrl: undefined,
        imageAttribution: undefined,
      }));
    }
    if (currentConfig.categories) {
      currentConfig.categories = currentConfig.categories.map((c) => ({
        ...c,
        imageUrl: undefined,
        imageAttribution: undefined,
      }));
    }
  }

  // Enrich with Unsplash images
  console.log('\n🖼️  Fetching images from Unsplash...\n');

  const enrichedConfig = await enrichHomepageConfigWithImages(
    {
      destinations: currentConfig.destinations,
      categories: currentConfig.categories,
    },
    context
  );

  // Merge enriched data back into full config
  const updatedConfig: HomepageConfig = {
    ...currentConfig,
    destinations: enrichedConfig.destinations,
    categories: enrichedConfig.categories,
  };

  // Show results
  console.log('\n📸 Images fetched:');

  if (updatedConfig.destinations) {
    console.log('\n   DESTINATIONS:');
    for (const dest of updatedConfig.destinations) {
      if (dest.imageUrl) {
        console.log(`   ✅ ${dest.name}`);
        console.log(`      Photo by: ${dest.imageAttribution?.photographerName || 'Unknown'}`);
        console.log(`      URL: ${dest.imageUrl.substring(0, 60)}...`);
      } else {
        console.log(`   ❌ ${dest.name} - No image found`);
      }
    }
  }

  if (updatedConfig.categories) {
    console.log('\n   CATEGORIES:');
    for (const cat of updatedConfig.categories) {
      if (cat.imageUrl) {
        console.log(`   ✅ ${cat.name}`);
        console.log(`      Photo by: ${cat.imageAttribution?.photographerName || 'Unknown'}`);
        console.log(`      URL: ${cat.imageUrl.substring(0, 60)}...`);
      } else {
        console.log(`   ❌ ${cat.name} - No image found`);
      }
    }
  }

  // Update the database
  console.log('\n💾 Saving to database...');

  await prisma.site.update({
    where: { id: site.id },
    data: {
      homepageConfig: updatedConfig as any,
    },
  });

  console.log('✅ Site updated successfully!');

  // Summary
  const newDestinationsWithImages =
    updatedConfig.destinations?.filter((d) => d.imageUrl)?.length || 0;
  const newCategoriesWithImages = updatedConfig.categories?.filter((c) => c.imageUrl)?.length || 0;

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(
    `   Destinations with images: ${destinationsWithImages} → ${newDestinationsWithImages}`
  );
  console.log(`   Categories with images: ${categoriesWithImages} → ${newCategoriesWithImages}`);
  console.log('\n✨ Done! Refresh your website to see the images.\n');
  console.log('Note: Images are displayed with required Unsplash attribution:');
  console.log('"Photo by [Photographer Name] on Unsplash"\n');
}

// Get site identifier from command line
const siteIdentifier = process.argv[2];

if (!siteIdentifier) {
  console.log('Usage: npx tsx scripts/enrich-site-images.ts <site-slug-or-id> [--force]');
  console.log('\nExamples:');
  console.log('  npx tsx scripts/enrich-site-images.ts london-food-tours');
  console.log('  npx tsx scripts/enrich-site-images.ts london-food-tours --force');
  console.log('\nOptions:');
  console.log('  --force    Re-fetch images even if they already exist');
  process.exit(1);
}

enrichSiteWithImages(siteIdentifier)
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
