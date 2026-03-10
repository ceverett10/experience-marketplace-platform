/**
 * Site-driven Catalogue Keyword Generator
 *
 * Generates paid search keyword candidates by combining search-friendly stems
 * (defined per site) with cities that have matching product inventory.
 *
 * Each branded domain defines:
 *   - stems: human-friendly keyword stems ("food tours", "walking tours")
 *   - holibobCategories: raw product categories that confirm inventory
 *   - minProducts: minimum product count per city before generating keywords
 *   - cityFilter: optional city restriction (for city-specific sites)
 *
 * City-specific sites (london-food-tours.com) take priority over global sites
 * (food-tour-guide.com) for their city — dedup ensures no double-targeting.
 *
 * Uses the "let Google filter" approach — no volume validation needed.
 */

import type { Prisma } from '@experience-marketplace/database';
import { prisma } from '@experience-marketplace/database';
import { PAID_TRAFFIC_CONFIG } from '../config/paid-traffic';
import { classifyKeywordToCampaignGroup } from './bidding-engine';

interface SiteKeywordResult {
  domain: string;
  siteId: string;
  keywordsGenerated: number;
  citiesMatched: number;
  sampleKeywords: string[];
}

export interface GenerationResult {
  sitesProcessed: number;
  sitesSkipped: number;
  totalKeywords: number;
  totalInserted: number;
  totalSkippedDuplicate: number;
  perSite: SiteKeywordResult[];
}

interface CityInventory {
  city: string;
  productCount: number;
}

/**
 * Query cities that have enough products in the given Holibob categories.
 * Returns city name and product count (used for priority scoring).
 */
async function getCitiesWithInventory(
  holibobCategories: string[],
  minProducts: number,
  cityFilter?: string[]
): Promise<CityInventory[]> {
  // Build the category array literal for the && (overlap) operator
  const catArray = holibobCategories.map((c) => `'${c.replace(/'/g, "''")}'`).join(',');
  const catClause = `categories && ARRAY[${catArray}]::text[]`;

  let query = `
    SELECT city, COUNT(*) as cnt
    FROM products
    WHERE city IS NOT NULL
      AND city != ''
      AND ${catClause}
  `;

  if (cityFilter && cityFilter.length > 0) {
    const cityList = cityFilter.map((c) => `'${c.replace(/'/g, "''")}'`).join(',');
    query += ` AND city IN (${cityList})`;
  }

  query += `
    GROUP BY city
    HAVING COUNT(*) >= ${minProducts}
    ORDER BY COUNT(*) DESC
  `;

  const rows = await prisma.$queryRawUnsafe<Array<{ city: string; cnt: bigint }>>(query);
  return rows.map((r) => ({ city: r.city, productCount: Number(r.cnt) }));
}

/**
 * Calculate priority score for a catalogue keyword.
 * Base 60 for all, +10 for city-specific branded sites (best Quality Score),
 * +0 to +5 based on product count (log scale tiebreaker).
 */
function calculateCataloguePriorityScore(productCount: number, hasCityFilter: boolean): number {
  const base = 60;
  const cityBonus = hasCityFilter ? 10 : 0;
  const countBonus = Math.min(5, Math.floor(Math.log10(Math.max(productCount, 1))));
  return Math.min(75, base + cityBonus + countBonus);
}

/**
 * Generate keyword patterns from a stem × city combination.
 */
function generateKeywordPatterns(stem: string, city: string): string[] {
  const normStem = stem.toLowerCase().trim();
  const normCity = city.toLowerCase().trim();
  if (!normStem || !normCity) return [];

  return [
    `${normStem} ${normCity}`, // "food tours rome"
    `${normStem} in ${normCity}`, // "food tours in rome"
    `${normCity} ${normStem}`, // "rome food tours"
  ];
}

/**
 * Look up siteId for a domain from the database.
 */
async function getSiteIdForDomain(domain: string): Promise<string | null> {
  const site = await prisma.site.findFirst({
    where: {
      primaryDomain: domain,
      status: { in: ['ACTIVE', 'REVIEW', 'DNS_PENDING', 'SSL_PENDING'] },
    },
    select: { id: true },
  });
  return site?.id ?? null;
}

/**
 * Generate and store keyword candidates from the product catalogue.
 *
 * @param dryRun - If true, only generates keywords without writing to DB
 */
export async function generateCatalogueKeywords(dryRun = false): Promise<GenerationResult> {
  const { siteKeywordConfig } = PAID_TRAFFIC_CONFIG;
  const configEntries = Object.entries(siteKeywordConfig);

  console.info(`[CatalogueKeywords] Processing ${configEntries.length} site configs...`);

  // Track all generated keywords globally to handle cross-site dedup.
  // City-specific sites are processed first so they take priority.
  const globalSeen = new Set<string>();

  // Sort: city-specific sites first (they have cityFilter), then global sites
  const sorted = [...configEntries].sort((a, b) => {
    const aHasFilter = a[1].cityFilter ? 0 : 1;
    const bHasFilter = b[1].cityFilter ? 0 : 1;
    return aHasFilter - bHasFilter;
  });

  const perSite: SiteKeywordResult[] = [];
  let sitesSkipped = 0;

  // Accumulate all keywords for batch insert
  const allKeywords: Array<{
    keyword: string;
    niche: string;
    siteId: string;
    domain: string;
    campaignGroup: string;
    priorityScore: number;
  }> = [];

  for (const [domain, config] of sorted) {
    const siteId = await getSiteIdForDomain(domain);
    if (!siteId) {
      console.info(`[CatalogueKeywords] Skipping ${domain} — site not found or not active`);
      sitesSkipped++;
      continue;
    }

    const cities = await getCitiesWithInventory(
      config.holibobCategories,
      config.minProducts,
      config.cityFilter
    );

    if (cities.length === 0) {
      console.info(`[CatalogueKeywords] Skipping ${domain} — no cities with enough inventory`);
      sitesSkipped++;
      continue;
    }

    const hasCityFilter = Boolean(config.cityFilter);
    const siteKeywords: string[] = [];

    for (const { city, productCount } of cities) {
      const priorityScore = calculateCataloguePriorityScore(productCount, hasCityFilter);
      for (const stem of config.stems) {
        const patterns = generateKeywordPatterns(stem, city);
        // Classify using the first pattern (all patterns for same stem get same group)
        const campaignGroup = patterns[0]
          ? classifyKeywordToCampaignGroup(patterns[0], priorityScore)
          : 'General Tours – Tier 1';
        for (const kw of patterns) {
          if (globalSeen.has(kw)) continue;
          globalSeen.add(kw);
          siteKeywords.push(kw);
          allKeywords.push({
            keyword: kw,
            niche: stem,
            siteId,
            domain,
            campaignGroup,
            priorityScore,
          });
        }
      }
    }

    const result: SiteKeywordResult = {
      domain,
      siteId,
      keywordsGenerated: siteKeywords.length,
      citiesMatched: cities.length,
      sampleKeywords: siteKeywords.slice(0, 5),
    };
    perSite.push(result);

    console.info(
      `[CatalogueKeywords] ${domain}: ${siteKeywords.length} keywords across ${cities.length} cities`
    );
  }

  const totalKeywords = allKeywords.length;
  console.info(`\n[CatalogueKeywords] Total: ${totalKeywords} unique keywords`);

  if (dryRun) {
    return {
      sitesProcessed: perSite.length,
      sitesSkipped,
      totalKeywords,
      totalInserted: 0,
      totalSkippedDuplicate: 0,
      perSite,
    };
  }

  // Batch insert as PAID_CANDIDATE with source: 'catalogue'
  const BATCH_SIZE = 500;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < allKeywords.length; i += BATCH_SIZE) {
    const batch = allKeywords.slice(i, i + BATCH_SIZE);
    const result = await prisma.sEOOpportunity.createMany({
      data: batch.map(
        (k) =>
          ({
            keyword: k.keyword,
            location: null,
            searchVolume: 0,
            difficulty: 50,
            cpc: 0,
            intent: 'COMMERCIAL',
            niche: k.niche,
            priorityScore: k.priorityScore,
            campaignGroup: k.campaignGroup,
            status: 'PAID_CANDIDATE',
            source: 'catalogue',
            siteId: k.siteId,
            sourceData: { domain: k.domain },
          }) satisfies Prisma.SEOOpportunityCreateManyInput
      ),
      skipDuplicates: true,
    });
    inserted += result.count;
    skipped += batch.length - result.count;

    if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE || i + BATCH_SIZE >= allKeywords.length) {
      console.info(
        `[CatalogueKeywords] Progress: ${Math.min(i + BATCH_SIZE, allKeywords.length)}/${totalKeywords}`
      );
    }
  }

  console.info(
    `[CatalogueKeywords] Inserted ${inserted} new keywords, skipped ${skipped} duplicates`
  );

  return {
    sitesProcessed: perSite.length,
    sitesSkipped,
    totalKeywords,
    totalInserted: inserted,
    totalSkippedDuplicate: skipped,
    perSite,
  };
}
