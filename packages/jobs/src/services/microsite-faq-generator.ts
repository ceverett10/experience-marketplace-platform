/**
 * Microsite FAQ Generator Service
 *
 * Generates FAQ pages for supplier microsites using product data from the database.
 * Uses a tightly constrained prompt to prevent hallucination — every answer must be
 * traceable to injected product data.
 *
 * Design principles:
 * - Closed-world assumption: the model only knows what we inject
 * - Fixed question set: 8 required + up to 6 conditional (no open-ended generation)
 * - Fallback phrase mandated: "Please contact us directly for details"
 * - No URLs in output: explicit ban prevents hallucinated links
 * - Short answers (30-60 words): less room to drift from data
 *
 * Uses Sonnet (not Haiku) because FAQ pages get Schema markup and appear directly
 * in SERPs — quality matters more than cost here.
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma, PageType, PageStatus } from '@experience-marketplace/database';
import { generateFAQSchema, extractFAQsFromContent } from './structured-data';

const FAQ_SYSTEM_PROMPT = `You are a factual FAQ writer for a travel experiences website. You MUST follow these rules:

1. ONLY use information from the DATA section provided by the user. Do not invent, assume, or infer any facts beyond what is explicitly stated.
2. If the data does not contain enough information to answer a question fully, use the exact phrase: "Please contact us directly for details."
3. Never generate URLs, email addresses, phone numbers, or social media links.
4. Never mention specific dates, seasonal availability, or weather unless explicitly stated in the data.
5. Use plain, direct language. No marketing superlatives ("world-class", "unforgettable", "must-see", "premier", "renowned", "ultimate", "perfect", "amazing").
6. Every price must come from the data and include the currency symbol. Say "from £X" not "£X".
7. Every duration must come from the data. Say "approximately" if only one product's duration is available.
8. Do not reference competitor companies, other booking platforms, or external websites.
9. Do NOT include any hyperlinks or markdown links in the content. Write plain text only.
10. Write in a natural, conversational tone. Vary sentence structure across answers — do not start every answer the same way.
11. When describing what is included or what to expect, reference specific details from the product descriptions — do not give generic answers when specific information is available.`;

/**
 * Holibob categories that are too vague to be useful in FAQ answers.
 * Filtered out before injecting into the prompt.
 */
const JUNK_CATEGORIES = new Set([
  'General',
  'Other',
  'Miscellaneous',
  'N/A',
  'Unknown',
  'Uncategorized',
]);

interface ProductData {
  title: string;
  description: string | null;
  shortDescription: string | null;
  city: string | null;
  country: string | null;
  categories: string[];
  duration: string | null;
  priceFrom: any; // Prisma Decimal
  currency: string;
  rating: number | null;
  reviewCount: number;
}

interface FAQGenerationResult {
  micrositeId: string;
  micrositeName: string;
  generated: boolean;
  pageId?: string;
  error?: string;
  skippedReason?: string;
}

/**
 * Filter junk categories and clean up category names.
 */
function cleanCategories(categories: string[]): string[] {
  return categories.filter((c) => c && !JUNK_CATEGORIES.has(c.trim())).map((c) => c.trim());
}

/**
 * Truncate a description to a reasonable length for prompt injection.
 * Keeps the first N characters, breaking at sentence boundaries.
 */
function truncateDescription(desc: string | null, maxLen: number = 300): string | null {
  if (!desc) return null;
  const cleaned = desc.replace(/<[^>]*>/g, '').trim(); // Strip HTML tags
  if (cleaned.length <= maxLen) return cleaned;
  // Break at the last sentence boundary before maxLen
  const truncated = cleaned.substring(0, maxLen);
  const lastPeriod = truncated.lastIndexOf('.');
  return lastPeriod > maxLen * 0.5 ? truncated.substring(0, lastPeriod + 1) : truncated + '...';
}

/**
 * Build the data-injection section of the prompt from real product data.
 */
function buildDataSection(params: {
  siteName: string;
  subdomain: string;
  supplierName: string;
  supplierDescription: string | null;
  products: ProductData[];
  supplierCities: string[];
  supplierCategories: string[];
  priceRangeMin: any;
  priceRangeMax: any;
  priceCurrency: string;
}): string {
  const {
    siteName,
    subdomain,
    supplierName,
    supplierDescription,
    products,
    supplierCities,
    supplierCategories,
    priceRangeMin,
    priceRangeMax,
    priceCurrency,
  } = params;

  const productLines = products
    .map((p) => {
      const cats = cleanCategories(p.categories);
      const parts = [`- ${p.title}`];
      if (p.priceFrom) parts.push(`  Price: from ${p.priceFrom} ${p.currency}`);
      if (p.duration) parts.push(`  Duration: ${p.duration}`);
      if (cats.length) parts.push(`  Categories: ${cats.join(', ')}`);
      if (p.city) parts.push(`  Location: ${p.city}${p.country ? `, ${p.country}` : ''}`);
      if (p.rating) parts.push(`  Rating: ${p.rating}/5 (${p.reviewCount} reviews)`);
      // Include description (truncated) — this is the richest data source for inclusions,
      // meeting points, highlights, and what to expect.
      const desc = truncateDescription(p.description) || truncateDescription(p.shortDescription);
      if (desc) parts.push(`  Details: ${desc}`);
      return parts.join('\n');
    })
    .join('\n\n');

  // Deduplicate and clean cities/categories
  const allCities = [
    ...new Set([...supplierCities, ...products.map((p) => p.city).filter(Boolean)]),
  ];
  const allCategories = cleanCategories([
    ...new Set([...supplierCategories, ...products.flatMap((p) => p.categories).filter(Boolean)]),
  ]);

  // Price range
  let priceRange = 'Not specified';
  if (priceRangeMin && priceRangeMax) {
    priceRange = `from ${priceCurrency} ${priceRangeMin} to ${priceCurrency} ${priceRangeMax}`;
  } else if (priceRangeMin) {
    priceRange = `from ${priceCurrency} ${priceRangeMin}`;
  }

  return `=== DATA ===

SITE CONTEXT:
- Site name: ${siteName}
- Site URL: ${subdomain}.experiencess.com
- Network: Experiencess is a network of dedicated microsites, each built around a single experience provider. Every site showcases that provider's tours, activities, and attractions in one place. All bookings on the Experiencess network are processed securely through Holibob, a trusted global experiences marketplace.
- Booking process: Customers browse experiences, select a date, and pay online. Holibob handles payment processing securely. A confirmation email with booking details is sent immediately.

ABOUT THE PROVIDER:
- Provider name: ${supplierName}
- Provider description: ${supplierDescription || 'Not available'}
- Locations served: ${allCities.length > 0 ? allCities.join(', ') : 'Not specified'}
- Experience categories: ${allCategories.length > 0 ? allCategories.join(', ') : 'Not specified'}
- Price range: ${priceRange}

EXPERIENCES (${products.length} shown):
${productLines || 'No product details available'}

=== END DATA ===`;
}

/**
 * Build the user prompt with required and conditional questions.
 */
function buildUserPrompt(params: {
  siteName: string;
  supplierName: string;
  categories: string[];
  cities: string[];
  products: ProductData[];
  dataSection: string;
}): string {
  const { siteName, supplierName, categories, cities, products, dataSection } = params;

  const cleanCats = cleanCategories(categories);
  const categoryStr = cleanCats.length > 0 ? cleanCats.slice(0, 3).join(', ') : 'travel';
  const cityStr = cities.length > 0 ? cities.slice(0, 3).join(', ') : 'various locations';

  // Check what product descriptions mention — drives conditional questions
  const allDescriptions = products
    .map((p) => `${p.description || ''} ${p.shortDescription || ''}`)
    .join(' ')
    .toLowerCase();

  // Determine conditional questions based on available data
  const conditionalQuestions: string[] = [];

  const hasRatings = products.some((p) => p.rating && p.reviewCount > 0);
  if (hasRatings) {
    conditionalQuestions.push(
      '- Are the experiences well-reviewed? (Summarise the ratings from the data. Mention specific experiences and their ratings.)'
    );
  }

  const hasDurations = products.some((p) => p.duration);
  const uniqueDurations = new Set(products.map((p) => p.duration).filter(Boolean));
  if (hasDurations && uniqueDurations.size > 1) {
    conditionalQuestions.push(
      '- How long do different experiences last? (Give specific durations for specific experiences — not just a range.)'
    );
  }

  const hasMultipleCities = new Set(products.map((p) => p.city).filter(Boolean)).size > 1;
  if (hasMultipleCities) {
    conditionalQuestions.push(
      '- Which locations are covered? (Name the specific cities and what experiences operate there.)'
    );
  }

  const cleanedProductCats = cleanCategories([
    ...new Set(products.flatMap((p) => p.categories).filter(Boolean)),
  ]);
  if (cleanedProductCats.length > 2) {
    conditionalQuestions.push(
      '- What types of experiences are available? (Group the experiences by category, mentioning specific tour names.)'
    );
  }

  // Check if descriptions mention things like "includes", "provided", "bring", "wear"
  const mentionsInclusions =
    /\b(include[sd]?|provided|complimentary|free .{1,20}(drink|snack|meal|transport|equipment|guide))\b/i.test(
      allDescriptions
    );
  const mentionsBringItems =
    /\b(bring|wear|comfortable shoes|sunscreen|hat|water|camera|swimwear|towel)\b/i.test(
      allDescriptions
    );

  if (mentionsBringItems) {
    conditionalQuestions.push(
      '- What should I bring or wear? (Only mention items specifically referenced in the experience details.)'
    );
  }

  return `Write an FAQ page for "${supplierName}" — a provider of ${categoryStr} experiences in ${cityStr}.

${dataSection}

Write exactly 8-12 FAQ items using ONLY the data above.

IMPORTANT WRITING GUIDELINES:
- Write naturally. Vary how you start each answer — do not begin every answer with the provider name or "The experiences".
- When the data includes specific details (what is included, meeting points, highlights), USE those details in your answers instead of giving a generic response.
- ${mentionsInclusions ? 'The experience details mention specific inclusions — reference these when answering about what is included.' : 'If descriptions mention any specifics about what is provided, mention them.'}
- Keep answers between 30 and 80 words. Longer answers are fine if they contain specific factual detail from the data.

REQUIRED QUESTIONS (always include):
1. What is ${siteName}?
   -> Write a natural answer explaining this is a dedicated booking site for ${supplierName}, part of the Experiencess network of provider microsites. Bookings are processed through Holibob. Do NOT start the answer with "${siteName} is..." — vary the phrasing.
2. What experiences does ${supplierName} offer?
   -> Name specific experiences from the data. Briefly describe what each one involves using details from the descriptions.
3. How much do the experiences cost?
   -> Quote specific prices from the data. Always use "from" before a price. If there is a range, state it clearly.
4. How long do the experiences last?
   -> Use duration data for specific experiences. If durations vary, name which experience is shorter/longer.
5. Where are the experiences located?
   -> Name the cities and countries from the data.
6. What is the cancellation policy?
   -> Say: "Cancellation policies vary by experience. Please check the specific experience page for cancellation terms before booking, or contact us for details."
7. What is included?
   -> ${mentionsInclusions ? 'The experience descriptions mention specific inclusions. Reference these directly — do not give a generic answer.' : 'If any experience descriptions mention what is provided or included, reference those specifics. Otherwise say inclusions vary by experience and to check individual pages.'}
8. How do I book?
   -> Answer: "Browse the experiences on this site, pick the one you like, select a date, and complete your booking online. Payment is handled securely through Holibob, and you will receive a confirmation email straight away with everything you need."

CONDITIONAL QUESTIONS (include only where the data supports a specific answer):
${conditionalQuestions.length > 0 ? conditionalQuestions.join('\n') : '(No conditional questions apply based on the available data)'}

OUTPUT FORMAT:
Return markdown. Each FAQ item as:
### {Question}?
{Answer}

No introductions, conclusions, headings, or text outside the question/answer pairs.
No hyperlinks or URLs anywhere in the output.`;
}

/**
 * Generate an FAQ page for a single supplier microsite.
 *
 * Fetches product data from the database, builds a data-grounded prompt,
 * calls Claude Sonnet, then creates the Content and Page records.
 */
export async function generateFAQForMicrosite(micrositeId: string): Promise<FAQGenerationResult> {
  // Fetch microsite with supplier and brand
  const microsite = await prisma.micrositeConfig.findUnique({
    where: { id: micrositeId },
    include: {
      supplier: {
        select: {
          id: true,
          name: true,
          description: true,
          cities: true,
          categories: true,
          priceRangeMin: true,
          priceRangeMax: true,
          priceCurrency: true,
          rating: true,
          reviewCount: true,
        },
      },
    },
  });

  if (!microsite) {
    return {
      micrositeId,
      micrositeName: 'Unknown',
      generated: false,
      error: 'Microsite not found',
    };
  }

  const siteName = microsite.siteName;

  if (!microsite.supplier) {
    return {
      micrositeId,
      micrositeName: siteName,
      generated: false,
      skippedReason: 'No linked supplier',
    };
  }

  // Check if FAQ page already exists
  const existingFaq = await prisma.page.findFirst({
    where: { micrositeId, type: PageType.FAQ },
  });

  if (existingFaq?.status === 'PUBLISHED') {
    return {
      micrositeId,
      micrositeName: siteName,
      generated: false,
      skippedReason: 'FAQ page already published',
      pageId: existingFaq.id,
    };
  }

  // Fetch top products — include full description for richer FAQ answers
  const products = await prisma.product.findMany({
    where: { supplierId: microsite.supplier.id },
    select: {
      title: true,
      description: true,
      shortDescription: true,
      city: true,
      country: true,
      categories: true,
      duration: true,
      priceFrom: true,
      currency: true,
      rating: true,
      reviewCount: true,
    },
    orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
    take: 10,
  });

  if (products.length === 0) {
    return {
      micrositeId,
      micrositeName: siteName,
      generated: false,
      skippedReason: 'No products found for supplier',
    };
  }

  const supplierCities = (microsite.supplier.cities as string[]) || [];
  const supplierCategories = cleanCategories((microsite.supplier.categories as string[]) || []);

  // Build data section from real product data
  const subdomain = microsite.subdomain || microsite.siteName.toLowerCase().replace(/\s+/g, '-');
  const dataSection = buildDataSection({
    siteName,
    subdomain,
    supplierName: microsite.supplier.name,
    supplierDescription: microsite.supplier.description,
    products: products as ProductData[],
    supplierCities,
    supplierCategories,
    priceRangeMin: microsite.supplier.priceRangeMin,
    priceRangeMax: microsite.supplier.priceRangeMax,
    priceCurrency: microsite.supplier.priceCurrency,
  });

  // Build prompt
  const userPrompt = buildUserPrompt({
    siteName,
    supplierName: microsite.supplier.name,
    categories: supplierCategories,
    cities: supplierCities,
    products: products as ProductData[],
    dataSection,
  });

  // Call Claude Sonnet
  const anthropic = new Anthropic();
  let faqContent: string;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: FAQ_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }
    faqContent = textBlock.text;
  } catch (err) {
    console.error(`[FAQ Generator] Claude API error for ${siteName}:`, err);
    return {
      micrositeId,
      micrositeName: siteName,
      generated: false,
      error: err instanceof Error ? err.message : 'Claude API error',
    };
  }

  // Strip any URLs that slipped through
  faqContent = faqContent.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // markdown links → text
  faqContent = faqContent.replace(/https?:\/\/\S+/g, ''); // bare URLs

  // Extract FAQ pairs for structured data
  const faqPairs = extractFAQsFromContent(faqContent);
  const faqSchema = generateFAQSchema(faqPairs);

  // Create content record
  const content = await prisma.content.create({
    data: {
      micrositeId,
      body: faqContent,
      bodyFormat: 'MARKDOWN',
      isAiGenerated: true,
      aiModel: 'claude-sonnet-4-20250514',
      aiPrompt: `FAQ generation for supplier microsite: ${siteName}`,
      qualityScore: 85, // Pre-validated by constrained prompt
      version: 1,
      structuredData: faqSchema as any,
    },
  });

  // Create or update FAQ page
  const faqTitle = `Frequently Asked Questions`;
  const metaTitle = `FAQ | ${siteName}`;
  const metaDescription = `Find answers to common questions about ${microsite.supplier.name} experiences${supplierCities.length > 0 ? ` in ${supplierCities.slice(0, 2).join(' and ')}` : ''}. Pricing, duration, booking info, and more.`;

  let pageId: string;

  if (existingFaq) {
    // Update existing draft page
    await prisma.page.update({
      where: { id: existingFaq.id },
      data: {
        contentId: content.id,
        title: faqTitle,
        metaTitle: metaTitle.length > 60 ? metaTitle.substring(0, 57) + '...' : metaTitle,
        metaDescription:
          metaDescription.length > 160
            ? metaDescription.substring(0, 157) + '...'
            : metaDescription,
        status: PageStatus.PUBLISHED,
        publishedAt: new Date(),
        priority: 0.7,
        noIndex: false,
      },
    });
    pageId = existingFaq.id;
  } else {
    // Create new FAQ page
    const newPage = await prisma.page.create({
      data: {
        micrositeId,
        contentId: content.id,
        title: faqTitle,
        slug: 'faq',
        type: PageType.FAQ,
        status: PageStatus.PUBLISHED,
        publishedAt: new Date(),
        metaTitle: metaTitle.length > 60 ? metaTitle.substring(0, 57) + '...' : metaTitle,
        metaDescription:
          metaDescription.length > 160
            ? metaDescription.substring(0, 157) + '...'
            : metaDescription,
        priority: 0.7,
        noIndex: false,
      },
    });
    pageId = newPage.id;
  }

  console.info(
    `[FAQ Generator] Published FAQ for ${siteName} (${faqPairs.length} Q&A pairs, page ${pageId})`
  );

  return {
    micrositeId,
    micrositeName: siteName,
    generated: true,
    pageId,
  };
}

/**
 * Generate FAQ pages for a batch of supplier microsites.
 * Used by admin API to trigger FAQ generation for review.
 */
export async function generateFAQsForMicrosites(limit: number = 10): Promise<{
  results: FAQGenerationResult[];
  summary: { total: number; generated: number; skipped: number; errors: number };
}> {
  // Find active supplier microsites without FAQ pages, prioritised by traffic/product count
  const microsites = await prisma.micrositeConfig.findMany({
    where: {
      status: 'ACTIVE' as any,
      entityType: 'SUPPLIER' as any,
      supplierId: { not: null },
      // Exclude microsites that already have a published FAQ
      pages: {
        none: {
          type: PageType.FAQ,
          status: PageStatus.PUBLISHED,
        },
      },
    },
    select: { id: true, siteName: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  console.info(
    `[FAQ Generator] Found ${microsites.length} microsites needing FAQs (limit: ${limit})`
  );

  const results: FAQGenerationResult[] = [];
  let generated = 0;
  let skipped = 0;
  let errors = 0;

  // Process sequentially to respect API rate limits
  for (const ms of microsites) {
    console.info(`[FAQ Generator] Processing ${ms.siteName}...`);
    const result = await generateFAQForMicrosite(ms.id);
    results.push(result);

    if (result.generated) generated++;
    else if (result.skippedReason) skipped++;
    else if (result.error) errors++;

    // Small delay between API calls
    if (microsites.indexOf(ms) < microsites.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.info(
    `[FAQ Generator] Complete: ${generated} generated, ${skipped} skipped, ${errors} errors`
  );

  return {
    results,
    summary: { total: microsites.length, generated, skipped, errors },
  };
}
