/**
 * Phase 0: Enrich Campaign Mapping
 *
 * Auto-classifies existing FACEBOOK AdCampaigns by campaign group and region
 * using supplier cities, product geographic data, keywords, and campaign names.
 *
 * This populates the `campaignGroup` field on each AdCampaign record and
 * generates a CSV summary for review before running the migration script.
 *
 * Usage:
 *   heroku run "node scripts/enrich-campaign-mapping.js" --app holibob-experiences-demand-gen
 *   node scripts/enrich-campaign-mapping.js                   # local with DATABASE_URL
 *   node scripts/enrich-campaign-mapping.js --dry-run          # preview only, no DB writes
 *   node scripts/enrich-campaign-mapping.js --csv              # output CSV to stdout
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Category keyword patterns (mirrors paid-traffic.ts metaConsolidated.categoryPatterns)
// ---------------------------------------------------------------------------
const CATEGORY_PATTERNS = {
  'Branded – Harry Potter Tours': ['harry potter'],
  'Branded – London Food Tours': ['london food tour'],
  'Adventure & Outdoor': [
    'adventure',
    'hiking',
    'safari',
    'trek',
    'outdoor',
    'climb',
    'expedition',
    'wildlife',
  ],
  'Food, Drink & Culinary': [
    'food tour',
    'culinary',
    'wine tast',
    'cooking class',
    'gastro',
    'street food',
  ],
  'Boats, Sailing & Water': [
    'boat',
    'sailing',
    'yacht',
    'cruise',
    'diving',
    'snorkel',
    'kayak',
    'surf',
    'water sport',
  ],
  'Transfers & Transport': [
    'transfer',
    'airport',
    'taxi',
    'shuttle',
    'limo',
    'chauffeur',
    'private car',
  ],
  'Cultural & Sightseeing': [
    'museum',
    'gallery',
    'history',
    'cultural',
    'sightseeing',
    'monument',
    'heritage',
    'walking tour',
  ],
};

// ---------------------------------------------------------------------------
// Country code → region (mirrors paid-traffic.ts metaConsolidated.regionMap)
// ---------------------------------------------------------------------------
const REGION_MAP = {
  GB: 'UK & Ireland',
  IE: 'UK & Ireland',
  DE: 'Europe',
  FR: 'Europe',
  ES: 'Europe',
  IT: 'Europe',
  NL: 'Europe',
  PT: 'Europe',
  AT: 'Europe',
  CH: 'Europe',
  SE: 'Europe',
  NO: 'Europe',
  DK: 'Europe',
  GR: 'Europe',
  CZ: 'Europe',
  PL: 'Europe',
  HU: 'Europe',
  HR: 'Europe',
  RO: 'Europe',
  BG: 'Europe',
  FI: 'Europe',
  BE: 'Europe',
  US: 'Americas',
  CA: 'Americas',
  MX: 'Americas',
  BR: 'Americas',
  AR: 'Americas',
  CO: 'Americas',
  PE: 'Americas',
  CL: 'Americas',
  AU: 'Asia-Pacific',
  NZ: 'Asia-Pacific',
  JP: 'Asia-Pacific',
  TH: 'Asia-Pacific',
  SG: 'Asia-Pacific',
  ID: 'Asia-Pacific',
  MY: 'Asia-Pacific',
  VN: 'Asia-Pacific',
  KR: 'Asia-Pacific',
  IN: 'Asia-Pacific',
  PH: 'Asia-Pacific',
  AE: 'Middle East & Africa',
  ZA: 'Middle East & Africa',
  MA: 'Middle East & Africa',
  EG: 'Middle East & Africa',
  KE: 'Middle East & Africa',
  TZ: 'Middle East & Africa',
  JO: 'Middle East & Africa',
  TR: 'Middle East & Africa',
};

// ---------------------------------------------------------------------------
// Well-known city → country code mapping (for resolving supplier.cities strings)
// ---------------------------------------------------------------------------
const CITY_COUNTRY_MAP = {
  // UK
  london: 'GB',
  edinburgh: 'GB',
  manchester: 'GB',
  liverpool: 'GB',
  birmingham: 'GB',
  glasgow: 'GB',
  bristol: 'GB',
  bath: 'GB',
  oxford: 'GB',
  cambridge: 'GB',
  york: 'GB',
  brighton: 'GB',
  cardiff: 'GB',
  belfast: 'GB',
  stonehenge: 'GB',
  cotswolds: 'GB',
  windsor: 'GB',
  // Ireland
  dublin: 'IE',
  cork: 'IE',
  galway: 'IE',
  // France
  paris: 'FR',
  nice: 'FR',
  lyon: 'FR',
  marseille: 'FR',
  bordeaux: 'FR',
  strasbourg: 'FR',
  // Italy
  rome: 'IT',
  florence: 'IT',
  venice: 'IT',
  milan: 'IT',
  naples: 'IT',
  amalfi: 'IT',
  pompeii: 'IT',
  tuscany: 'IT',
  capri: 'IT',
  positano: 'IT',
  sorrento: 'IT',
  'cinque terre': 'IT',
  // Spain
  barcelona: 'ES',
  madrid: 'ES',
  seville: 'ES',
  malaga: 'ES',
  valencia: 'ES',
  ibiza: 'ES',
  tenerife: 'ES',
  majorca: 'ES',
  mallorca: 'ES',
  // Germany
  berlin: 'DE',
  munich: 'DE',
  hamburg: 'DE',
  cologne: 'DE',
  frankfurt: 'DE',
  // Netherlands
  amsterdam: 'NL',
  rotterdam: 'NL',
  // Portugal
  lisbon: 'PT',
  porto: 'PT',
  algarve: 'PT',
  // Greece
  athens: 'GR',
  santorini: 'GR',
  mykonos: 'GR',
  crete: 'GR',
  rhodes: 'GR',
  // Austria/Switzerland
  vienna: 'AT',
  salzburg: 'AT',
  zurich: 'CH',
  geneva: 'CH',
  // Nordic
  stockholm: 'SE',
  copenhagen: 'DK',
  oslo: 'NO',
  helsinki: 'FI',
  reykjavik: 'IS',
  // Eastern Europe
  prague: 'CZ',
  budapest: 'HU',
  krakow: 'PL',
  warsaw: 'PL',
  dubrovnik: 'HR',
  split: 'HR',
  bucharest: 'RO',
  // Turkey
  istanbul: 'TR',
  cappadocia: 'TR',
  antalya: 'TR',
  bodrum: 'TR',
  // USA
  'new york': 'US',
  'los angeles': 'US',
  'san francisco': 'US',
  'las vegas': 'US',
  miami: 'US',
  chicago: 'US',
  washington: 'US',
  boston: 'US',
  seattle: 'US',
  'san diego': 'US',
  orlando: 'US',
  hawaii: 'US',
  maui: 'US',
  // Canada
  toronto: 'CA',
  vancouver: 'CA',
  montreal: 'CA',
  // Mexico / Central America
  cancun: 'MX',
  'mexico city': 'MX',
  'playa del carmen': 'MX',
  tulum: 'MX',
  // South America
  'rio de janeiro': 'BR',
  'buenos aires': 'AR',
  lima: 'PE',
  bogota: 'CO',
  santiago: 'CL',
  cusco: 'PE',
  'machu picchu': 'PE',
  // Asia
  tokyo: 'JP',
  kyoto: 'JP',
  osaka: 'JP',
  bangkok: 'TH',
  'chiang mai': 'TH',
  phuket: 'TH',
  singapore: 'SG',
  bali: 'ID',
  jakarta: 'ID',
  'kuala lumpur': 'MY',
  'ho chi minh': 'VN',
  hanoi: 'VN',
  seoul: 'KR',
  delhi: 'IN',
  mumbai: 'IN',
  jaipur: 'IN',
  goa: 'IN',
  manila: 'PH',
  // Oceania
  sydney: 'AU',
  melbourne: 'AU',
  auckland: 'NZ',
  queenstown: 'NZ',
  // Middle East
  dubai: 'AE',
  'abu dhabi': 'AE',
  // Africa
  'cape town': 'ZA',
  johannesburg: 'ZA',
  marrakech: 'MA',
  cairo: 'EG',
  nairobi: 'KE',
  zanzibar: 'TZ',
  // Caribbean
  jamaica: 'JM',
  barbados: 'BB',
  bahamas: 'BS',
};

// Country name → country code (for matching keywords / campaign names)
const COUNTRY_NAME_MAP = {
  'united kingdom': 'GB',
  uk: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  ireland: 'IE',
  france: 'FR',
  italy: 'IT',
  spain: 'ES',
  germany: 'DE',
  netherlands: 'NL',
  portugal: 'PT',
  greece: 'GR',
  austria: 'AT',
  switzerland: 'CH',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
  finland: 'FI',
  belgium: 'BE',
  croatia: 'HR',
  hungary: 'HU',
  'czech republic': 'CZ',
  czechia: 'CZ',
  poland: 'PL',
  romania: 'RO',
  bulgaria: 'BG',
  turkey: 'TR',
  usa: 'US',
  'united states': 'US',
  america: 'US',
  canada: 'CA',
  mexico: 'MX',
  brazil: 'BR',
  argentina: 'AR',
  colombia: 'CO',
  peru: 'PE',
  chile: 'CL',
  japan: 'JP',
  thailand: 'TH',
  singapore: 'SG',
  indonesia: 'ID',
  malaysia: 'MY',
  vietnam: 'VN',
  'south korea': 'KR',
  korea: 'KR',
  india: 'IN',
  philippines: 'PH',
  australia: 'AU',
  'new zealand': 'NZ',
  uae: 'AE',
  dubai: 'AE',
  'south africa': 'ZA',
  morocco: 'MA',
  egypt: 'EG',
  kenya: 'KE',
  tanzania: 'TZ',
  jordan: 'JO',
};

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

/**
 * Classify a keyword string into a campaign group using the category patterns.
 * Returns null if no category match (→ General Tours).
 */
function classifyKeywordToCategory(keyword) {
  const kw = keyword.toLowerCase();
  for (const [group, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (patterns.some((p) => kw.includes(p))) return group;
  }
  return null;
}

/**
 * Determine the best campaign group for a campaign by checking all its keywords.
 * Returns { campaignGroup, matchSource }.
 */
function classifyCampaignGroup(campaign) {
  // Check keywords array
  const keywords = campaign.keywords || [];
  for (const kw of keywords) {
    const group = classifyKeywordToCategory(kw);
    if (group) return { campaignGroup: group, matchSource: `keyword: "${kw}"` };
  }

  // Check campaign name
  const nameGroup = classifyKeywordToCategory(campaign.name);
  if (nameGroup) return { campaignGroup: nameGroup, matchSource: `name: "${campaign.name}"` };

  // Default: General Tours (tier determined later by profitability)
  return { campaignGroup: null, matchSource: 'none (General Tours)' };
}

/**
 * Resolve a city name to a country code using the lookup table.
 */
function cityToCountryCode(cityName) {
  const normalized = cityName.toLowerCase().trim();
  return CITY_COUNTRY_MAP[normalized] || null;
}

/**
 * Resolve a country name (or 2-letter code) to a country code.
 */
function resolveCountryCode(value) {
  if (!value) return null;
  const upper = value.toUpperCase().trim();
  if (REGION_MAP[upper]) return upper; // Already a valid country code
  return COUNTRY_NAME_MAP[value.toLowerCase().trim()] || null;
}

/**
 * Determine the region for a campaign using geographic data.
 * Priority: supplier.cities → product.city/country → keywords → campaign name
 */
function determineRegion(campaign, supplierCities, productLocations) {
  const countryCodes = new Set();

  // Source 1: Supplier cities
  for (const city of supplierCities) {
    const code = cityToCountryCode(city);
    if (code) countryCodes.add(code);
  }

  // Source 2: Product city/country
  for (const loc of productLocations) {
    if (loc.country) {
      const code = resolveCountryCode(loc.country);
      if (code) countryCodes.add(code);
    }
    if (loc.city) {
      const code = cityToCountryCode(loc.city);
      if (code) countryCodes.add(code);
    }
  }

  // Source 3: Keywords — parse for city/country names
  const keywords = campaign.keywords || [];
  const allText = [...keywords, campaign.name].join(' ').toLowerCase();

  // Check country names first
  for (const [name, code] of Object.entries(COUNTRY_NAME_MAP)) {
    if (allText.includes(name)) countryCodes.add(code);
  }

  // Check city names
  for (const [city, code] of Object.entries(CITY_COUNTRY_MAP)) {
    if (allText.includes(city)) countryCodes.add(code);
  }

  // Resolve country codes to regions
  const regions = new Set();
  const resolvedCodes = [];
  for (const code of countryCodes) {
    const region = REGION_MAP[code];
    if (region) {
      regions.add(region);
      resolvedCodes.push(code);
    }
  }

  if (regions.size === 1) {
    return {
      region: [...regions][0],
      countryCodes: resolvedCodes,
      source: 'auto',
    };
  }

  if (regions.size > 1) {
    // Multiple regions — pick the most frequent
    const regionCounts = {};
    for (const code of countryCodes) {
      const r = REGION_MAP[code];
      if (r) regionCounts[r] = (regionCounts[r] || 0) + 1;
    }
    const sorted = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);
    return {
      region: sorted[0][0],
      countryCodes: resolvedCodes,
      source: `auto (multi-region, picked ${sorted[0][0]} with ${sorted[0][1]} matches)`,
    };
  }

  // No geographic data found
  return { region: null, countryCodes: [], source: 'unresolved' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const outputCsv = args.includes('--csv');

  console.info('=== Phase 0: Enrich Campaign Mapping ===');
  console.info(`Mode: ${dryRun ? 'DRY RUN (no DB writes)' : 'LIVE (will update DB)'}`);
  console.info('');

  // Query all legacy FACEBOOK campaigns (1:1:1 structure, not already children)
  const campaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      parentCampaignId: null,
      status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] },
    },
    select: {
      id: true,
      name: true,
      keywords: true,
      status: true,
      campaignGroup: true,
      micrositeId: true,
      targetUrl: true,
      totalSpend: true,
      revenue: true,
      microsite: {
        select: {
          supplierId: true,
          siteName: true,
          supplier: {
            select: {
              id: true,
              name: true,
              cities: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.info(`Found ${campaigns.length} legacy FACEBOOK campaigns`);
  console.info('');

  // Batch-load products for all suppliers
  const supplierIds = [...new Set(campaigns.map((c) => c.microsite?.supplierId).filter(Boolean))];
  const productsBySupplier = {};
  if (supplierIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { supplierId: { in: supplierIds } },
      select: {
        supplierId: true,
        city: true,
        country: true,
      },
    });
    for (const p of products) {
      if (!productsBySupplier[p.supplierId]) productsBySupplier[p.supplierId] = [];
      productsBySupplier[p.supplierId].push({ city: p.city, country: p.country });
    }
    console.info(`Loaded products for ${supplierIds.length} suppliers`);
  }

  // Classify each campaign
  const results = [];
  const groupCounts = {};
  const regionCounts = {};
  let unresolved = 0;
  let updated = 0;

  for (const campaign of campaigns) {
    const supplierId = campaign.microsite?.supplierId;
    const supplierCities = campaign.microsite?.supplier?.cities || [];
    const productLocations = supplierId ? productsBySupplier[supplierId] || [] : [];

    // 1. Campaign group classification
    const { campaignGroup: categoryGroup, matchSource } = classifyCampaignGroup(campaign);

    // 2. Region classification (needed for General Tours assignment)
    const {
      region,
      countryCodes,
      source: regionSource,
    } = determineRegion(campaign, supplierCities, productLocations);

    // 3. Determine final campaign group
    let finalGroup;
    if (categoryGroup) {
      finalGroup = categoryGroup;
    } else if (region) {
      // General Tours — region determines the ad set, not the campaign group
      // Use a placeholder that the migration script will refine with profitability score
      finalGroup = 'General Tours';
    } else {
      finalGroup = 'General Tours';
      unresolved++;
    }

    // Track counts
    groupCounts[finalGroup] = (groupCounts[finalGroup] || 0) + 1;
    if (region) regionCounts[region] = (regionCounts[region] || 0) + 1;

    results.push({
      id: campaign.id,
      name: campaign.name,
      supplierName: campaign.microsite?.supplier?.name || campaign.microsite?.siteName || 'N/A',
      keywords: (campaign.keywords || []).join('; '),
      campaignGroup: finalGroup,
      categoryMatchSource: matchSource,
      region: region || 'Unresolved',
      regionSource,
      countryCodes: countryCodes.join(', '),
      status: campaign.status,
      spend: campaign.totalSpend ? Number(campaign.totalSpend).toFixed(2) : '0.00',
      revenue: campaign.revenue ? Number(campaign.revenue).toFixed(2) : '0.00',
    });

    // Update DB
    if (!dryRun && campaign.campaignGroup !== finalGroup) {
      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: { campaignGroup: finalGroup },
      });
      updated++;
    }
  }

  // Summary
  console.info('');
  console.info('=== Campaign Group Distribution ===');
  for (const [group, count] of Object.entries(groupCounts).sort((a, b) => b[1] - a[1])) {
    console.info(`  ${group}: ${count}`);
  }

  console.info('');
  console.info('=== Region Distribution ===');
  for (const [region, count] of Object.entries(regionCounts).sort((a, b) => b[1] - a[1])) {
    console.info(`  ${region}: ${count}`);
  }

  console.info('');
  console.info(`Unresolved (no geographic data): ${unresolved}`);
  console.info(`  → These will be assigned to "General Tours – Tier 2" by migration script`);

  if (!dryRun) {
    console.info(`\nUpdated ${updated} campaigns with campaignGroup`);
  }

  // CSV output
  if (outputCsv) {
    const header = [
      'Campaign ID',
      'Campaign Name',
      'Supplier',
      'Keywords',
      'Campaign Group',
      'Category Match Source',
      'Region',
      'Region Source',
      'Country Codes',
      'Status',
      'Total Spend',
      'Total Revenue',
    ].join(',');

    const rows = results.map((r) =>
      [
        r.id,
        `"${r.name.replace(/"/g, '""')}"`,
        `"${r.supplierName.replace(/"/g, '""')}"`,
        `"${r.keywords.replace(/"/g, '""')}"`,
        r.campaignGroup,
        `"${r.categoryMatchSource}"`,
        r.region,
        r.regionSource,
        r.countryCodes,
        r.status,
        r.spend,
        r.revenue,
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');

    if (process.stdout.isTTY) {
      const outPath = path.join(__dirname, 'campaign-mapping.csv');
      fs.writeFileSync(outPath, csv);
      console.info(`\nCSV written to: ${outPath}`);
    } else {
      process.stdout.write(csv + '\n');
    }
  }

  console.info('\nDone.');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
