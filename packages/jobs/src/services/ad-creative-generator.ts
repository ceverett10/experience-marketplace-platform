/**
 * AI-powered ad creative generator for Meta Ads.
 *
 * Uses Claude Haiku to generate tailored headlines, body copy, and CTA
 * based on campaign context (keywords, brand, landing page, geo targets).
 * Falls back to template-based generation if AI is unavailable.
 *
 * Reuses the circuit breaker + Anthropic API pattern from caption-generator.ts.
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

  // Fallback: template-based generation
  return generateFromTemplate(primaryKw, input.siteName, context?.imageUrl ?? null);
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
  const tone =
    context?.tonePersonality.length ? context.tonePersonality.join(', ') : 'friendly, enthusiastic';
  const niche = context?.niche || 'travel experiences';

  // Build context lines for the prompt
  const contextLines: string[] = [];
  if (input.landingPageType) {
    const parts = [`Landing page type: ${input.landingPageType}`];
    if (context?.pageTitle) parts.push(`"${context.pageTitle}"`);
    if (input.landingPageProducts) parts.push(`(${input.landingPageProducts} experiences)`);
    contextLines.push(parts.join(' — '));
  }
  if (input.geoTargets.length > 0) {
    contextLines.push(`Target market: ${input.geoTargets.join(', ')}`);
  }
  if (input.keywords.length > 1) {
    contextLines.push(`Related keywords: ${input.keywords.slice(1, 5).join(', ')}`);
  }

  const prompt = `You are a performance marketing copywriter for "${brand}"${tagline}, a ${niche} brand.
Brand tone: ${tone}.
Target keyword: ${primaryKw}
${contextLines.length > 0 ? contextLines.join('\n') : ''}

Write a Facebook ad that drives clicks to book experiences.

Rules:
- HEADLINE: Max 40 characters. Include the destination or activity name. Be specific and enticing — use numbers, questions, or urgency where natural.
- BODY: Max 125 characters. Lead with the benefit. Include a proof point (number of experiences, rating, or value). Match the brand tone.
- CTA: Pick the best fit: BOOK_TRAVEL, LEARN_MORE, or SHOP_NOW

Good headlines: "48 Top-Rated Ghent Tours from £12" / "Wine Tasting in Tuscany?" / "Explore Leiden: 23 Experiences"
Bad headlines: "Restaurants Ghent | Harry Potter Tours" / "Book Travel Experiences"

Good body: "4.8★ food tours, walking tours & more in Ghent. Free cancellation. Book today."
Bad body: "Discover and book amazing restaurants ghent experiences. Best prices."

Format EXACTLY as:
HEADLINE: [headline]
BODY: [body text]
CTA: [BOOK_TRAVEL or LEARN_MORE or SHOP_NOW]`;

  const breaker = circuitBreakers.getBreaker('anthropic-api', {
    failureThreshold: 3,
    timeout: 30000,
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

function generateFromTemplate(
  primaryKw: string,
  siteName: string,
  imageUrl: string | null
): AdCreative {
  const kwTitle = primaryKw.charAt(0).toUpperCase() + primaryKw.slice(1);
  return {
    headline: `${kwTitle} | ${siteName}`.substring(0, 40),
    body: `Discover and book amazing ${primaryKw} experiences. Best prices, instant confirmation.`,
    callToAction: 'BOOK_TRAVEL',
    imageUrl,
    source: 'template',
  };
}
