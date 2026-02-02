#!/usr/bin/env node

/**
 * Update Homepage Configs Script
 *
 * This script checks all active sites and ensures they have proper homepage configs
 * with categories and destination data for the footer links.
 *
 * Usage:
 *   node scripts/update-homepage-configs.js [--dry-run]
 *
 * Options:
 *   --dry-run  Show what would be updated without making changes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

// Default categories to use if AI generation fails
const DEFAULT_CATEGORIES = [
  { name: 'Tours & Sightseeing', slug: 'tours', icon: '🗺️', description: 'Guided tours to discover the best of your destination.' },
  { name: 'Food & Drink', slug: 'food-drink', icon: '🍷', description: 'Culinary adventures from street food to fine dining.' },
  { name: 'Adventure', slug: 'adventure', icon: '🏔️', description: 'Thrilling outdoor activities for adventurers.' },
  { name: 'Culture & History', slug: 'culture', icon: '🏛️', description: 'Immerse yourself in local heritage and history.' },
];

// Niche-specific category templates
const NICHE_CATEGORIES = {
  'food': [
    { name: 'Food Tours', slug: 'food-tours', icon: '🍕', description: 'Guided food tours through the best culinary spots.' },
    { name: 'Wine Tasting', slug: 'wine-tasting', icon: '🍷', description: 'Sample local and regional wines with expert sommeliers.' },
    { name: 'Cooking Classes', slug: 'cooking-classes', icon: '👨‍🍳', description: 'Learn to cook authentic local dishes with professional chefs.' },
    { name: 'Market Tours', slug: 'market-tours', icon: '🛒', description: 'Explore vibrant local markets and discover fresh ingredients.' },
    { name: 'Street Food', slug: 'street-food', icon: '🥡', description: 'Taste the best street food the city has to offer.' },
    { name: 'Fine Dining', slug: 'fine-dining', icon: '🍽️', description: 'Experience world-class restaurants and Michelin-starred cuisine.' },
  ],
  'museum': [
    { name: 'Art Museums', slug: 'art-museums', icon: '🎨', description: 'Explore world-renowned art collections and galleries.' },
    { name: 'History Museums', slug: 'history-museums', icon: '🏛️', description: 'Discover fascinating historical exhibits and artifacts.' },
    { name: 'Science Museums', slug: 'science-museums', icon: '🔬', description: 'Interactive science exhibits for all ages.' },
    { name: 'Guided Tours', slug: 'guided-tours', icon: '🎧', description: 'Expert-led tours through major museums.' },
    { name: 'Skip-the-Line', slug: 'skip-the-line', icon: '⏭️', description: 'Priority access tickets to avoid long queues.' },
    { name: 'Private Tours', slug: 'private-tours', icon: '👤', description: 'Exclusive private museum experiences.' },
  ],
  'adventure': [
    { name: 'Hiking', slug: 'hiking', icon: '🥾', description: 'Scenic hiking trails and mountain adventures.' },
    { name: 'Water Sports', slug: 'water-sports', icon: '🏄', description: 'Surfing, kayaking, and aquatic adventures.' },
    { name: 'Climbing', slug: 'climbing', icon: '🧗', description: 'Rock climbing and bouldering experiences.' },
    { name: 'Cycling', slug: 'cycling', icon: '🚴', description: 'Bike tours and cycling adventures.' },
    { name: 'Wildlife', slug: 'wildlife', icon: '🦁', description: 'Wildlife safaris and nature encounters.' },
    { name: 'Extreme Sports', slug: 'extreme-sports', icon: '🪂', description: 'Skydiving, bungee jumping, and adrenaline rushes.' },
  ],
};

function getCategoriesForNiche(niche) {
  const nicheLower = niche?.toLowerCase() || '';

  if (nicheLower.includes('food') || nicheLower.includes('culinary') || nicheLower.includes('wine')) {
    return NICHE_CATEGORIES['food'];
  }
  if (nicheLower.includes('museum') || nicheLower.includes('art') || nicheLower.includes('history')) {
    return NICHE_CATEGORIES['museum'];
  }
  if (nicheLower.includes('adventure') || nicheLower.includes('outdoor') || nicheLower.includes('hiking')) {
    return NICHE_CATEGORIES['adventure'];
  }

  return DEFAULT_CATEGORIES;
}

function extractDestination(location) {
  if (!location) return null;
  // Extract city name (first part before comma)
  return location.split(',')[0].trim();
}

async function main() {
  console.log('========================================');
  console.log('Homepage Config Update Script');
  console.log(isDryRun ? '(DRY RUN - No changes will be made)' : '');
  console.log('========================================\n');

  try {
    // Find all active/draft sites
    const sites = await prisma.site.findMany({
      where: {
        status: { in: ['ACTIVE', 'DRAFT'] },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        homepageConfig: true,
        opportunities: {
          select: {
            location: true,
            niche: true,
          },
          take: 1,
        },
      },
    });

    console.log(`Found ${sites.length} active/draft sites\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const site of sites) {
      const opportunity = site.opportunities[0];
      const location = opportunity?.location;
      const niche = opportunity?.niche;
      const destination = extractDestination(location);

      console.log(`\n--- ${site.name} (${site.slug}) ---`);
      console.log(`  Location: ${location || 'Not set'}`);
      console.log(`  Niche: ${niche || 'Not set'}`);
      console.log(`  Destination: ${destination || 'Not set'}`);

      const config = site.homepageConfig;

      // Check what needs updating
      const hasCategories = config?.categories && config.categories.length > 0;
      const hasDestination = config?.popularExperiences?.destination;

      console.log(`  Has categories: ${hasCategories ? `Yes (${config.categories.length})` : 'No'}`);
      console.log(`  Has destination: ${hasDestination ? `Yes (${config.popularExperiences.destination})` : 'No'}`);

      // Determine if update is needed
      const needsCategories = !hasCategories && niche;
      const needsDestination = !hasDestination && destination;

      if (!needsCategories && !needsDestination) {
        console.log(`  ✓ Config is complete, skipping`);
        skippedCount++;
        continue;
      }

      // Build updated config
      const updatedConfig = { ...config };

      if (needsCategories) {
        const categories = getCategoriesForNiche(niche);
        updatedConfig.categories = categories;
        console.log(`  → Adding ${categories.length} niche-specific categories`);
      }

      if (needsDestination) {
        updatedConfig.popularExperiences = {
          ...(updatedConfig.popularExperiences || {}),
          destination: destination,
        };
        console.log(`  → Setting destination to "${destination}"`);
      }

      if (isDryRun) {
        console.log(`  [DRY RUN] Would update homepage config`);
        updatedCount++;
        continue;
      }

      // Update the site
      try {
        await prisma.site.update({
          where: { id: site.id },
          data: {
            homepageConfig: updatedConfig,
          },
        });
        console.log(`  ✓ Updated successfully`);
        updatedCount++;
      } catch (error) {
        console.error(`  ✗ Error updating: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n========================================');
    console.log('Summary:');
    console.log(`  Total sites: ${sites.length}`);
    console.log(`  Updated: ${updatedCount}`);
    console.log(`  Skipped (already complete): ${skippedCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log('========================================');

  } catch (error) {
    console.error('Script error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
