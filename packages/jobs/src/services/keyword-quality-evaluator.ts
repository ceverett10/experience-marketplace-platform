/**
 * AI-Powered Keyword Quality Evaluator
 *
 * Uses Claude Haiku to evaluate PAID_CANDIDATE keywords for bidding worthiness.
 * Each keyword is scored on relevance, commercial viability, and conversion potential
 * relative to its assigned site/microsite context.
 *
 * Designed to run as part of the bidding engine pipeline:
 *   archiveLowIntent → assignToSites → evaluateKeywordQuality → scoreCampaignOpportunities
 *
 * Cost: ~$0.01 per batch of 50 keywords (Haiku @ $0.80/M input, $4/M output)
 */

import { prisma } from '@experience-marketplace/database';

// --- Configuration -----------------------------------------------------------

const BATCH_SIZE = 50; // Keywords per AI call
const MAX_BATCHES = 40; // Cap at 2000 keywords per run
const EVAL_COOLDOWN_HOURS = 72; // Re-evaluate after 3 days
const BID_THRESHOLD = 60; // Score >= 60 → BID
const SKIP_THRESHOLD = 30; // Score < 30 → SKIP (archive)
const AI_MODEL = 'claude-haiku-4-5-20251001';
const AI_MAX_TOKENS = 4000;

// --- Types -------------------------------------------------------------------

export interface KeywordEvaluation {
  keywordId: string;
  keyword: string;
  score: number; // 0-100
  decision: 'BID' | 'SKIP' | 'REVIEW';
  reasoning: string;
  signals: {
    relevance: number; // 0-100: How relevant to the site's niche
    commercialIntent: number; // 0-100: Likelihood of purchase conversion
    competitionViability: number; // 0-100: Can we compete at this CPC
    landingPageFit: number; // 0-100: Do we have good content for this
  };
}

export interface EvaluationResult {
  totalEvaluated: number;
  bidCount: number;
  skipCount: number;
  reviewCount: number;
  archivedCount: number;
  costEstimate: number;
}

interface KeywordForEval {
  id: string;
  keyword: string;
  searchVolume: number;
  cpc: number;
  difficulty: number;
  intent: string;
  location: string | null;
  niche: string;
  siteId: string | null;
  siteName: string | null;
  siteDestinations: string[];
  siteCategories: string[];
  maxProfitableCpc: number | null;
}

// --- AI Call -----------------------------------------------------------------

async function callClaude(prompt: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'] || '';
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY or CLAUDE_API_KEY');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: AI_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    throw new Error(`Anthropic API error (${response.status}): ${err.substring(0, 300)}`);
  }

  const data = (await response.json()) as {
    content: Array<{ text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  return {
    text: data.content?.[0]?.text || '',
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

// --- Batch Evaluation --------------------------------------------------------

function buildEvalPrompt(keywords: KeywordForEval[]): string {
  const keywordLines = keywords.map((kw, i) => {
    const siteContext = kw.siteName
      ? `Site: "${kw.siteName}" (destinations: ${kw.siteDestinations.join(', ') || 'general'}, categories: ${kw.siteCategories.join(', ') || 'general'})`
      : 'Site: Unassigned';
    const cpcContext = kw.maxProfitableCpc !== null
      ? `maxProfitCPC: £${kw.maxProfitableCpc.toFixed(4)}, CPC: £${kw.cpc.toFixed(2)}`
      : `CPC: £${kw.cpc.toFixed(2)}`;

    return `${i + 1}. "${kw.keyword}" | vol=${kw.searchVolume} | ${cpcContext} | diff=${kw.difficulty} | intent=${kw.intent} | loc=${kw.location || 'global'} | niche=${kw.niche} | ${siteContext}`;
  }).join('\n');

  return `You are a paid search strategist evaluating keywords for a travel experiences marketplace (tours, activities, attractions). We sell bookable experiences through Holibob.

## Task
Evaluate each keyword below for paid advertising worthiness. For each keyword, consider:

1. **Relevance** (0-100): Does this keyword relate to bookable travel experiences? Keywords about flights, hotels, visa info, general travel planning, or DIY activities score low. Keywords about tours, tickets, activities, attractions, things to do score high.

2. **Commercial Intent** (0-100): Is the searcher likely to book/buy? "Best kayaking tours London" = high. "What is kayaking" = low. "Things to do in [city]" = medium-high. Informational queries about history, facts, distances, weather = low.

3. **Competition Viability** (0-100): Given the CPC and difficulty, can a small marketplace compete? Low CPC + low difficulty = high viability. High CPC with big brand competitors = low viability.

4. **Landing Page Fit** (0-100): Does the assigned site have relevant destinations/categories for this keyword? A site about "London experiences" getting "kayaking in Barcelona" = low fit. Consider the site context carefully.

## Scoring Rules
- Score 80-100: Clear buying intent for bookable experiences matching the site
- Score 60-79: Good potential, relevant to experiences, moderate intent
- Score 40-59: Uncertain — might convert but risky to bid on
- Score 20-39: Poor fit — informational intent, wrong niche, or too competitive
- Score 0-19: Not suitable — irrelevant, no commercial intent, or impossible CPC

## Decision Thresholds
- BID: score >= 60 (worth spending ad budget)
- REVIEW: score 30-59 (needs human review or more data)
- SKIP: score < 30 (archive, don't bid)

## Keywords to Evaluate
${keywordLines}

## Output Format
Return ONLY a JSON array, no markdown fences, no explanation. Each item:
[{"id":1,"score":75,"decision":"BID","reasoning":"Short reason","signals":{"relevance":80,"commercialIntent":70,"competitionViability":75,"landingPageFit":80}}]

Match the "id" field to the line number (1-indexed). Keep reasoning under 30 words.`;
}

function parseEvaluations(text: string, keywords: KeywordForEval[]): KeywordEvaluation[] {
  // Extract JSON array from response
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  let jsonMatch = cleaned.match(/\[[\s\S]*\]/);

  // Try to repair truncated response
  if (!jsonMatch) {
    const start = cleaned.indexOf('[');
    if (start !== -1) {
      let truncated = cleaned.slice(start).trim();
      const lastBrace = truncated.lastIndexOf('}');
      if (lastBrace !== -1) {
        truncated = truncated.slice(0, lastBrace + 1) + ']';
        jsonMatch = [truncated];
      }
    }
  }

  if (!jsonMatch) {
    console.error('[KeywordEval] Failed to parse AI response:', text.substring(0, 300));
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      id: number;
      score: number;
      decision: string;
      reasoning: string;
      signals: {
        relevance: number;
        commercialIntent: number;
        competitionViability: number;
        landingPageFit: number;
      };
    }>;

    return parsed
      .filter((item) => item.id >= 1 && item.id <= keywords.length)
      .map((item) => {
        const kw = keywords[item.id - 1]!;
        const score = Math.max(0, Math.min(100, item.score));
        const decision = score >= BID_THRESHOLD ? 'BID' : score < SKIP_THRESHOLD ? 'SKIP' : 'REVIEW';

        return {
          keywordId: kw.id,
          keyword: kw.keyword,
          score,
          decision,
          reasoning: item.reasoning || '',
          signals: {
            relevance: Math.max(0, Math.min(100, item.signals?.relevance || 0)),
            commercialIntent: Math.max(0, Math.min(100, item.signals?.commercialIntent || 0)),
            competitionViability: Math.max(0, Math.min(100, item.signals?.competitionViability || 0)),
            landingPageFit: Math.max(0, Math.min(100, item.signals?.landingPageFit || 0)),
          },
        };
      });
  } catch (err) {
    console.error('[KeywordEval] JSON parse error:', err);
    return [];
  }
}

// --- Main Function -----------------------------------------------------------

/**
 * Evaluate PAID_CANDIDATE keywords using AI.
 * Stores scores in sourceData.aiEvaluation and archives SKIP keywords.
 */
export async function evaluateKeywordQuality(): Promise<EvaluationResult> {
  const cooldownDate = new Date();
  cooldownDate.setHours(cooldownDate.getHours() - EVAL_COOLDOWN_HOURS);

  // Load keywords needing evaluation:
  // - PAID_CANDIDATE status
  // - Either never evaluated OR evaluation is stale (> cooldown hours)
  const allKeywords = await prisma.sEOOpportunity.findMany({
    where: {
      status: 'PAID_CANDIDATE' as any,
    },
    select: {
      id: true,
      keyword: true,
      searchVolume: true,
      cpc: true,
      difficulty: true,
      intent: true,
      location: true,
      niche: true,
      siteId: true,
      sourceData: true,
      site: {
        select: {
          name: true,
          homepageConfig: true,
        },
      },
    },
    orderBy: { priorityScore: 'desc' },
    take: BATCH_SIZE * MAX_BATCHES,
  });

  // Filter to only those needing evaluation
  const keywords = allKeywords.filter((kw) => {
    const sd = kw.sourceData as { aiEvaluation?: { evaluatedAt?: string } } | null;
    const lastEval = sd?.aiEvaluation?.evaluatedAt;
    if (!lastEval) return true;
    return new Date(lastEval) < cooldownDate;
  });

  if (keywords.length === 0) {
    console.log('[KeywordEval] No keywords need evaluation');
    return { totalEvaluated: 0, bidCount: 0, skipCount: 0, reviewCount: 0, archivedCount: 0, costEstimate: 0 };
  }

  console.log(`[KeywordEval] Evaluating ${keywords.length} keywords in batches of ${BATCH_SIZE}`);

  // Load bidding profiles for max profitable CPC
  const profiles = await prisma.biddingProfile.findMany({
    select: { siteId: true, maxProfitableCpc: true },
  });
  const profileMap = new Map(profiles.map((p) => [p.siteId, Number(p.maxProfitableCpc)]));

  // Prepare keyword data with site context
  const keywordsForEval: KeywordForEval[] = keywords.map((kw) => {
    const config = kw.site?.homepageConfig as {
      destinations?: Array<{ name: string }>;
      categories?: Array<{ name: string }>;
      popularExperiences?: { destination?: string; searchTerms?: string[] };
    } | null;

    const destinations = config?.destinations?.map((d) => d.name) ?? [];
    const primaryDest = config?.popularExperiences?.destination;
    if (primaryDest && !destinations.includes(primaryDest)) destinations.unshift(primaryDest);
    const categories = config?.categories?.map((c) => c.name) ?? [];

    return {
      id: kw.id,
      keyword: kw.keyword,
      searchVolume: kw.searchVolume,
      cpc: Number(kw.cpc),
      difficulty: kw.difficulty,
      intent: kw.intent,
      location: kw.location,
      niche: kw.niche,
      siteId: kw.siteId,
      siteName: kw.site?.name || null,
      siteDestinations: destinations,
      siteCategories: categories,
      maxProfitableCpc: kw.siteId ? (profileMap.get(kw.siteId) ?? null) : null,
    };
  });

  let totalEvaluated = 0;
  let bidCount = 0;
  let skipCount = 0;
  let reviewCount = 0;
  let archivedCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Process in batches
  const batches = Math.min(MAX_BATCHES, Math.ceil(keywordsForEval.length / BATCH_SIZE));

  for (let i = 0; i < batches; i++) {
    const batch = keywordsForEval.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    if (batch.length === 0) break;

    console.log(`[KeywordEval] Batch ${i + 1}/${batches} (${batch.length} keywords)`);

    try {
      const prompt = buildEvalPrompt(batch);
      const { text, inputTokens, outputTokens } = await callClaude(prompt);
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      const evaluations = parseEvaluations(text, batch);

      // Store results and act on decisions
      for (const evaluation of evaluations) {
        const sourceData = (allKeywords.find((k) => k.id === evaluation.keywordId)?.sourceData as Record<string, unknown>) || {};

        const updatedSourceData = {
          ...sourceData,
          aiEvaluation: {
            score: evaluation.score,
            decision: evaluation.decision,
            reasoning: evaluation.reasoning,
            signals: evaluation.signals,
            evaluatedAt: new Date().toISOString(),
            model: AI_MODEL,
          },
        };

        if (evaluation.decision === 'SKIP') {
          // Archive low-quality keywords
          await prisma.sEOOpportunity.update({
            where: { id: evaluation.keywordId },
            data: {
              status: 'ARCHIVED' as any,
              sourceData: updatedSourceData,
            },
          });
          archivedCount++;
          skipCount++;
        } else {
          // Update sourceData with evaluation
          await prisma.sEOOpportunity.update({
            where: { id: evaluation.keywordId },
            data: { sourceData: updatedSourceData },
          });
          if (evaluation.decision === 'BID') bidCount++;
          else reviewCount++;
        }
        totalEvaluated++;
      }

      // Rate limiting: short pause between batches
      if (i < batches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error(`[KeywordEval] Batch ${i + 1} failed:`, err);
      // Continue with next batch
    }
  }

  // Cost estimate: Haiku = $0.80/M input, $4.00/M output
  const costEstimate = (totalInputTokens * 0.8 + totalOutputTokens * 4.0) / 1_000_000;

  console.log(
    `[KeywordEval] Done: ${totalEvaluated} evaluated, ${bidCount} BID, ${reviewCount} REVIEW, ${skipCount} SKIP (${archivedCount} archived). Cost: ~$${costEstimate.toFixed(4)}`
  );

  return { totalEvaluated, bidCount, skipCount, reviewCount, archivedCount, costEstimate };
}
