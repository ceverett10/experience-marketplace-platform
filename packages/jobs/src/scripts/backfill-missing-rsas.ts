/**
 * Backfill Missing RSAs: Create responsive search ads for ad groups that have
 * keywords but no ads.
 *
 * During the restructure migration, some ad groups were created successfully
 * (with keywords) but RSA creation was skipped due to API quota limits.
 * This script identifies those ad groups and creates RSAs for them.
 *
 * Flags:
 *   --dry-run   Show what would change without making API calls
 *   --limit=N   Only process first N ad groups
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/backfill-missing-rsas.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/backfill-missing-rsas.ts
 *
 * On Heroku:
 *   heroku run "npx -y tsx packages/jobs/src/scripts/backfill-missing-rsas.ts --dry-run" \
 *     --app holibob-experiences-demand-gen
 */

import { PrismaClient } from '@prisma/client';
import {
  getConfig,
  apiRequest,
  flattenStreamResults,
  createResponsiveSearchAd,
} from '../services/google-ads-client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : undefined;

// ---------------------------------------------------------------------------
// Destination map for RSA generation
// ---------------------------------------------------------------------------

const DESTINATION_REGION_MAP: Record<string, string> = {
  london: 'UK & Ireland',
  edinburgh: 'UK & Ireland',
  liverpool: 'UK & Ireland',
  scotland: 'UK & Ireland',
  cardiff: 'UK & Ireland',
  dublin: 'UK & Ireland',
  dingle: 'UK & Ireland',
  newport: 'UK & Ireland',
  cotswolds: 'UK & Ireland',
  bath: 'UK & Ireland',
  york: 'UK & Ireland',
  windsor: 'UK & Ireland',
  madrid: 'Europe',
  barcelona: 'Europe',
  bordeaux: 'Europe',
  paris: 'Europe',
  munich: 'Europe',
  hamburg: 'Europe',
  santander: 'Europe',
  toledo: 'Europe',
  amsterdam: 'Europe',
  lisbon: 'Europe',
  rome: 'Europe',
  florence: 'Europe',
  venice: 'Europe',
  berlin: 'Europe',
  vienna: 'Europe',
  prague: 'Europe',
  athens: 'Europe',
  olympia: 'Europe',
  catania: 'Europe',
  bali: 'Asia-Pacific',
  yogyakarta: 'Asia-Pacific',
  'kuala lumpur': 'Asia-Pacific',
  hanoi: 'Asia-Pacific',
  thailand: 'Asia-Pacific',
  bangkok: 'Asia-Pacific',
  bentota: 'Asia-Pacific',
  tokyo: 'Asia-Pacific',
  osaka: 'Asia-Pacific',
  kyoto: 'Asia-Pacific',
  singapore: 'Asia-Pacific',
  chicago: 'Americas',
  'montego bay': 'Americas',
  recife: 'Americas',
  montevideo: 'Americas',
  bermuda: 'Americas',
  cartagena: 'Americas',
  tampa: 'Americas',
  'new york': 'Americas',
  honolulu: 'Americas',
  cancun: 'Americas',
  jerusalem: 'Middle East & Africa',
  dakar: 'Middle East & Africa',
  'sharm el sheikh': 'Middle East & Africa',
  marrakech: 'Middle East & Africa',
  'cape town': 'Middle East & Africa',
};

// ---------------------------------------------------------------------------
// RSA generation helpers (copied from google-ads-restructure.ts)
// ---------------------------------------------------------------------------

interface ProductStats {
  count: number;
  minPrice: number | null;
  avgRating: number | null;
  totalReviewCount: number;
}

async function getProductStatsForKeywords(keywords: string[]): Promise<ProductStats> {
  const cities = new Set<string>();

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    for (const dest of Object.keys(DESTINATION_REGION_MAP)) {
      if (kwLower.includes(dest)) cities.add(dest);
    }
  }

  const where: Record<string, unknown> = {};
  if (cities.size > 0) {
    where['city'] = {
      in: Array.from(cities).map((c) => c.charAt(0).toUpperCase() + c.slice(1)),
      mode: 'insensitive',
    };
  }

  try {
    const products = await prisma.product.aggregate({
      where: Object.keys(where).length > 0 ? (where as any) : undefined,
      _count: true,
      _min: { priceFrom: true },
      _avg: { rating: true },
      _sum: { reviewCount: true },
    });

    return {
      count: products._count,
      minPrice: products._min.priceFrom ? Number(products._min.priceFrom) : null,
      avgRating: products._avg.rating ? Math.round(products._avg.rating * 10) / 10 : null,
      totalReviewCount: Number(products._sum.reviewCount || 0),
    };
  } catch {
    return { count: 0, minPrice: null, avgRating: null, totalReviewCount: 0 };
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  const truncated = str.substring(0, max);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > max * 0.6 ? truncated.substring(0, lastSpace) : truncated;
}

function toTitleCase(str: string): string {
  const minor = new Set(['a', 'an', 'the', 'and', 'or', 'in', 'of', 'to', 'for', 'on', 'at']);
  return str
    .split(' ')
    .map((w, i) => {
      if (i === 0 || !minor.has(w.toLowerCase())) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }
      return w.toLowerCase();
    })
    .join(' ');
}

function extractDestination(keyword: string): string {
  const kw = keyword.toLowerCase();
  const cleaned = kw
    .replace(
      /^(things to do in|what to do in|best things to do in|top things to do in|activities in|tours in|experiences in|best tours in|book activities in)\s+/i,
      ''
    )
    .replace(
      /\s+(tours?|tickets?|activities|experiences|things to do|excursions|day trips?|adventures?|walks?)\s*$/i,
      ''
    )
    .trim();
  return toTitleCase(cleaned || keyword);
}

function generateHeadlines(primaryKeyword: string, stats: ProductStats): string[] {
  const dest = extractDestination(primaryKeyword);
  const headlines: string[] = [];

  headlines.push(truncate(`${dest} Tours & Activities`, 30));
  headlines.push(truncate(`Best ${dest} Experiences`, 30));
  headlines.push(truncate(`Explore ${dest} Today`, 30));

  if (stats.minPrice != null) {
    headlines.push(truncate(`From £${Math.round(stats.minPrice)}`, 30));
  } else {
    headlines.push(truncate('Great Value Experiences', 30));
  }
  headlines.push('Free Cancellation');
  if (stats.totalReviewCount > 100) {
    headlines.push(truncate(`${stats.totalReviewCount.toLocaleString()}+ Reviews`, 30));
  } else {
    headlines.push('Verified Guest Reviews');
  }

  headlines.push('Instant Confirmation');
  if (stats.avgRating != null && stats.avgRating >= 4.0) {
    headlines.push(truncate(`${stats.avgRating}/5 Average Rating`, 30));
  } else {
    headlines.push('Top-Rated Providers');
  }
  headlines.push('Secure Online Booking');

  if (stats.count > 10) {
    headlines.push(truncate(`Compare ${stats.count}+ Options`, 30));
  } else {
    headlines.push('Compare & Book Online');
  }
  headlines.push('Trusted Local Providers');
  headlines.push(truncate(`Book ${dest} Online`, 30));
  headlines.push(truncate(`Top ${dest} Tours`, 30));
  headlines.push(truncate(`${dest} Day Trips`, 30));
  headlines.push('Best Prices Guaranteed');

  const seen = new Set(headlines.filter((h) => h.length <= 30));
  const unique = Array.from(seen);
  const fillers = [
    truncate(`${dest} Activities`, 30),
    'Book With Confidence',
    'Expert Local Guides',
    'Skip the Queue',
    'Easy Online Booking',
    'Mobile-Friendly Booking',
    'Local Expert Knowledge',
    'Flexible Cancellation',
    'Handpicked Experiences',
    'Award-Winning Service',
  ];
  for (const filler of fillers) {
    if (unique.length >= 15) break;
    if (!seen.has(filler)) {
      seen.add(filler);
      unique.push(filler);
    }
  }
  return unique.slice(0, 15);
}

function generateDescriptions(primaryKeyword: string, stats: ProductStats): string[] {
  const dest = extractDestination(primaryKeyword);
  const descriptions: string[] = [];

  if (stats.count > 0 && stats.minPrice != null) {
    descriptions.push(
      truncate(
        `${stats.count}+ experiences in ${dest} from £${Math.round(stats.minPrice)}. Instant booking confirmation.`,
        90
      )
    );
  } else {
    descriptions.push(
      truncate(
        `Discover the best experiences in ${dest}. Compare options and book instantly online.`,
        90
      )
    );
  }

  if (stats.avgRating != null && stats.totalReviewCount > 50) {
    descriptions.push(
      truncate(
        `Top-rated ${dest} tours rated ${stats.avgRating}/5 by ${stats.totalReviewCount.toLocaleString()}+ travellers. Book today.`,
        90
      )
    );
  } else {
    descriptions.push(
      truncate(
        `Top-rated ${dest} tours from trusted local providers. Read reviews and book securely.`,
        90
      )
    );
  }

  descriptions.push(
    truncate(
      `Compare ${dest} experiences from trusted local providers. Best prices, free cancellation.`,
      90
    )
  );

  descriptions.push(
    truncate(
      `Explore ${dest} with verified local guides. Instant confirmation, secure payment.`,
      90
    )
  );

  return descriptions.slice(0, 4);
}

function buildLandingUrl(domain: string, campaignName: string, primaryKeyword: string): string {
  const base = `https://${domain}`;
  const dest = extractDestination(primaryKeyword).toLowerCase().replace(/\s+/g, '-');

  if (campaignName.includes('Destination Discovery')) {
    return `${base}/destinations/${dest}`;
  }
  if (campaignName.includes('Branded')) {
    return `${base}/experiences?q=${encodeURIComponent(primaryKeyword)}`;
  }
  return `${base}/experiences?q=${encodeURIComponent(primaryKeyword)}`;
}

function buildDisplayPath(
  campaignName: string,
  primaryKeyword: string
): { path1: string; path2: string } {
  const dest = extractDestination(primaryKeyword)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .substring(0, 15);

  if (campaignName.includes('Destination Discovery')) {
    return { path1: 'destinations', path2: dest };
  }
  if (campaignName.includes('Branded')) {
    return { path1: 'experiences', path2: dest };
  }
  // Extract category from campaign name
  const category = campaignName.split(/[—–-]/)[0]!.trim().toLowerCase().replace(/\s+/g, '-');
  return { path1: category.substring(0, 15), path2: dest };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Backfill Missing RSAs ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} ad groups`);
  console.log();

  const config = getConfig();
  if (!config) {
    console.error('Google Ads config not available');
    process.exit(1);
  }

  // Get primary domain for landing URLs
  const site = await prisma.site.findFirst({
    select: { primaryDomain: true, name: true },
  });
  const domain = site?.primaryDomain || 'experiencess.com';

  // Step 1: Get all ad groups from non-removed campaigns
  console.log('Querying ad groups from Google Ads...');
  const agQuery =
    'SELECT campaign.id, campaign.name, ad_group.id, ad_group.name FROM ad_group WHERE campaign.status != "REMOVED" AND ad_group.status != "REMOVED"';
  const agRows = flattenStreamResults<{
    campaign: { id: string; name: string };
    adGroup: { id: string; name: string };
  }>(await apiRequest(config, 'POST', '/googleAds:searchStream', { query: agQuery }));

  console.log(`Found ${agRows.length} ad groups total`);

  // Step 2: Get ad groups that already have ads
  console.log('Querying ad groups with existing ads...');
  const adQuery =
    'SELECT ad_group.id FROM ad_group_ad WHERE campaign.status != "REMOVED" AND ad_group_ad.status != "REMOVED"';
  const adRows = flattenStreamResults<{ adGroup: { id: string } }>(
    await apiRequest(config, 'POST', '/googleAds:searchStream', { query: adQuery })
  );

  const agWithAds = new Set(adRows.map((r) => r.adGroup.id));
  console.log(`${agWithAds.size} ad groups already have ads`);

  // Step 3: Filter to ad groups missing ads
  let missingAds = agRows.filter((r) => !agWithAds.has(r.adGroup.id));
  console.log(`${missingAds.length} ad groups need RSAs\n`);

  if (LIMIT && missingAds.length > LIMIT) {
    missingAds = missingAds.slice(0, LIMIT);
    console.log(`Processing first ${LIMIT} only\n`);
  }

  if (missingAds.length === 0) {
    console.log('All ad groups have ads — nothing to do.');
    await prisma.$disconnect();
    return;
  }

  // Step 4: For each ad group missing ads, get its keywords and create an RSA
  let created = 0;
  let failed = 0;

  for (let i = 0; i < missingAds.length; i++) {
    const ag = missingAds[i]!;
    const label = `[${i + 1}/${missingAds.length}] ${ag.campaign.name} / ${ag.adGroup.name}`;

    // Get keywords for this ad group
    const kwQuery = `SELECT ad_group_criterion.keyword.text FROM ad_group_criterion WHERE ad_group.id = ${ag.adGroup.id} AND ad_group_criterion.type = "KEYWORD" AND ad_group_criterion.status != "REMOVED"`;
    let kwRows: Array<{ adGroupCriterion: { keyword: { text: string } } }>;
    try {
      kwRows = flattenStreamResults<{
        adGroupCriterion: { keyword: { text: string } };
      }>(await apiRequest(config, 'POST', '/googleAds:searchStream', { query: kwQuery }));
    } catch (error) {
      console.error(
        `${label} — Failed to get keywords: ${error instanceof Error ? error.message : error}`
      );
      failed++;
      continue;
    }

    if (kwRows.length === 0) {
      console.log(`${label} — No keywords, skipping`);
      continue;
    }

    // Deduplicate keywords (same keyword appears in PHRASE + EXACT match)
    const uniqueKeywords = Array.from(new Set(kwRows.map((r) => r.adGroupCriterion.keyword.text)));
    const primaryKeyword = uniqueKeywords[0]!;

    // Generate RSA content
    const stats = await getProductStatsForKeywords(uniqueKeywords);
    const headlines = generateHeadlines(primaryKeyword, stats);
    const descriptions = generateDescriptions(primaryKeyword, stats);
    const finalUrl = buildLandingUrl(domain, ag.campaign.name, primaryKeyword);
    const displayPath = buildDisplayPath(ag.campaign.name, primaryKeyword);

    if (DRY_RUN) {
      console.log(
        `${label} — Would create RSA (${uniqueKeywords.length} keywords, primary: "${primaryKeyword}")`
      );
      created++;
      continue;
    }

    try {
      const result = await createResponsiveSearchAd({
        adGroupId: ag.adGroup.id,
        headlines,
        descriptions,
        finalUrl,
        path1: displayPath.path1,
        path2: displayPath.path2,
      });

      if (result) {
        created++;
        console.log(`${label} — RSA created (ad ${result.adId})`);
      } else {
        failed++;
        console.log(`${label} — RSA creation returned null`);
      }
    } catch (error) {
      failed++;
      console.error(`${label} — ERROR: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Ad groups processed: ${missingAds.length}`);
  console.log(`RSAs created: ${created}`);
  console.log(`Failed: ${failed}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
