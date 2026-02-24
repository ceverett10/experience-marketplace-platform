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
import { checkAdCoherence, type CoherenceCheckInput } from './ad-coherence-checker';
import { reviewImageForCampaign } from './ad-image-reviewer';

export interface AdCreative {
  headline: string; // Max 40 chars for Meta
  body: string; // Max 125 chars primary text
  callToAction: string; // BOOK_TRAVEL | LEARN_MORE | SHOP_NOW
  imageUrl: string | null;
  source: 'ai' | 'template'; // Track how it was generated
  // Image review metadata (populated when AI reviewer selects the image)
  imageSource?: string; // 'product' | 'supplier' | 'unsplash' | 'site'
  imageReviewScore?: number; // 1-10
  imageReviewReasoning?: string; // AI explanation
  // Coherence check metadata (populated when coherence checker validates the full package)
  coherenceScore?: number; // 1-10
  coherencePass?: boolean; // score >= 6
  coherenceIssues?: string[]; // Specific misalignment problems
  coherenceSummary?: string; // One-sentence assessment
  remediated?: boolean; // true if text was regenerated due to low coherence
}

export interface AdCreativeInput {
  keywords: string[];
  siteId?: string | null;
  micrositeId?: string | null;
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

  // Fetch site context for the prompt (prefer microsite context when available)
  const context = input.micrositeId
    ? await fetchMicrositeContext(input.micrositeId, input.landingPagePath)
    : input.siteId
      ? await fetchSiteContext(input.siteId, input.landingPagePath)
      : null;

  // Step 1: Generate text (AI with template fallback)
  let creative: AdCreative | null = null;
  try {
    creative = await generateWithAI(input, context);
  } catch (error) {
    console.warn(
      `[AdCreative] AI generation failed, using template fallback: ${error instanceof Error ? error.message : error}`
    );
  }
  if (!creative) {
    creative = generateFromTemplate(primaryKw, input, context);
  }

  // Step 2: AI image review — select best image from multiple sources
  creative = await runImageReview(creative, input, context);

  // Step 3: Coherence check — validate full creative against landing page
  const landingPage = buildLandingPageContext(context, input.landingPageProducts);
  try {
    const coherence = await checkAdCoherence({
      headline: creative.headline,
      body: creative.body,
      callToAction: creative.callToAction,
      imageUrl: creative.imageUrl,
      imageSource: creative.imageSource,
      keywords: input.keywords,
      landingPage,
    });
    if (coherence) {
      creative.coherenceScore = coherence.score;
      creative.coherencePass = coherence.pass;
      creative.coherenceIssues = coherence.issues;
      creative.coherenceSummary = coherence.summary;

      console.log(
        `[AdCreative] Coherence: ${coherence.score}/10 ${coherence.pass ? 'PASS' : 'FAIL'} — ${coherence.summary}`
      );

      // Step 4: Remediation — if coherence fails, regenerate with issues as constraints
      if (!coherence.pass && coherence.issues.length > 0) {
        console.log(`[AdCreative] Remediating: issues = ${coherence.issues.join('; ')}`);
        try {
          const remediated = await generateWithAI(input, context, coherence.issues);
          if (remediated) {
            remediated.remediated = true;
            // Re-run image review with updated text
            const withImage = await runImageReview(remediated, input, context);
            // Re-check coherence (accept whatever score — don't loop further)
            const recheck = await checkAdCoherence({
              headline: withImage.headline,
              body: withImage.body,
              callToAction: withImage.callToAction,
              imageUrl: withImage.imageUrl,
              imageSource: withImage.imageSource,
              keywords: input.keywords,
              landingPage,
            });
            if (recheck) {
              withImage.coherenceScore = recheck.score;
              withImage.coherencePass = recheck.pass;
              withImage.coherenceIssues = recheck.issues;
              withImage.coherenceSummary = recheck.summary;
              console.log(
                `[AdCreative] Post-remediation coherence: ${recheck.score}/10 ${recheck.pass ? 'PASS' : 'FAIL'}`
              );
            }
            creative = withImage;
          }
        } catch (err) {
          console.warn(
            `[AdCreative] Remediation failed, keeping original: ${err instanceof Error ? err.message : err}`
          );
        }
      }
    }
  } catch (err) {
    console.warn(
      `[AdCreative] Coherence check failed: ${err instanceof Error ? err.message : err}`
    );
  }

  return creative;
}

/** Run AI image review and attach results to creative. */
async function runImageReview(
  creative: AdCreative,
  input: AdCreativeInput,
  context: SiteContext | null
): Promise<AdCreative> {
  try {
    const reviewed = await reviewImageForCampaign({
      keywords: input.keywords,
      micrositeId: input.micrositeId,
      siteId: input.siteId,
      headline: creative.headline,
      body: creative.body,
      brandName: context?.brandName || input.siteName,
    });
    if (reviewed) {
      creative.imageUrl = reviewed.selectedUrl;
      creative.imageSource = reviewed.selectedSource;
      creative.imageReviewScore = reviewed.score;
      creative.imageReviewReasoning = reviewed.reasoning;
    }
  } catch (err) {
    console.warn(
      `[AdCreative] Image review failed, using fallback: ${err instanceof Error ? err.message : err}`
    );
  }
  return creative;
}

/** Build landing page context object for coherence check from SiteContext. */
function buildLandingPageContext(
  context: SiteContext | null,
  productCount?: number | null
): CoherenceCheckInput['landingPage'] {
  if (!context?.pageTitle && !context?.pageBody) return null;
  return {
    title: context?.pageTitle ?? null,
    description: context?.pageDescription ?? null,
    bodyExcerpt: context?.pageBody ?? null,
    type: context?.pageType ?? null,
    productCount: productCount ?? null,
  };
}

// --- Context Fetching --------------------------------------------------------

export interface SiteContext {
  brandName: string;
  tagline: string | null;
  tonePersonality: string[];
  niche: string;
  pageTitle: string | null;
  pageDescription: string | null;
  pageBody: string | null; // First ~600 chars of landing page content (markdown stripped)
  pageType: string | null; // LANDING, CATEGORY, BLOG, etc.
  imageUrl: string | null;
}

export async function fetchSiteContext(
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

  // Fetch landing page title/description/body if available
  let pageTitle: string | null = null;
  let pageDescription: string | null = null;
  let pageBody: string | null = null;
  let pageType: string | null = null;
  if (landingPagePath) {
    const pageSelect = {
      title: true,
      metaDescription: true,
      type: true,
      content: { select: { body: true } },
    } as const;

    let page: {
      title: string | null;
      metaDescription: string | null;
      type: string;
      content: { body: string | null } | null;
    } | null = null;

    if (landingPagePath === '/' || landingPagePath === '') {
      // Homepage — slug is empty string in the DB
      page = await prisma.page.findFirst({
        where: { siteId, type: 'HOMEPAGE', status: 'PUBLISHED' },
        select: pageSelect,
      });
    } else if (landingPagePath.startsWith('/experiences?categories=')) {
      // Dynamic category filter page — try to find a matching CATEGORY page
      const category = decodeURIComponent(
        landingPagePath.replace('/experiences?categories=', '').replace(/\+/g, ' ')
      );
      page = await prisma.page.findFirst({
        where: {
          siteId,
          type: 'CATEGORY',
          status: 'PUBLISHED',
          title: { contains: category, mode: 'insensitive' },
        },
        select: pageSelect,
      });
    } else if (landingPagePath.startsWith('/experiences?cities=')) {
      // Dynamic city filter page — try to find a LANDING page for that city
      const city = decodeURIComponent(
        landingPagePath.replace('/experiences?cities=', '').replace(/\+/g, ' ')
      );
      page = await prisma.page.findFirst({
        where: {
          siteId,
          type: 'LANDING',
          status: 'PUBLISHED',
          title: { contains: city, mode: 'insensitive' },
        },
        select: pageSelect,
      });
    } else {
      // Standard page — try exact slug, then without leading slash
      const slug = landingPagePath.startsWith('/') ? landingPagePath.substring(1) : landingPagePath;
      page = await prisma.page.findFirst({
        where: { siteId, slug, status: 'PUBLISHED' },
        select: pageSelect,
      });
    }

    if (page) {
      pageTitle = page.title;
      pageDescription = page.metaDescription;
      pageType = page.type;
      if (page.content?.body) {
        pageBody = stripMarkdownForPrompt(page.content.body, 600);
      }
    }
  }

  // Fallback image: hero > OG image > logo (used when AI image review is unavailable)
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
    pageBody,
    pageType,
    imageUrl,
  };
}

/**
 * Fetch context from a MicrositeConfig for ad creative generation.
 * Microsites have their own brand, pages, and identity separate from the parent site.
 */
async function fetchMicrositeContext(
  micrositeId: string,
  landingPagePath?: string | null
): Promise<SiteContext | null> {
  const ms = await prisma.micrositeConfig.findUnique({
    where: { id: micrositeId },
    select: {
      siteName: true,
      tagline: true,
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

  if (!ms) return null;

  const seoConfig = ms.seoConfig as Record<string, unknown> | null;
  const toneOfVoice = seoConfig?.['toneOfVoice'] as Record<string, unknown> | undefined;

  // Fetch landing page by micrositeId
  let pageTitle: string | null = null;
  let pageDescription: string | null = null;
  let pageBody: string | null = null;
  let pageType: string | null = null;
  if (landingPagePath) {
    const pageSelect = {
      title: true,
      metaDescription: true,
      type: true,
      content: { select: { body: true } },
    } as const;

    let page: {
      title: string | null;
      metaDescription: string | null;
      type: string;
      content: { body: string | null } | null;
    } | null = null;

    if (landingPagePath === '/' || landingPagePath === '') {
      page = await prisma.page.findFirst({
        where: { micrositeId, type: 'HOMEPAGE', status: 'PUBLISHED' },
        select: pageSelect,
      });
    } else if (landingPagePath.startsWith('/experiences?categories=')) {
      const category = decodeURIComponent(
        landingPagePath.replace('/experiences?categories=', '').replace(/\+/g, ' ')
      );
      page = await prisma.page.findFirst({
        where: {
          micrositeId,
          type: 'CATEGORY',
          status: 'PUBLISHED',
          title: { contains: category, mode: 'insensitive' },
        },
        select: pageSelect,
      });
    } else if (landingPagePath.startsWith('/experiences?cities=')) {
      const city = decodeURIComponent(
        landingPagePath.replace('/experiences?cities=', '').replace(/\+/g, ' ')
      );
      page = await prisma.page.findFirst({
        where: {
          micrositeId,
          type: 'LANDING',
          status: 'PUBLISHED',
          title: { contains: city, mode: 'insensitive' },
        },
        select: pageSelect,
      });
    } else {
      const slug = landingPagePath.startsWith('/') ? landingPagePath.substring(1) : landingPagePath;
      page = await prisma.page.findFirst({
        where: { micrositeId, slug, status: 'PUBLISHED' },
        select: pageSelect,
      });
    }

    if (page) {
      pageTitle = page.title;
      pageDescription = page.metaDescription;
      pageType = page.type;
      if (page.content?.body) {
        pageBody = stripMarkdownForPrompt(page.content.body, 600);
      }
    }
  }

  const imageUrl = ms.brand?.ogImageUrl || ms.brand?.logoUrl || null;

  return {
    brandName: ms.brand?.name || ms.siteName,
    tagline: ms.tagline || ms.brand?.tagline || null,
    tonePersonality: (toneOfVoice?.['personality'] as string[]) || [],
    niche:
      (seoConfig?.['niche'] as string) ||
      (seoConfig?.['primaryCategory'] as string) ||
      'travel experiences',
    pageTitle,
    pageDescription,
    pageBody,
    pageType,
    imageUrl,
  };
}

// --- AI Generation -----------------------------------------------------------

async function generateWithAI(
  input: AdCreativeInput,
  context: SiteContext | null,
  coherenceIssues?: string[]
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
  if (context?.pageBody) {
    contextLines.push(`Landing page content: "${context.pageBody.substring(0, 200)}..."`);
  }

  // When remediating, add explicit constraints from the coherence check
  const remediationBlock = coherenceIssues?.length
    ? `\nCOHERENCE ISSUES TO FIX (from previous review):
${coherenceIssues.map((issue) => `- ${issue}`).join('\n')}
You MUST address each issue above. Ensure the ad copy aligns with the landing page content.\n`
    : '';

  const prompt = `You are a performance marketing copywriter for a travel experiences platform.
Brand: "${brand}". Tone: ${tone}.
Target keyword: ${primaryKw}
Destination/activity: ${destination}
${contextLines.length > 0 ? contextLines.join('\n') : ''}
${remediationBlock}
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
  const body = `Tours, activities & experiences in ${destination}. Book today!`.substring(0, 125);

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
export function extractDestination(keyword: string): string {
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
export function toTitleCase(str: string): string {
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

/**
 * Strip markdown formatting for cleaner AI prompt text.
 * Removes headers, links, bold, horizontal rules, etc.
 */
export function stripMarkdownForPrompt(body: string, maxLen: number): string {
  return body
    .replace(/^#{1,6}\s+/gm, '') // Remove markdown headers
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/\*\*([^*]*)\*\*/g, '$1') // **bold** → bold
    .replace(/\*([^*]*)\*/g, '$1') // *italic* → italic
    .replace(/^[-*_]{3,}\s*$/gm, '') // Remove horizontal rules
    .replace(/^[>]\s*/gm, '') // Remove blockquotes
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // Remove images
    .replace(/\n{3,}/g, '\n\n') // Collapse excessive newlines
    .trim()
    .substring(0, maxLen);
}
