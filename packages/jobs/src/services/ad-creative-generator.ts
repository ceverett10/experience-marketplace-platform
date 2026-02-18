/**
 * AI-powered ad creative generator for Meta Ads.
 *
 * Uses Claude Haiku to generate tailored headlines, body copy, and CTA
 * based on campaign context (keywords, brand, landing page, geo targets).
 * Falls back to template-based generation if AI is unavailable.
 *
 * Uses its OWN circuit breaker key ('ad-creative-ai') separate from
 * caption-generator to avoid cross-service interference.
 */

import { prisma } from '@experience-marketplace/database';
import { circuitBreakers } from '../errors/circuit-breaker';

export interface AdCreative {
  headline: string; // Max 40 chars for Meta
  body: string; // Max 125 chars primary text
  callToAction: string; // BOOK_TRAVEL | LEARN_MORE | SHOP_NOW
  imageUrl: string | null;
  source: 'ai' | 'template'; // Track how it was generated
}

export interface AdCreativeInput {
  keywords: string[];
  siteId?: string | null;
  siteName: string;
  landingPagePath?: string | null;
  landingPageType?: string | null;
  landingPageProducts?: number | null;
  geoTargets: string[];
}

/**
 * Generate an ad creative for a Meta campaign.
 * Fetches brand/site context, calls Claude Haiku, falls back to template on failure.
 */
export async function generateAdCreative(input: AdCreativeInput): Promise<AdCreative> {
  const primaryKw = input.keywords[0] || 'travel';

  // Fetch site context for the prompt
  const context = input.siteId ? await fetchSiteContext(input.siteId, input.landingPagePath) : null;

  // Try AI generation
  try {
    const creative = await generateWithAI(input, context);
    if (creative) return creative;
  } catch (error) {
    console.warn(
      `[AdCreative] AI generation failed, using template fallback: ${error instanceof Error ? error.message : error}`
    );
  }

  // Fallback: template-based generation (improved quality)
  return generateFromTemplate(primaryKw, input, context);
}

// --- Context Fetching --------------------------------------------------------

interface SiteContext {
  brandName: string;
  tagline: string | null;
  tonePersonality: string[];
  niche: string;
  pageTitle: string | null;
  pageDescription: string | null;
  imageUrl: string | null;
}

async function fetchSiteContext(
  siteId: string,
  landingPagePath?: string | null
): Promise<SiteContext | null> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      name: true,
      homepageConfig: true,
      seoConfig: true,
      brand: {
        select: {
          name: true,
          tagline: true,
          ogImageUrl: true,
          logoUrl: true,
        },
      },
    },
  });

  if (!site) return null;

  const seoConfig = site.seoConfig as Record<string, unknown> | null;
  const toneOfVoice = seoConfig?.['toneOfVoice'] as Record<string, unknown> | undefined;
  const homepageConfig = site.homepageConfig as Record<string, unknown> | null;
  const hero = homepageConfig?.['hero'] as Record<string, unknown> | undefined;

  // Fetch landing page title/description if available
  let pageTitle: string | null = null;
  let pageDescription: string | null = null;
  if (landingPagePath) {
    const page = await prisma.page.findFirst({
      where: { siteId, slug: landingPagePath, status: 'PUBLISHED' },
      select: { title: true, metaDescription: true },
    });
    if (page) {
      pageTitle = page.title;
      pageDescription = page.metaDescription;
    }
  }

  // Image priority: hero > OG image > logo
  const imageUrl =
    (hero?.['backgroundImage'] as string) || site.brand?.ogImageUrl || site.brand?.logoUrl || null;

  return {
    brandName: site.brand?.name || site.name,
    tagline: site.brand?.tagline || null,
    tonePersonality: (toneOfVoice?.['personality'] as string[]) || [],
    niche:
      (seoConfig?.['niche'] as string) ||
      (seoConfig?.['primaryCategory'] as string) ||
      'travel experiences',
    pageTitle,
    pageDescription,
    imageUrl,
  };
}

// --- AI Generation -----------------------------------------------------------

async function generateWithAI(
  input: AdCreativeInput,
  context: SiteContext | null
): Promise<AdCreative | null> {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicApiKey) return null;

  const primaryKw = input.keywords[0] || 'travel';
  const brand = context?.brandName || input.siteName;
  const tagline = context?.tagline ? ` (${context.tagline})` : '';
  const tone = context?.tonePersonality.length
    ? context.tonePersonality.join(', ')
    : 'friendly, enthusiastic';
  const niche = context?.niche || 'travel experiences';

  // Extract destination from keyword (title-case it)
  const destination = toTitleCase(extractDestination(primaryKw));

  // Build context lines for the prompt
  const contextLines: string[] = [];
  if (input.landingPageType) {
    const parts = [`Landing page type: ${input.landingPageType}`];
    if (context?.pageTitle) parts.push(`"${context.pageTitle}"`);
    if (input.landingPageProducts)
      parts.push(`(${input.landingPageProducts} experiences available)`);
    contextLines.push(parts.join(' — '));
  }
  if (input.geoTargets.length > 0) {
    contextLines.push(`Target market: ${input.geoTargets.join(', ')}`);
  }
  if (input.keywords.length > 1) {
    contextLines.push(`Related keywords: ${input.keywords.slice(1, 5).join(', ')}`);
  }
  if (context?.pageDescription) {
    contextLines.push(`Page description: ${context.pageDescription.substring(0, 150)}`);
  }

  const prompt = `You are a performance marketing copywriter for a travel experiences platform.
Brand: "${brand}". Tone: ${tone}.
Target keyword: ${primaryKw}
Destination/activity: ${destination}
${contextLines.length > 0 ? contextLines.join('\n') : ''}

Write a Facebook ad for "${destination}" experiences that drives clicks.

CRITICAL RULES:
- The ad MUST be specifically about "${destination}". Do NOT mention activities or locations that are not relevant to "${destination}".
- Do NOT reference the brand's other activities (e.g., do NOT mention whitewater, rafting, or other sports unless the keyword is specifically about those activities in ${destination}).
- HEADLINE: Max 40 characters. Include "${destination}" or a shortened form. Be specific and enticing.
- BODY: Max 125 characters. Focus on what travelers can do in ${destination}. Do NOT invent specific numbers (star ratings, prices, experience counts). Do NOT claim "free cancellation" — use "book today" or "explore now" as CTA instead.
- CTA: BOOK_TRAVEL, LEARN_MORE, or SHOP_NOW

Good headlines: "Discover Ghent: Tours & Activities" / "Wine Tasting in Tuscany?" / "Explore Leiden Today"
Bad headlines: "Restaurants Ghent | Harry Potter Tours" / "Book Travel Experiences" / "Epic Whitewater in Ghent"

Good body: "Walking tours, food tours & more in Ghent. Book today!"
Bad body: "Whitewater thrills and epic adventures await. Trusted by 10K+ explorers."

Format EXACTLY as:
HEADLINE: [headline]
BODY: [body text]
CTA: [BOOK_TRAVEL or LEARN_MORE or SHOP_NOW]`;

  // Use dedicated circuit breaker for ad creatives, separate from caption generation
  const breaker = circuitBreakers.getBreaker('ad-creative-ai', {
    failureThreshold: 5,
    timeout: 60000,
  });

  const response = await breaker.execute(async () => {
    return await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${JSON.stringify(errorData)}`);
  }

  const data = (await response.json()) as { content: Array<{ text: string }> };
  const text = data.content[0]?.text || '';

  return parseAIResponse(text, context?.imageUrl ?? null);
}

function parseAIResponse(text: string, imageUrl: string | null): AdCreative | null {
  const headlineMatch = text.match(/HEADLINE:\s*(.+)/i);
  const bodyMatch = text.match(/BODY:\s*(.+)/i);
  const ctaMatch = text.match(/CTA:\s*(.+)/i);

  if (!headlineMatch || !bodyMatch) return null;

  const headline = headlineMatch[1]!.trim().substring(0, 40);
  const body = bodyMatch[1]!.trim().substring(0, 125);
  const rawCta = ctaMatch?.[1]?.trim().toUpperCase() || 'BOOK_TRAVEL';
  const callToAction = ['BOOK_TRAVEL', 'LEARN_MORE', 'SHOP_NOW'].includes(rawCta)
    ? rawCta
    : 'BOOK_TRAVEL';

  return { headline, body, callToAction, imageUrl, source: 'ai' };
}

// --- Template Fallback -------------------------------------------------------

/**
 * Improved template fallback — generates decent copy even without AI.
 * Uses destination extraction and title-casing instead of raw keywords.
 */
function generateFromTemplate(
  primaryKw: string,
  input: AdCreativeInput,
  context: SiteContext | null
): AdCreative {
  const destination = toTitleCase(extractDestination(primaryKw));
  const brand = context?.brandName || input.siteName;
  const imageUrl = context?.imageUrl ?? null;

  // Build a clean headline: "Explore {Destination}" or "Discover {Destination}"
  // Try different prefixes to fit within 40 chars
  const prefixes = ['Explore', 'Discover', 'Visit'];
  let headline = '';
  for (const prefix of prefixes) {
    const candidate = `${prefix} ${destination} Today`;
    if (candidate.length <= 40) {
      headline = candidate;
      break;
    }
  }
  if (!headline) {
    // Destination alone is long — just use it with a question mark
    headline = `${destination}?`.substring(0, 40);
  }

  // Build a better body using destination name
  const body =
    `Tours, activities & experiences in ${destination}. Book today!`.substring(0, 125);

  return {
    headline,
    body,
    callToAction: 'BOOK_TRAVEL',
    imageUrl,
    source: 'template',
  };
}

// --- Utilities ---------------------------------------------------------------

/**
 * Extract the destination/activity name from a keyword.
 * "things to do in curitiba" → "curitiba"
 * "wine tours croatia" → "croatia"
 * "legoland windsor resort hours" → "legoland windsor"
 * "restaurants ghent" → "ghent"
 */
function extractDestination(keyword: string): string {
  // Remove common prefixes and suffixes to extract the destination/activity core
  const cleaned = keyword
    .replace(/^(things to do in|what to do in|best things to do in|top things to do in)\s+/i, '')
    .replace(
      /^(restaurants in|restaurants|hotels in|hotels|wildlife in|activities in|tours in)\s+/i,
      ''
    )
    .replace(/^(train|bus|flight|ferry|transfer)\s+/i, '')
    .replace(/\s+(opening hours|opening times|hours|tickets|prices|cost|review|reviews)$/i, '')
    .replace(/\s+(tourism|resort|park|museum|gallery)$/i, '')
    .trim();

  // If the cleaned result is very long, take the first 2-3 meaningful words
  const words = cleaned.split(/\s+/);
  if (words.length > 3) {
    return words.slice(0, 3).join(' ');
  }

  return cleaned || keyword;
}

/**
 * Title-case a string: "curitiba" → "Curitiba", "things to do" → "Things to Do"
 */
function toTitleCase(str: string): string {
  const minorWords = new Set(['in', 'of', 'the', 'and', 'to', 'a', 'an', 'at', 'by', 'for', 'on']);
  return str
    .split(/\s+/)
    .map((word, i) => {
      if (i === 0 || !minorWords.has(word.toLowerCase())) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word.toLowerCase();
    })
    .join(' ');
}
