/**
 * Batch enrich all sites missing hero/destination/category images with Unsplash
 *
 * Run on Heroku: heroku run node scripts/batch-enrich-images.js --app holibob-experiences-demand-gen
 *
 * Requires UNSPLASH_ACCESS_KEY to be set in the environment.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const UNSPLASH_BASE = 'https://api.unsplash.com';

if (!UNSPLASH_ACCESS_KEY) {
  console.error('ERROR: UNSPLASH_ACCESS_KEY not set');
  process.exit(1);
}

// Niche-to-query mapping for hero images
const NICHE_TERMS = {
  'food tours': 'food market culinary',
  'food-tours': 'food market culinary',
  'wine tours': 'vineyard wine',
  'adventure tours': 'adventure nature scenic',
  'walking tours': 'city street architecture',
  'cultural tours': 'cultural heritage landmark',
  'boat tours': 'waterfront harbor boats',
  'museum tickets': 'museum art gallery',
  tours: 'travel destination scenic',
  honeymoon: 'romantic couple travel',
  bachelorette: 'celebration party friends',
  anniversary: 'romantic celebration travel',
  solo: 'solo traveler adventure',
};

function buildHeroQuery(niche, location) {
  const parts = [];
  if (location) {
    const city = location.split(',')[0].trim();
    if (city) parts.push(city);
  }
  if (niche) {
    const nicheLower = niche.toLowerCase();
    const match = Object.entries(NICHE_TERMS).find(([key]) => nicheLower.includes(key));
    parts.push(match ? match[1] : niche);
  } else {
    parts.push('travel destination');
  }
  return parts.join(' ');
}

const UTM = 'utm_source=experience_marketplace&utm_medium=referral';

function mapPhoto(photo) {
  return {
    url: photo.urls.regular,
    thumbnailUrl: photo.urls.small,
    alt: photo.alt_description || photo.description || 'Travel image',
    attribution: {
      photographerName: photo.user.name,
      photographerUrl: `${photo.user.links.html}?${UTM}`,
      unsplashUrl: `https://unsplash.com?${UTM}`,
    },
  };
}

async function searchUnsplash(query, perPage = 3) {
  const params = new URLSearchParams({
    query,
    per_page: String(perPage),
    orientation: 'landscape',
    content_filter: 'high',
  });

  const res = await fetch(`${UNSPLASH_BASE}/search/photos?${params}`, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      'Accept-Version': 'v1',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403) {
      console.error(`  Rate limited! Status: ${res.status}`);
      return null; // Signal rate limit
    }
    console.error(`  Unsplash search error ${res.status}: ${text}`);
    return [];
  }

  const data = await res.json();
  return data.results || [];
}

async function getRandomPhoto(query) {
  const params = new URLSearchParams({
    query,
    orientation: 'landscape',
    content_filter: 'high',
  });

  const res = await fetch(`${UNSPLASH_BASE}/photos/random?${params}`, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      'Accept-Version': 'v1',
    },
  });

  if (!res.ok) {
    if (res.status === 403) {
      console.error(`  Rate limited on random photo!`);
      return null;
    }
    return undefined;
  }

  return await res.json();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichSite(site) {
  const config = site.homepageConfig || {};
  const opportunity = site.opportunities && site.opportunities[0];
  const niche = opportunity ? opportunity.niche : null;
  const location = opportunity ? opportunity.location : null;
  let updated = false;
  let requestCount = 0;

  console.log(`\n--- ${site.name} (${site.slug}) ---`);
  console.log(`  Niche: ${niche || 'unknown'}, Location: ${location || 'unknown'}`);

  // 1. Hero image
  if (config.hero && !config.hero.backgroundImage) {
    const heroQuery = buildHeroQuery(niche, location);
    console.log(`  Hero: searching "${heroQuery}"`);
    const photo = await getRandomPhoto(heroQuery);
    requestCount++;

    if (photo === null) return { updated: false, rateLimited: true, requestCount };

    if (photo && photo.urls) {
      const mapped = mapPhoto(photo);
      config.hero.backgroundImage = mapped.url;
      config.hero.backgroundImageAttribution = mapped.attribution;
      console.log(`  Hero: OK (by ${mapped.attribution.photographerName})`);
      updated = true;
    } else {
      console.log(`  Hero: no image found`);
    }
    await delay(300);
  } else if (config.hero && config.hero.backgroundImage) {
    console.log(`  Hero: already has image`);
  } else {
    console.log(`  Hero: no hero config`);
  }

  // 2. Destinations
  if (config.destinations) {
    const needImages = config.destinations.filter((d) => !d.imageUrl);
    if (needImages.length > 0) {
      console.log(`  Destinations: ${needImages.length} need images`);
      for (const dest of needImages) {
        // Build query with location context
        let query = dest.name;
        if (location && !dest.name.toLowerCase().includes(location.toLowerCase().split(',')[0])) {
          query = `${dest.name} ${location.split(',')[0].trim()}`;
        }

        const results = await searchUnsplash(query, 2);
        requestCount++;

        if (results === null) return { updated, rateLimited: true, requestCount };

        if (results.length > 0) {
          const mapped = mapPhoto(results[0]);
          dest.imageUrl = mapped.url;
          dest.imageAttribution = mapped.attribution;
          console.log(`    ${dest.name}: OK`);
          updated = true;
        } else {
          // Fallback: try just the name
          const fallback = await searchUnsplash(dest.name, 2);
          requestCount++;
          if (fallback === null) return { updated, rateLimited: true, requestCount };
          if (fallback.length > 0) {
            const mapped = mapPhoto(fallback[0]);
            dest.imageUrl = mapped.url;
            dest.imageAttribution = mapped.attribution;
            console.log(`    ${dest.name}: OK (fallback)`);
            updated = true;
          } else {
            console.log(`    ${dest.name}: no image found`);
          }
        }
        await delay(300);
      }
    } else {
      console.log(`  Destinations: all have images`);
    }
  }

  // 3. Categories
  if (config.categories) {
    const needImages = config.categories.filter((c) => !c.imageUrl);
    if (needImages.length > 0) {
      console.log(`  Categories: ${needImages.length} need images`);
      for (const cat of needImages) {
        let query = `${cat.name} experience`;
        if (location) {
          query = `${cat.name} ${location.split(',')[0].trim()} experience`;
        }

        const results = await searchUnsplash(query, 2);
        requestCount++;

        if (results === null) return { updated, rateLimited: true, requestCount };

        if (results.length > 0) {
          const mapped = mapPhoto(results[0]);
          cat.imageUrl = mapped.url;
          cat.imageAttribution = mapped.attribution;
          console.log(`    ${cat.name}: OK`);
          updated = true;
        } else {
          console.log(`    ${cat.name}: no image found`);
        }
        await delay(300);
      }
    } else {
      console.log(`  Categories: all have images`);
    }
  }

  // 4. Save to database
  if (updated) {
    await prisma.site.update({
      where: { id: site.id },
      data: { homepageConfig: config },
    });
    console.log(`  SAVED (${requestCount} API requests)`);
  } else {
    console.log(`  No changes needed`);
  }

  return { updated, rateLimited: false, requestCount };
}

async function main() {
  console.log('=== Batch Unsplash Image Enrichment ===\n');

  // Get all sites with their homepage configs and opportunities
  const sites = await prisma.site.findMany({
    include: {
      opportunities: {
        take: 1,
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${sites.length} total sites\n`);

  // Filter to sites that need images
  const sitesNeedingImages = sites.filter((site) => {
    const hc = site.homepageConfig;
    if (!hc) return false;

    const needsHero = hc.hero && !hc.hero.backgroundImage;
    const needsDestImages = hc.destinations && hc.destinations.some((d) => !d.imageUrl);
    const needsCatImages = hc.categories && hc.categories.some((c) => !c.imageUrl);

    return needsHero || needsDestImages || needsCatImages;
  });

  console.log(`${sitesNeedingImages.length} sites need image enrichment:\n`);
  sitesNeedingImages.forEach((s) => console.log(`  - ${s.slug}`));

  let totalRequests = 0;
  let enrichedCount = 0;

  for (const site of sitesNeedingImages) {
    const result = await enrichSite(site);
    totalRequests += result.requestCount;

    if (result.rateLimited) {
      console.error('\n!!! Rate limited by Unsplash. Try again later.');
      console.log(`Processed ${enrichedCount} sites, ${totalRequests} API requests so far.`);
      break;
    }

    if (result.updated) enrichedCount++;

    // Delay between sites to be nice to the API
    await delay(1000);
  }

  console.log('\n=== Summary ===');
  console.log(`Sites enriched: ${enrichedCount}`);
  console.log(`Total API requests: ${totalRequests}`);
  console.log('Done!\n');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
