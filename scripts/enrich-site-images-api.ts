/**
 * Script to enrich an existing site's homepage config with Unsplash images
 * via the Admin API (no direct database access required)
 *
 * Run with: npx tsx scripts/enrich-site-images-api.ts
 *
 * Prerequisites:
 * - Set ADMIN_API_URL in .env (e.g., http://localhost:3001 or your deployed admin URL)
 * - Set SITE_ID in .env or pass as argument
 */

import 'dotenv/config';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:3001';
const SITE_ID = process.argv[2] || process.env.SITE_ID;

async function regenerateHomepageConfig(siteId: string) {
  console.log('\n🖼️  Regenerating Homepage Config with Unsplash Images\n');
  console.log('='.repeat(60));
  console.log(`\nAdmin API URL: ${ADMIN_API_URL}`);
  console.log(`Site ID: ${siteId}`);

  try {
    // POST to regenerate homepage config (this calls generateHomepageConfig which includes Unsplash)
    console.log('\n📤 Sending regeneration request...');

    const response = await fetch(`${ADMIN_API_URL}/api/sites/${siteId}/homepage-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (result.success) {
      console.log('\n✅ Homepage config regenerated successfully!');

      const config = result.site?.homepageConfig;
      if (config) {
        console.log('\n📊 Updated config:');

        if (config.destinations) {
          console.log(`\n   DESTINATIONS (${config.destinations.length}):`);
          for (const dest of config.destinations) {
            const hasImage = dest.imageUrl ? '✅' : '❌';
            const photographer = dest.imageAttribution?.photographerName || 'No image';
            console.log(`   ${hasImage} ${dest.name} - Photo by: ${photographer}`);
          }
        }

        if (config.categories) {
          console.log(`\n   CATEGORIES (${config.categories.length}):`);
          for (const cat of config.categories) {
            const hasImage = cat.imageUrl ? '✅' : '❌';
            const photographer = cat.imageAttribution?.photographerName || 'No image';
            console.log(`   ${hasImage} ${cat.name} - Photo by: ${photographer}`);
          }
        }
      }

      console.log('\n' + '='.repeat(60));
      console.log('✨ Done! Refresh your website to see the images.\n');
    } else {
      console.error('❌ Failed:', result.error || 'Unknown error');
    }
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure the Admin API is running');
    console.log('2. Check the ADMIN_API_URL is correct');
    console.log('3. Verify the site ID exists');
    console.log('\nAlternatively, you can:');
    console.log('- Use the Admin UI to regenerate the homepage config');
    console.log(
      '- Start PostgreSQL locally and run: npx tsx scripts/enrich-site-images.ts <site-slug>'
    );
  }
}

if (!SITE_ID) {
  console.log('Usage: npx tsx scripts/enrich-site-images-api.ts <site-id>');
  console.log('\nOr set SITE_ID in your .env file');
  console.log('\nTo find your site ID:');
  console.log('1. Check the Admin UI');
  console.log('2. Look in your database');
  console.log('3. Check the URL when viewing a site in the admin panel');
  process.exit(1);
}

regenerateHomepageConfig(SITE_ID);
