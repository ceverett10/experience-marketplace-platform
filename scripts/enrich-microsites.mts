/**
 * Microsite AI Enrichment Script (Phase 2)
 *
 * Generates heroHeadline, destinationBlurb, and destinationTags for supplier microsites
 * using Claude. Targets the top N microsites by SEO traffic (pageViews).
 *
 * Usage:
 *   DATABASE_URL=... ANTHROPIC_API_KEY=... npx tsx scripts/enrich-microsites.mts [--limit 20] [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const prisma = new PrismaClient();

const MODEL = 'claude-sonnet-4-20250514';
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const idx = process.argv.indexOf('--limit');
  return idx !== -1 && process.argv[idx + 1] ? parseInt(process.argv[idx + 1], 10) : 20;
})();

interface EnrichmentResult {
  heroHeadline: string;
  destinationBlurb: string;
  destinationTags: string[];
}

async function getTopMicrositesByTraffic(limit: number) {
  return prisma.micrositeConfig.findMany({
    where: {
      status: 'ACTIVE',
      entityType: 'SUPPLIER',
      enrichedAt: null, // Only unenriched microsites
      supplier: { isNot: null },
    },
    include: {
      supplier: {
        select: {
          name: true,
          description: true,
          cities: true,
          categories: true,
          productCount: true,
          rating: true,
          reviewCount: true,
        },
      },
    },
    orderBy: { pageViews: 'desc' },
    take: limit,
  });
}

async function getTopProductTitles(supplierId: string, limit = 5): Promise<string[]> {
  const products = await prisma.product.findMany({
    where: { supplierId },
    select: { title: true },
    orderBy: { bookingCount: 'desc' },
    take: limit,
  });
  return products.map((p) => p.title);
}

function buildPrompt(
  supplierName: string,
  description: string | null,
  cities: string[],
  categories: string[],
  productTitles: string[],
  rating: number | null,
  productCount: number
): string {
  const city = cities[0] ?? 'this destination';
  const categoryList = categories.slice(0, 3).join(', ') || 'experiences';

  return `You are writing marketing copy for a travel experience supplier's website homepage.

SUPPLIER DATA (use only this data — do not invent facts):
- Name: ${supplierName}
- Location: ${cities.join(', ') || 'Various locations'}
- Categories: ${categoryList}
- Description: ${description || 'No description available'}
- Top experiences: ${productTitles.join('; ') || 'Various experiences'}
- Product count: ${productCount}
${rating ? `- Average rating: ${rating.toFixed(1)}/5` : ''}

Generate exactly three things in JSON format:

1. "heroHeadline": An emotive, supplier-specific headline for the hero section (max 12 words). Should capture what makes this supplier special. Do NOT include the supplier name. Examples: "Unforgettable Wildlife Encounters in the Heart of Sri Lanka", "Authentic Culinary Journeys Through Tuscany's Hidden Gems".

2. "destinationBlurb": A compelling 2-3 sentence paragraph about why ${city} is special for ${categoryList} (max 80 words). Write in third person. Ground every claim in the supplier data above — do not fabricate attractions, landmarks, or facts not mentioned in the data.

3. "destinationTags": An array of 3-5 short contextual tags (2-3 words each) relevant to this supplier's experiences in ${city}. Derive tags from the product titles and categories — do not invent tags about things not in the data.

Respond with ONLY valid JSON, no markdown:
{"heroHeadline": "...", "destinationBlurb": "...", "destinationTags": ["...", "..."]}`;
}

async function enrichMicrosite(
  micrositeId: string,
  supplierName: string,
  description: string | null,
  cities: string[],
  categories: string[],
  productTitles: string[],
  rating: number | null,
  productCount: number,
  anthropic: Anthropic
): Promise<EnrichmentResult> {
  const prompt = buildPrompt(
    supplierName,
    description,
    cities,
    categories,
    productTitles,
    rating,
    productCount
  );

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

  // Parse JSON response — handle potential markdown wrapping
  const jsonStr = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  const parsed = JSON.parse(jsonStr) as EnrichmentResult;

  // Validate
  if (!parsed.heroHeadline || !parsed.destinationBlurb || !Array.isArray(parsed.destinationTags)) {
    throw new Error(`Invalid response structure: ${jsonStr.slice(0, 200)}`);
  }

  return {
    heroHeadline: parsed.heroHeadline.slice(0, 150),
    destinationBlurb: parsed.destinationBlurb.slice(0, 500),
    destinationTags: parsed.destinationTags.slice(0, 5),
  };
}

async function main() {
  console.info(`\n=== Microsite AI Enrichment (Phase 2) ===`);
  console.info(`Model: ${MODEL}`);
  console.info(`Limit: ${LIMIT} microsites (by pageViews DESC)`);
  console.info(`Dry run: ${DRY_RUN}\n`);

  const anthropic = new Anthropic();

  const microsites = await getTopMicrositesByTraffic(LIMIT);
  console.info(`Found ${microsites.length} unenriched microsites to process\n`);

  if (microsites.length === 0) {
    console.info('No microsites to enrich. Exiting.');
    return;
  }

  let success = 0;
  let failed = 0;

  for (const ms of microsites) {
    const supplier = ms.supplier;
    if (!supplier) {
      console.warn(`[SKIP] ${ms.subdomain} — no supplier linked`);
      continue;
    }

    const productTitles = await getTopProductTitles(ms.supplierId!);

    console.info(
      `[${ms.subdomain}] ${supplier.name} (${supplier.cities.join(', ')}) — ${ms.pageViews} pageViews`
    );
    console.info(`  Categories: ${supplier.categories.join(', ')}`);
    console.info(
      `  Products: ${supplier.productCount}, Top: ${productTitles.slice(0, 3).join('; ')}`
    );

    try {
      const result = await enrichMicrosite(
        ms.id,
        supplier.name,
        supplier.description,
        supplier.cities,
        supplier.categories,
        productTitles,
        supplier.rating,
        supplier.productCount,
        anthropic
      );

      console.info(`  -> Headline: "${result.heroHeadline}"`);
      console.info(`  -> Blurb: "${result.destinationBlurb.slice(0, 80)}..."`);
      console.info(`  -> Tags: [${result.destinationTags.join(', ')}]`);

      if (!DRY_RUN) {
        await prisma.micrositeConfig.update({
          where: { id: ms.id },
          data: {
            heroHeadline: result.heroHeadline,
            destinationBlurb: result.destinationBlurb,
            destinationTags: result.destinationTags,
            enrichedAt: new Date(),
            enrichmentSource: MODEL,
          },
        });
        console.info(`  -> Saved to DB`);
      } else {
        console.info(`  -> [DRY RUN] Would save to DB`);
      }

      success++;
    } catch (error) {
      console.error(`  -> ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }

    console.info('');
  }

  console.info(`\n=== Complete ===`);
  console.info(`Success: ${success}, Failed: ${failed}, Total: ${microsites.length}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
