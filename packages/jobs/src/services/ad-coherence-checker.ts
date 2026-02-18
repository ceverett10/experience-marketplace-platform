/**
 * Ad creative coherence checker.
 *
 * Evaluates the full ad package (text + image + keywords) against the landing page
 * content to ensure consumers find what they expect when clicking the ad.
 *
 * Also provides utilities for extracting search terms from page content,
 * used when re-deriving interest targeting during remediation.
 *
 * Uses its OWN circuit breaker key ('ad-coherence-ai') separate from
 * text generation and image review.
 */

import { circuitBreakers } from '../errors/circuit-breaker';

// --- Types -------------------------------------------------------------------

export interface CoherenceCheckInput {
  headline: string;
  body: string;
  callToAction: string;
  imageUrl: string | null;
  imageSource?: string; // 'product' | 'supplier' | 'unsplash' | 'site'
  keywords: string[];
  landingPage: {
    title: string | null;
    description: string | null;
    bodyExcerpt: string | null; // First ~600 chars, markdown stripped
    type: string | null; // LANDING, CATEGORY, BLOG, etc.
    productCount?: number | null;
  } | null;
}

export interface CoherenceResult {
  score: number; // 1-10
  pass: boolean; // score >= 6
  issues: string[]; // Specific misalignment problems
  summary: string; // One-sentence assessment
}

// --- Coherence Check ---------------------------------------------------------

/**
 * Evaluate ad creative coherence against the landing page.
 * Returns null if landing page data is unavailable or API key is missing.
 */
export async function checkAdCoherence(
  input: CoherenceCheckInput
): Promise<CoherenceResult | null> {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicApiKey) return null;

  // Skip if no landing page data to validate against
  if (!input.landingPage) return null;

  const lp = input.landingPage;
  // Need at least a title or body to do a meaningful check
  if (!lp.title && !lp.bodyExcerpt) return null;

  const landingPageLines: string[] = [];
  if (lp.type) landingPageLines.push(`- Type: ${lp.type}`);
  if (lp.title) landingPageLines.push(`- Title: "${lp.title}"`);
  if (lp.description) landingPageLines.push(`- Description: "${lp.description}"`);
  if (lp.bodyExcerpt) landingPageLines.push(`- Content preview: "${lp.bodyExcerpt}"`);
  if (lp.productCount) landingPageLines.push(`- Products available: ${lp.productCount}`);

  const prompt = `You are an ad quality auditor for a travel experiences platform.

Review this Facebook ad campaign for internal coherence. A consumer who clicks this ad should find what they expect on the landing page.

CAMPAIGN KEYWORDS: ${input.keywords.join(', ')}

AD CREATIVE:
- Headline: "${input.headline}"
- Body: "${input.body}"
- CTA: ${input.callToAction}
- Image source: ${input.imageSource || 'unknown'}

LANDING PAGE:
${landingPageLines.join('\n')}

Evaluate alignment across these dimensions:
1. AD TEXT ↔ KEYWORDS: Does the ad copy accurately represent the campaign keywords?
2. AD TEXT ↔ LANDING PAGE: Would a consumer find what the ad promises on this page?
3. IMAGE SOURCE ↔ CONTENT: Does the image source type suit the landing page content?
4. KEYWORDS ↔ LANDING PAGE: Are the keywords actually represented in the page content?

Respond EXACTLY as:
SCORE: [1-10]
PASS: [YES/NO]
ISSUES: [comma-separated list of specific problems, or "none"]
SUMMARY: [one sentence]`;

  const breaker = circuitBreakers.getBreaker('ad-coherence-ai', {
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
        max_tokens: 150,
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

  return parseCoherenceResponse(text);
}

function parseCoherenceResponse(text: string): CoherenceResult | null {
  const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
  const passMatch = text.match(/PASS:\s*(YES|NO)/i);
  const issuesMatch = text.match(/ISSUES:\s*(.+)/i);
  const summaryMatch = text.match(/SUMMARY:\s*(.+)/i);

  if (!scoreMatch) return null;

  const score = Math.min(10, Math.max(1, parseInt(scoreMatch[1]!)));
  const pass = passMatch ? passMatch[1]!.toUpperCase() === 'YES' : score >= 6;
  const rawIssues = issuesMatch?.[1]?.trim() || 'none';
  const issues =
    rawIssues.toLowerCase() === 'none'
      ? []
      : rawIssues
          .split(',')
          .map((i) => i.trim())
          .filter(Boolean);
  const summary = summaryMatch?.[1]?.trim() || '';

  return { score, pass, issues, summary };
}

// --- Search Term Extraction --------------------------------------------------

/**
 * Extract meaningful search terms from landing page content for interest targeting.
 * Used during remediation to re-derive interest targeting when the original keywords
 * don't match the actual page content.
 */
export function extractSearchTermsFromContent(
  pageTitle: string | null,
  pageBodyExcerpt: string | null
): string[] {
  const text = [pageTitle || '', (pageBodyExcerpt || '').substring(0, 200)].join(' ');

  // Common stop words to filter out
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'can',
    'shall',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'our',
    'your',
    'their',
    'we',
    'you',
    'they',
    'what',
    'which',
    'who',
    'whom',
    'how',
    'when',
    'where',
    'why',
    'all',
    'each',
    'every',
    'both',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
    'about',
    'above',
    'after',
    'before',
    'between',
    'into',
    'through',
    'during',
    'out',
    'off',
    'over',
    'under',
    'again',
    'also',
    'here',
    'there',
    'then',
    'once',
    'best',
    'top',
    'things',
    'discover',
    'explore',
    'book',
    'find',
    'see',
    'experience',
    'enjoy',
  ]);

  // Extract words longer than 3 chars that aren't stop words
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  // Deduplicate and take top terms
  const unique = [...new Set(words)];

  // Also try to extract multi-word phrases (e.g., "food tours", "wine tasting")
  // by looking for capitalized word sequences in the original title
  const phrases: string[] = [];
  if (pageTitle) {
    // Extract 2-3 word phrases from the title
    const titleWords = pageTitle.split(/\s+/);
    for (let i = 0; i < titleWords.length - 1; i++) {
      const twoWord = `${titleWords[i]} ${titleWords[i + 1]}`.replace(/[^a-zA-Z\s'-]/g, '').trim();
      if (twoWord.split(/\s+/).every((w) => w.length > 2 && !stopWords.has(w.toLowerCase()))) {
        phrases.push(twoWord.toLowerCase());
      }
    }
  }

  // Combine: phrases first (more specific), then individual words
  return [...phrases, ...unique].slice(0, 6);
}
