/**
 * Script to assign Unsplash images to site hero, destinations and categories
 * Run with: DATABASE_URL="..." node scripts/assign-unsplash-images.js
 *
 * This script ensures all active sites have:
 * - Hero background images with proper attribution
 * - Destination images with proper attribution
 * - Category images with proper attribution
 */

const { PrismaClient } = require('@prisma/client');

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || 'ZlewrGbzZiXP1mh-4ZBrMkQzZPJY4uL2jZTajFsze6Y';
const BASE_URL = 'https://api.unsplash.com';

async function searchUnsplash(query, options = {}) {
  const params = new URLSearchParams({
    query,
    per_page: String(options.perPage || 3),
    page: String(options.page || 1),
    orientation: options.orientation || 'landscape',
    content_filter: 'high',
  });

  console.log(`  [Unsplash] Searching for "${query}"`);

  const response = await fetch(`${BASE_URL}/search/photos?${params}`, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      'Accept-Version': 'v1',
    },
  });

  if (!response.ok) {
    console.error(`  [Unsplash] Search failed: ${response.status}`);
    return null;
  }

  const data = await response.json();

  if (data.results && data.results.length > 0) {
    const photo = data.results[0];
    const utmParams = 'utm_source=experience_marketplace&utm_medium=referral';

    return {
      imageUrl: photo.urls.regular,
      imageAttribution: {
        photographerName: photo.user.name,
        photographerUrl: `${photo.user.links.html}?${utmParams}`,
        unsplashUrl: `https://unsplash.com?${utmParams}`,
      },
    };
  }

  return null;
}

/**
 * Get a random image for hero backgrounds
 */
async function getRandomUnsplash(query, options = {}) {
  const params = new URLSearchParams({
    query,
    orientation: options.orientation || 'landscape',
    content_filter: 'high',
  });

  console.log(`  [Unsplash] Getting random image for "${query}"`);

  const response = await fetch(`${BASE_URL}/photos/random?${params}`, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      'Accept-Version': 'v1',
    },
  });

  if (!response.ok) {
    console.error(`  [Unsplash] Random image failed: ${response.status}`);
    return null;
  }

  const photo = await response.json();
  const utmParams = 'utm_source=experience_marketplace&utm_medium=referral';

  return {
    imageUrl: photo.urls.regular,
    imageAttribution: {
      photographerName: photo.user.name,
      photographerUrl: `${photo.user.links.html}?${utmParams}`,
      unsplashUrl: `https://unsplash.com?${utmParams}`,
    },
  };
}

/**
 * Build hero image search query based on niche and location
 */
function buildHeroImageQuery(niche, location) {
  const queryParts = [];

  if (location) {
    const city = location.split(',')[0].trim();
    queryParts.push(city);
  }

  const nicheTerms = {
    'food tours': 'food market culinary',
    'food-tours': 'food market culinary',
    'wine tours': 'vineyard wine',
    'adventure tours': 'adventure nature scenic',
    'walking tours': 'city street architecture',
    'cultural tours': 'cultural heritage landmark',
    'boat tours': 'waterfront harbor boats',
    'museum tickets': 'museum art gallery',
    'tours': 'travel destination scenic',
  };

  if (niche) {
    const nicheLower = niche.toLowerCase();
    const nicheQuery = nicheTerms[nicheLower] || niche;
    queryParts.push(nicheQuery);
  } else {
    queryParts.push('travel destination');
  }

  return queryParts.join(' ');
}

async function getImageForDestination(name, location) {
  // Try multiple query variants
  const queries = [
    `${name} ${location}`,
    name,
    `${name} street`,
  ];

  for (const query of queries) {
    const result = await searchUnsplash(query);
    if (result) return result;
    await sleep(100);
  }

  return null;
}

async function getImageForCategory(name, location) {
  const query = `${name} ${location} experience`;
  return await searchUnsplash(query);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processSite(prisma, siteId, siteName, location, niche) {
  console.log(`\n========================================`);
  console.log(`Processing: ${siteName}`);
  console.log(`========================================`);

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { homepageConfig: true }
  });

  if (!site || !site.homepageConfig) {
    console.error('Site or homepageConfig not found');
    return;
  }

  const config = site.homepageConfig;

  // Process hero background image
  console.log(`\nProcessing hero section...`);
  if (!config.hero) {
    config.hero = {};
  }
  if (!config.hero.backgroundImage) {
    console.log(`  Getting hero background image...`);
    const heroQuery = buildHeroImageQuery(niche, location);
    const heroData = await getRandomUnsplash(heroQuery);
    if (heroData) {
      config.hero.backgroundImage = heroData.imageUrl;
      config.hero.backgroundImageAttribution = heroData.imageAttribution;
      console.log(`    ✓ Hero image by ${heroData.imageAttribution.photographerName}`);
    } else {
      console.log(`    ✗ No hero image found`);
    }
    await sleep(500);
  } else {
    console.log(`  Skipping hero (already has image)`);
  }

  // Process destinations
  console.log(`\nProcessing ${config.destinations?.length || 0} destinations...`);
  if (config.destinations) {
    for (let i = 0; i < config.destinations.length; i++) {
      const dest = config.destinations[i];
      if (!dest.imageUrl) {
        console.log(`  Getting image for destination: ${dest.name}`);
        const imageData = await getImageForDestination(dest.name, location);
        if (imageData) {
          config.destinations[i] = { ...dest, ...imageData };
          console.log(`    ✓ Found image by ${imageData.imageAttribution.photographerName}`);
        } else {
          console.log(`    ✗ No image found`);
        }
        await sleep(500); // Rate limiting
      } else {
        console.log(`  Skipping ${dest.name} (already has image)`);
      }
    }
  }

  // Process categories
  console.log(`\nProcessing ${config.categories?.length || 0} categories...`);
  if (config.categories) {
    for (let i = 0; i < config.categories.length; i++) {
      const cat = config.categories[i];
      if (!cat.imageUrl) {
        console.log(`  Getting image for category: ${cat.name}`);
        const imageData = await getImageForCategory(cat.name, location);
        if (imageData) {
          config.categories[i] = { ...cat, ...imageData };
          console.log(`    ✓ Found image by ${imageData.imageAttribution.photographerName}`);
        } else {
          console.log(`    ✗ No image found`);
        }
        await sleep(500); // Rate limiting
      } else {
        console.log(`  Skipping ${cat.name} (already has image)`);
      }
    }
  }

  // Update the site
  console.log(`\nUpdating site in database...`);
  await prisma.site.update({
    where: { id: siteId },
    data: { homepageConfig: config }
  });

  console.log(`✓ ${siteName} updated successfully!`);

  // Print summary
  console.log(`\n--- Summary for ${siteName} ---`);
  console.log('Hero:');
  console.log(`  Background: ${config.hero?.backgroundImageAttribution ? config.hero.backgroundImageAttribution.photographerName : 'No image'}`);
  console.log('Destinations:');
  config.destinations?.forEach(d => {
    console.log(`  ${d.name}: ${d.imageAttribution ? d.imageAttribution.photographerName : 'No image'}`);
  });
  console.log('Categories:');
  config.categories?.forEach(c => {
    console.log(`  ${c.name}: ${c.imageAttribution ? c.imageAttribution.photographerName : 'No image'}`);
  });
}

async function main() {
  const prisma = new PrismaClient();

  try {
    // Get all active sites with their SEO opportunities to determine niche
    console.log('Fetching all active sites...\n');

    const sites = await prisma.site.findMany({
      where: {
        status: { in: ['ACTIVE', 'DRAFT'] },
        homepageConfig: { not: null }
      },
      select: {
        id: true,
        name: true,
        homepageConfig: true,
        seoOpportunities: {
          select: {
            location: true,
            niche: true
          },
          take: 1
        }
      }
    });

    console.log(`Found ${sites.length} sites to process\n`);

    for (const site of sites) {
      const opportunity = site.seoOpportunities[0];
      const location = opportunity?.location || '';
      const niche = opportunity?.niche || '';

      await processSite(
        prisma,
        site.id,
        site.name,
        location,
        niche
      );
    }

    console.log('\n========================================');
    console.log('All sites processed successfully!');
    console.log('========================================');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
