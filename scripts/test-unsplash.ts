/**
 * Test script for Unsplash image fetching
 *
 * Run with: npx tsx scripts/test-unsplash.ts
 */

import 'dotenv/config';

// Inline the Unsplash service for testing (to avoid build issues)
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

if (!UNSPLASH_ACCESS_KEY) {
  console.error('ERROR: UNSPLASH_ACCESS_KEY not found in environment variables');
  console.log('Make sure you have set it in your .env file');
  process.exit(1);
}

interface UnsplashPhoto {
  id: string;
  urls: { regular: string; small: string };
  alt_description: string | null;
  description: string | null;
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
}

interface SearchResult {
  total: number;
  results: UnsplashPhoto[];
}

async function searchUnsplash(query: string): Promise<UnsplashPhoto[]> {
  const params = new URLSearchParams({
    query,
    per_page: '3',
    orientation: 'landscape',
    content_filter: 'high',
  });

  const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      'Accept-Version': 'v1',
    },
  });

  if (!response.ok) {
    throw new Error(`Unsplash API error: ${response.status}`);
  }

  const data = await response.json() as SearchResult;
  return data.results;
}

async function testLondonFoodTours() {
  console.log('\n🍽️  Testing Unsplash Images for London Food Tours\n');
  console.log('='.repeat(60));

  // Categories for a food tours site
  const categories = [
    { name: 'Wine Tasting', query: 'wine tasting London experience' },
    { name: 'Brewery Tours', query: 'craft brewery London beer' },
    { name: 'Fine Dining', query: 'fine dining London restaurant' },
    { name: 'Street Food', query: 'street food London market' },
    { name: 'Cooking Classes', query: 'cooking class London chef' },
    { name: 'Market Tours', query: 'Borough Market London food' },
  ];

  // Destinations (areas in London)
  const destinations = [
    { name: 'Soho', query: 'Soho London food travel' },
    { name: 'Borough Market', query: 'Borough Market London' },
    { name: 'Covent Garden', query: 'Covent Garden London' },
    { name: 'Shoreditch', query: 'Shoreditch London street' },
  ];

  console.log('\n📍 DESTINATIONS\n');

  for (const dest of destinations) {
    console.log(`\n--- ${dest.name} ---`);
    console.log(`Query: "${dest.query}"`);

    try {
      const photos = await searchUnsplash(dest.query);

      if (photos.length > 0) {
        const photo = photos[0];
        console.log(`✅ Found ${photos.length} images`);
        console.log(`   Image URL: ${photo.urls.regular.substring(0, 80)}...`);
        console.log(`   Thumbnail: ${photo.urls.small.substring(0, 80)}...`);
        console.log(`   Photographer: ${photo.user.name}`);
        console.log(`   Profile: ${photo.user.links.html}`);
        console.log(`   Alt text: ${photo.alt_description || 'N/A'}`);
      } else {
        console.log('❌ No images found');
      }
    } catch (error) {
      console.log(`❌ Error: ${error}`);
    }

    // Small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n\n🍴 CATEGORIES\n');

  for (const cat of categories) {
    console.log(`\n--- ${cat.name} ---`);
    console.log(`Query: "${cat.query}"`);

    try {
      const photos = await searchUnsplash(cat.query);

      if (photos.length > 0) {
        const photo = photos[0];
        console.log(`✅ Found ${photos.length} images`);
        console.log(`   Image URL: ${photo.urls.regular.substring(0, 80)}...`);
        console.log(`   Thumbnail: ${photo.urls.small.substring(0, 80)}...`);
        console.log(`   Photographer: ${photo.user.name}`);
        console.log(`   Profile: ${photo.user.links.html}`);
        console.log(`   Alt text: ${photo.alt_description || 'N/A'}`);
      } else {
        console.log('❌ No images found');
      }
    } catch (error) {
      console.log(`❌ Error: ${error}`);
    }

    // Small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('✨ Test complete!\n');
  console.log('Note: These images would be displayed with attribution:');
  console.log('"Photo by [Photographer Name] on Unsplash"\n');
}

// Run the test
testLondonFoodTours().catch(console.error);
