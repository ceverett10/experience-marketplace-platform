/**
 * Add food tour categories to London Food Tours site
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { enrichHomepageConfigWithImages } from '../packages/jobs/src/services/unsplash-images.js';

const prisma = new PrismaClient();

// Food tour specific categories
const FOOD_TOUR_CATEGORIES = [
  { name: 'Wine Tasting', slug: 'wine-tasting', icon: '🍷', description: 'Discover exceptional wines with guided tastings and vineyard experiences.' },
  { name: 'Brewery Tours', slug: 'brewery-tours', icon: '🍺', description: 'Explore craft breweries and sample unique local beers with expert guides.' },
  { name: 'Fine Dining', slug: 'fine-dining', icon: '🍽️', description: 'Experience world-class restaurants and gourmet cuisine from top chefs.' },
  { name: 'Street Food', slug: 'street-food', icon: '🌮', description: 'Discover authentic street food and hidden culinary gems in local markets.' },
  { name: 'Cooking Classes', slug: 'cooking-classes', icon: '👨‍🍳', description: 'Learn to cook local dishes with expert chefs and take home new skills.' },
  { name: 'Market Tours', slug: 'market-tours', icon: '🧺', description: 'Explore vibrant food markets and taste fresh, local produce.' },
];

async function addCategories() {
  console.log('\n🍴 Adding Food Tour Categories to London Food Tours\n');
  console.log('='.repeat(60));

  const site = await prisma.site.findFirst({
    where: { slug: 'london-food-tours' },
    select: { id: true, homepageConfig: true }
  });

  if (!site) {
    console.log('❌ Site not found');
    return;
  }

  console.log(`✅ Found site: ${site.id}`);

  const config = (site.homepageConfig || {}) as any;

  // Add categories to config
  config.categories = FOOD_TOUR_CATEGORIES;

  // Enrich with Unsplash images
  console.log('\n🖼️  Fetching Unsplash images for categories...\n');
  const enriched = await enrichHomepageConfigWithImages(
    { categories: config.categories },
    { location: 'London', niche: 'food tours' }
  );

  config.categories = enriched.categories;

  // Update database
  await prisma.site.update({
    where: { id: site.id },
    data: { homepageConfig: config }
  });

  console.log('\n✅ Categories added with images:\n');
  for (const cat of config.categories) {
    const hasImage = cat.imageUrl ? '✅' : '❌';
    const photographer = cat.imageAttribution?.photographerName || 'No image';
    console.log(`   ${hasImage} ${cat.name} - Photo by: ${photographer}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Done! Refresh your website to see the categories.\n');

  await prisma.$disconnect();
}

addCategories().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
