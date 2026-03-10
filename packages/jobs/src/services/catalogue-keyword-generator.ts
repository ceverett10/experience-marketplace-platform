/**
 * Catalogue Keyword Generator
 *
 * Generates paid search keyword candidates from existing product data in the
 * local database. Queries distinct city × category combinations from the Product
 * table and creates keyword patterns like "{category} {city}", "{category} in {city}",
 * and "{city} {category}".
 *
 * Uses the "let Google filter" approach — no DataForSEO volume validation needed.
 * Google won't show ads for zero-volume keywords, so there's no wasted spend.
 */

import { prisma } from '@experience-marketplace/database';
import { PAID_TRAFFIC_CONFIG } from '../config/paid-traffic';

// Minimum number of products for a city×category combo to generate keywords
const MIN_PRODUCTS_PER_COMBO = 3;

interface CityCategory {
  city: string;
  category: string;
  productCount: number;
}

interface GenerationResult {
  cityCategoryCombos: number;
  keywordsGenerated: number;
  keywordsInserted: number;
  keywordsSkippedDuplicate: number;
  sampleKeywords: string[];
}

/**
 * Map a Holibob product category to our campaign group classification patterns.
 * Returns the campaign group name if the category matches, otherwise null.
 */
function mapCategoryToCampaignGroup(category: string): string | null {
  const catLower = category.toLowerCase();
  const { categoryPatterns } = PAID_TRAFFIC_CONFIG.metaConsolidated;

  for (const [group, patterns] of Object.entries(categoryPatterns)) {
    if ((patterns as string[]).some((p) => catLower.includes(p))) return group;
  }

  return null;
}

/**
 * Normalise a category name for keyword generation.
 * "Boat Tours & Cruises" → "boat tours cruises"
 */
function normaliseCategory(category: string): string {
  return category
    .toLowerCase()
    .replace(/[&+]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate keyword patterns from a city × category combination.
 */
function generateKeywordPatterns(city: string, category: string): string[] {
  const normCat = normaliseCategory(category);
  const normCity = city.toLowerCase().trim();

  if (!normCat || !normCity) return [];

  const keywords: string[] = [];

  // Pattern 1: "{category} {city}" — e.g., "boat tours lisbon"
  keywords.push(`${normCat} ${normCity}`);

  // Pattern 2: "{category} in {city}" — e.g., "boat tours in lisbon"
  keywords.push(`${normCat} in ${normCity}`);

  // Pattern 3: "{city} {category}" — e.g., "lisbon boat tours"
  keywords.push(`${normCity} ${normCat}`);

  return keywords;
}

/**
 * Query distinct city × category combinations from the Product table
 * that have enough products to justify keyword generation.
 */
async function getCityCategoryCombos(): Promise<CityCategory[]> {
  // Use raw SQL for efficient unnest + groupBy on the categories array
  const results = await prisma.$queryRaw<
    Array<{ city: string; category: string; product_count: bigint }>
  >`
    SELECT p.city, unnest(p.categories) as category, COUNT(*) as product_count
    FROM products p
    WHERE p.city IS NOT NULL
      AND p.city != ''
      AND array_length(p.categories, 1) > 0
    GROUP BY p.city, category
    HAVING COUNT(*) >= ${MIN_PRODUCTS_PER_COMBO}
    ORDER BY COUNT(*) DESC
  `;

  return results.map((r) => ({
    city: r.city,
    category: r.category,
    productCount: Number(r.product_count),
  }));
}

/**
 * Generate and store keyword candidates from the product catalogue.
 *
 * @param dryRun - If true, only generates keywords without writing to DB
 * @returns Generation statistics
 */
export async function generateCatalogueKeywords(dryRun = false): Promise<GenerationResult> {
  console.info('[CatalogueKeywords] Querying city × category combinations...');
  const combos = await getCityCategoryCombos();
  console.info(
    `[CatalogueKeywords] Found ${combos.length} combos with ≥${MIN_PRODUCTS_PER_COMBO} products`
  );

  const allKeywords: Array<{
    keyword: string;
    niche: string;
    campaignGroup: string | null;
  }> = [];

  const seen = new Set<string>();

  for (const combo of combos) {
    const patterns = generateKeywordPatterns(combo.city, combo.category);
    const campaignGroup = mapCategoryToCampaignGroup(combo.category);

    for (const kw of patterns) {
      if (seen.has(kw)) continue;
      seen.add(kw);
      allKeywords.push({
        keyword: kw,
        niche: combo.category,
        campaignGroup,
      });
    }
  }

  console.info(`[CatalogueKeywords] Generated ${allKeywords.length} unique keywords`);

  if (dryRun) {
    const sample = allKeywords.slice(0, 20).map((k) => k.keyword);
    console.info('[CatalogueKeywords] DRY RUN — sample keywords:');
    for (const kw of sample) {
      console.info(`  - ${kw}`);
    }
    return {
      cityCategoryCombos: combos.length,
      keywordsGenerated: allKeywords.length,
      keywordsInserted: 0,
      keywordsSkippedDuplicate: 0,
      sampleKeywords: sample,
    };
  }

  // Batch insert as PAID_CANDIDATE with source: 'catalogue'
  // Uses skipDuplicates to handle the @@unique([keyword, location]) constraint
  const BATCH_SIZE = 500;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < allKeywords.length; i += BATCH_SIZE) {
    const batch = allKeywords.slice(i, i + BATCH_SIZE);
    const result = await prisma.sEOOpportunity.createMany({
      data: batch.map((k) => ({
        keyword: k.keyword,
        location: null,
        searchVolume: 0,
        difficulty: 50,
        cpc: 0,
        intent: 'COMMERCIAL' as const,
        niche: k.niche,
        priorityScore: 50,
        status: 'PAID_CANDIDATE' as const,
        source: 'catalogue',
        sourceData: k.campaignGroup ? { campaignGroup: k.campaignGroup } : undefined,
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
    skipped += batch.length - result.count;
  }

  console.info(
    `[CatalogueKeywords] Inserted ${inserted} new keywords, skipped ${skipped} duplicates`
  );

  return {
    cityCategoryCombos: combos.length,
    keywordsGenerated: allKeywords.length,
    keywordsInserted: inserted,
    keywordsSkippedDuplicate: skipped,
    sampleKeywords: allKeywords.slice(0, 10).map((k) => k.keyword),
  };
}
