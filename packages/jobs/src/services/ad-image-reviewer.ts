/**
 * AI-powered ad creative image reviewer.
 *
 * Collects candidate images from multiple sources (product catalog, supplier hero,
 * Unsplash, site brand) and uses multimodal Claude to evaluate which image best
 * matches the campaign's ad copy and destination.
 *
 * Uses its OWN circuit breaker key ('ad-image-review-ai') separate from
 * text generation to avoid cross-service interference.
 */

import { prisma } from '@experience-marketplace/database';
import { circuitBreakers } from '../errors/circuit-breaker';
import { extractDestination, toTitleCase } from './ad-creative-generator';

// Lazy import to avoid failures when UNSPLASH_ACCESS_KEY is not set
let unsplashService: {
  getDestinationImage: (name: string) => Promise<{ url: string; thumbnailUrl: string } | null>;
} | null = null;

function getUnsplash() {
  if (!unsplashService) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('./unsplash-images') as {
        getUnsplashService: () => typeof unsplashService;
      };
      unsplashService = mod.getUnsplashService();
    } catch {
      return null;
    }
  }
  return unsplashService;
}

// --- Types -------------------------------------------------------------------

export interface ImageCandidate {
  url: string; // Full-size for final ad
  thumbnailUrl: string; // ~400px for AI review (fewer tokens)
  source: 'product' | 'supplier' | 'unsplash' | 'site';
  label: string; // For logging: "Unsplash: Barcelona street food"
}

export interface ImageReviewResult {
  selectedUrl: string;
  selectedSource: string;
  reasoning: string; // AI's explanation (stored in proposalData)
  score: number; // 1-10
  candidatesEvaluated: number;
}

// In-memory cache for Unsplash results within a single run
const unsplashCache = new Map<string, ImageCandidate | null>();

// --- Candidate Collection ----------------------------------------------------

/**
 * Gather up to 4 candidate images from multiple sources for a campaign.
 */
export async function collectImageCandidates(
  keywords: string[],
  micrositeId?: string | null,
  siteId?: string | null
): Promise<ImageCandidate[]> {
  const candidates: ImageCandidate[] = [];
  const destination = extractDestination(keywords[0] || '');
  const MAX_CANDIDATES = 4;

  // 1. Product images matching the destination (up to 2)
  if (destination && destination.length >= 3) {
    try {
      const products = await prisma.product.findMany({
        where: {
          primaryImageUrl: { not: null },
          city: { contains: destination, mode: 'insensitive' },
        },
        select: { primaryImageUrl: true, title: true, city: true },
        orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
        take: 2,
      });
      for (const product of products) {
        if (product.primaryImageUrl && candidates.length < MAX_CANDIDATES) {
          candidates.push({
            url: product.primaryImageUrl,
            thumbnailUrl: product.primaryImageUrl,
            source: 'product',
            label: `Product: ${product.title?.substring(0, 50)} (${product.city})`,
          });
        }
      }
    } catch (err) {
      console.warn(
        `[ImageReviewer] Product image lookup failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // 2. Supplier hero image (for microsite campaigns)
  if (micrositeId && candidates.length < MAX_CANDIDATES) {
    try {
      const microsite = await prisma.micrositeConfig.findUnique({
        where: { id: micrositeId },
        select: { supplier: { select: { heroImageUrl: true, name: true } } },
      });
      if (microsite?.supplier?.heroImageUrl) {
        candidates.push({
          url: microsite.supplier.heroImageUrl,
          thumbnailUrl: microsite.supplier.heroImageUrl,
          source: 'supplier',
          label: `Supplier: ${microsite.supplier.name || 'hero image'}`,
        });
      }
    } catch (err) {
      console.warn(
        `[ImageReviewer] Supplier image lookup failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // 3. Unsplash destination image (1)
  if (destination && destination.length >= 3 && candidates.length < MAX_CANDIDATES) {
    const cacheKey = destination.toLowerCase();
    if (unsplashCache.has(cacheKey)) {
      const cached = unsplashCache.get(cacheKey);
      if (cached) candidates.push(cached);
    } else {
      try {
        const unsplash = getUnsplash();
        if (unsplash) {
          const result = await unsplash.getDestinationImage(toTitleCase(destination));
          if (result) {
            const candidate: ImageCandidate = {
              url: result.url,
              thumbnailUrl: result.thumbnailUrl,
              source: 'unsplash',
              label: `Unsplash: ${toTitleCase(destination)}`,
            };
            unsplashCache.set(cacheKey, candidate);
            candidates.push(candidate);
          } else {
            unsplashCache.set(cacheKey, null);
          }
        }
      } catch (err) {
        console.warn(
          `[ImageReviewer] Unsplash lookup failed: ${err instanceof Error ? err.message : err}`
        );
        unsplashCache.set(cacheKey, null);
      }
    }
  }

  // 4. Site brand image (filler if <4 candidates)
  if (siteId && candidates.length < MAX_CANDIDATES) {
    try {
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        select: {
          homepageConfig: true,
          brand: { select: { ogImageUrl: true, logoUrl: true } },
        },
      });
      if (site) {
        const homepageConfig = site.homepageConfig as Record<string, unknown> | null;
        const hero = homepageConfig?.['hero'] as Record<string, unknown> | undefined;
        const heroImage = hero?.['backgroundImage'] as string | undefined;
        const siteImage = heroImage || site.brand?.ogImageUrl;
        if (siteImage) {
          candidates.push({
            url: siteImage,
            thumbnailUrl: siteImage,
            source: 'site',
            label: 'Site: brand hero/OG image',
          });
        }
      }
    } catch (err) {
      console.warn(
        `[ImageReviewer] Site image lookup failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  return candidates;
}

// --- Image Fetching ----------------------------------------------------------

/**
 * Download an image and convert to base64 for the Claude multimodal API.
 * Returns null if the fetch fails or the image is too large.
 */
async function fetchImageAsBase64(
  url: string
): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const mediaType = contentType.split(';')[0]!.trim();

    // Only accept image types
    if (!mediaType.startsWith('image/')) return null;

    const buffer = await response.arrayBuffer();

    // Skip images over 5MB (Claude limit is ~20MB but keep it reasonable)
    if (buffer.byteLength > 5 * 1024 * 1024) return null;

    const base64 = Buffer.from(buffer).toString('base64');
    return { base64, mediaType };
  } catch {
    return null;
  }
}

// --- AI Review ---------------------------------------------------------------

/**
 * Use multimodal Claude to evaluate candidate images against ad copy.
 * Returns the best image with score and reasoning.
 */
export async function reviewImagesForAd(input: {
  candidates: ImageCandidate[];
  headline: string;
  body: string;
  destination: string;
}): Promise<ImageReviewResult | null> {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicApiKey) return null;

  const { candidates, headline, body, destination } = input;
  if (candidates.length === 0) return null;

  // Fetch all thumbnails as base64 in parallel
  const imageResults = await Promise.all(candidates.map((c) => fetchImageAsBase64(c.thumbnailUrl)));

  // Filter out failed fetches
  const validCandidates: Array<{
    candidate: ImageCandidate;
    image: { base64: string; mediaType: string };
  }> = [];
  for (let i = 0; i < candidates.length; i++) {
    if (imageResults[i]) {
      validCandidates.push({ candidate: candidates[i]!, image: imageResults[i]! });
    }
  }

  if (validCandidates.length === 0) return null;

  // If only 1 valid image, return it directly without AI call
  if (validCandidates.length === 1) {
    return {
      selectedUrl: validCandidates[0]!.candidate.url,
      selectedSource: validCandidates[0]!.candidate.source,
      reasoning: 'Only one valid candidate image available',
      score: 5,
      candidatesEvaluated: 1,
    };
  }

  // Build multimodal message content
  const content: Array<Record<string, unknown>> = [];

  const promptText = `You are an ad creative director reviewing images for a Facebook travel ad campaign.

Ad copy:
- HEADLINE: "${headline}"
- BODY: "${body}"
- DESTINATION: "${destination}"

Below are ${validCandidates.length} candidate images with their sources. Select the BEST image for this ad.

Consider:
1. RELEVANCE: Does it match the destination and activity in the ad copy?
2. QUALITY: Good composition, lighting, resolution for a Facebook ad?
3. EMOTION: Does it evoke desire to travel and book this experience?
4. COHERENCE: Does the image and ad text work together as a cohesive ad?

Respond EXACTLY as:
SELECTED: [number 1-${validCandidates.length}]
SCORE: [1-10]
REASON: [one sentence]`;

  content.push({ type: 'text', text: promptText });

  for (let i = 0; i < validCandidates.length; i++) {
    const vc = validCandidates[i]!;
    content.push({ type: 'text', text: `\n[Image ${i + 1}] - ${vc.candidate.label}:` });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: vc.image.mediaType,
        data: vc.image.base64,
      },
    });
  }

  // Call Claude with circuit breaker
  const breaker = circuitBreakers.getBreaker('ad-image-review-ai', {
    failureThreshold: 3,
    timeout: 120000,
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
        max_tokens: 100,
        messages: [{ role: 'user', content }],
      }),
    });
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${JSON.stringify(errorData)}`);
  }

  const data = (await response.json()) as { content: Array<{ text: string }> };
  const text = data.content[0]?.text || '';

  return parseReviewResponse(
    text,
    validCandidates.map((vc) => vc.candidate)
  );
}

function parseReviewResponse(text: string, candidates: ImageCandidate[]): ImageReviewResult | null {
  const selectedMatch = text.match(/SELECTED:\s*(\d+)/i);
  const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
  const reasonMatch = text.match(/REASON:\s*(.+)/i);

  if (!selectedMatch) return null;

  const index = parseInt(selectedMatch[1]!) - 1;
  if (index < 0 || index >= candidates.length) return null;

  const candidate = candidates[index]!;
  return {
    selectedUrl: candidate.url, // Full-size URL for the actual ad
    selectedSource: candidate.source,
    reasoning: reasonMatch?.[1]?.trim() || '',
    score: Math.min(10, Math.max(1, parseInt(scoreMatch?.[1] || '5'))),
    candidatesEvaluated: candidates.length,
  };
}

// --- Orchestrator ------------------------------------------------------------

/**
 * High-level entry point: collect candidates + run AI review.
 * Returns the reviewed image, or null if review not possible.
 */
export async function reviewImageForCampaign(input: {
  keywords: string[];
  micrositeId?: string | null;
  siteId?: string | null;
  headline: string;
  body: string;
  brandName: string;
}): Promise<ImageReviewResult | null> {
  const destination = toTitleCase(extractDestination(input.keywords[0] || ''));

  // Collect candidates from all sources
  const candidates = await collectImageCandidates(input.keywords, input.micrositeId, input.siteId);

  if (candidates.length === 0) {
    console.warn('[ImageReviewer] No candidate images found');
    return null;
  }

  console.log(
    `[ImageReviewer] Collected ${candidates.length} candidates for "${destination}": ${candidates.map((c) => c.source).join(', ')}`
  );

  // If only 1 candidate, return it directly (no point reviewing)
  if (candidates.length === 1) {
    return {
      selectedUrl: candidates[0]!.url,
      selectedSource: candidates[0]!.source,
      reasoning: 'Only one candidate image available',
      score: 5,
      candidatesEvaluated: 1,
    };
  }

  // Run AI review
  try {
    const result = await reviewImagesForAd({
      candidates,
      headline: input.headline,
      body: input.body,
      destination,
    });

    if (result) {
      console.log(
        `[ImageReviewer] Selected ${result.selectedSource} image (score: ${result.score}/10): ${result.reasoning}`
      );
    }

    return result;
  } catch (err) {
    console.warn(
      `[ImageReviewer] AI review failed, using first candidate: ${err instanceof Error ? err.message : err}`
    );
    // Fallback: return first candidate (prefer product/supplier over unsplash/site)
    return {
      selectedUrl: candidates[0]!.url,
      selectedSource: candidates[0]!.source,
      reasoning: 'AI review failed, using first candidate',
      score: 0,
      candidatesEvaluated: candidates.length,
    };
  }
}
