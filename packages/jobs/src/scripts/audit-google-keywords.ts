/**
 * Audit Google Ads Keywords: Identify and pause low-intent/broad keywords.
 *
 * Pulls all keywords from the 10 restructured campaigns and flags them based on:
 *   - Single-word keywords (too broad for paid search)
 *   - Navigational intent (landmark names without booking modifiers)
 *   - Wrong product type (hotel, flight, restaurant keywords)
 *   - Zero conversions with significant spend
 *
 * Flags:
 *   --dry-run   Show what would be paused without making API calls
 *   --apply     Actually pause flagged keywords
 *   --limit=N   Only process first N flagged keywords
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/audit-google-keywords.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/audit-google-keywords.ts --apply
 */

import {
  getConfig,
  apiRequest,
  flattenStreamResults,
  pauseAdGroupKeywords,
} from '../services/google-ads-client';

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : undefined;

// ---------------------------------------------------------------------------
// Intent classification rules
// ---------------------------------------------------------------------------

/** Words that indicate booking/commercial intent — keyword is likely fine */
const COMMERCIAL_MODIFIERS = [
  'book',
  'booking',
  'ticket',
  'tickets',
  'tour',
  'tours',
  'experience',
  'experiences',
  'activity',
  'activities',
  'excursion',
  'day trip',
  'guided',
  'admission',
  'entry',
  'pass',
  'hire',
  'rental',
  'cruise',
  'cruises',
  'tasting',
  'class',
  'classes',
  'lesson',
  'lessons',
  'safari',
  'trek',
  'trekking',
  'kayak',
  'kayaking',
  'diving',
  'snorkel',
  'snorkeling',
  'cooking',
  'walking tour',
  'food tour',
  'boat tour',
  'hop on hop off',
  'skip the line',
  'fast track',
  'transfer',
  'shuttle',
  'chauffeur',
  'limousine',
  'limo',
  'sightseeing',
];

/** Keywords containing these indicate wrong product type — we don't sell these */
const WRONG_PRODUCT_PATTERNS = [
  /\bhotels?\b/i,
  /\bhostels?\b/i,
  /\baccommodation\b/i,
  /\bresorts?\b/i,
  /\bairbnb\b/i,
  /\bflights?\b/i,
  /\brestaurants?\b/i,
  /\bcafes?\b/i,
  /\bbars?\b/i,
  /\bnightclubs?\b/i,
  /\bparking\b/i,
  /\brental car\b/i,
  /\bcar hire\b/i,
  /\binsurance\b/i,
];

/** Navigational intent patterns — user looking for the place itself, not a tour */
const NAVIGATIONAL_PATTERNS = [
  /\bopening hours\b/i,
  /\bopening times\b/i,
  /\bhow to get to\b/i,
  /\bdirections to\b/i,
  /\baddress\b/i,
  /\bwhere is\b/i,
  /\bnearest\b/i,
  /\bnear me\b/i,
];

/** Informational/research patterns — user not ready to book */
const INFORMATIONAL_PATTERNS = [
  /\bwhat is\b/i,
  /\bhistory of\b/i,
  /\bfacts about\b/i,
  /\bdefinition\b/i,
  /\bmeaning\b/i,
  /\bwiki\b/i,
  /\bessay\b/i,
  /\bsalary\b/i,
  /\bjob\b/i,
  /\bjobs\b/i,
  /\bcareer\b/i,
  /\bweather\b/i,
  /\bvisa\b/i,
  /\bpopulation\b/i,
  /\blanguage\b/i,
  /\bcurrency\b/i,
];

/** Minimum spend (micros) before flagging zero-conversion keywords */
const ZERO_CONV_SPEND_THRESHOLD_MICROS = 5_000_000; // £5

type PruneReason =
  | 'SINGLE_WORD'
  | 'WRONG_PRODUCT'
  | 'NAVIGATIONAL'
  | 'INFORMATIONAL'
  | 'ZERO_CONVERSIONS_HIGH_SPEND';

interface KeywordRow {
  campaign: { id: string; name: string };
  adGroup: { id: string; name: string };
  adGroupCriterion: {
    criterionId: string;
    keyword: { text: string; matchType: string };
    status: string;
  };
  metrics: {
    clicks: string;
    impressions: string;
    costMicros: string;
    conversions: string;
  };
}

function hasCommercialModifier(kw: string): boolean {
  const lower = kw.toLowerCase();
  return COMMERCIAL_MODIFIERS.some((mod) => lower.includes(mod));
}

function classifyKeyword(
  kw: string,
  metrics: { costMicros: number; conversions: number }
): PruneReason | null {
  const lower = kw.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;

  // Single-word keywords are too broad (unless they contain a commercial modifier)
  if (wordCount === 1 && !hasCommercialModifier(lower)) {
    return 'SINGLE_WORD';
  }

  // Wrong product type — we don't sell hotels, flights, restaurants
  if (WRONG_PRODUCT_PATTERNS.some((p) => p.test(lower)) && !hasCommercialModifier(lower)) {
    return 'WRONG_PRODUCT';
  }

  // Navigational intent — user looking for directions/hours, not tours
  if (NAVIGATIONAL_PATTERNS.some((p) => p.test(lower))) {
    return 'NAVIGATIONAL';
  }

  // Informational patterns — user researching, not booking
  if (INFORMATIONAL_PATTERNS.some((p) => p.test(lower)) && !hasCommercialModifier(lower)) {
    return 'INFORMATIONAL';
  }

  // Zero conversions with significant spend
  if (metrics.conversions === 0 && metrics.costMicros > ZERO_CONV_SPEND_THRESHOLD_MICROS) {
    return 'ZERO_CONVERSIONS_HIGH_SPEND';
  }

  return null; // Keep this keyword
}

async function main(): Promise<void> {
  console.info('=== Google Ads Keyword Audit ===');
  console.info(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY (will pause keywords)'}`);
  if (LIMIT) console.info(`Limit: ${LIMIT} keywords`);
  console.info();

  const config = getConfig();
  if (!config) {
    console.error('Google Ads config not available');
    process.exit(1);
  }

  // Query all enabled keywords with performance metrics
  console.info('Querying all keywords with metrics (last 30 days)...');
  const query = `
    SELECT
      campaign.id, campaign.name,
      ad_group.id, ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions
    FROM keyword_view
    WHERE campaign.status != "REMOVED"
      AND ad_group.status != "REMOVED"
      AND ad_group_criterion.status = "ENABLED"
    ORDER BY metrics.cost_micros DESC
  `;

  const rows = flattenStreamResults<KeywordRow>(
    await apiRequest(config, 'POST', '/googleAds:searchStream', { query })
  );

  console.info(`Found ${rows.length} active keywords\n`);

  // Classify each keyword
  const flagged: Array<{
    row: KeywordRow;
    reason: PruneReason;
  }> = [];

  const reasonCounts: Record<PruneReason, number> = {
    SINGLE_WORD: 0,
    WRONG_PRODUCT: 0,
    NAVIGATIONAL: 0,
    INFORMATIONAL: 0,
    ZERO_CONVERSIONS_HIGH_SPEND: 0,
  };

  // Deduplicate by keyword text (same keyword appears in EXACT + PHRASE match)
  // We flag both match types if the keyword text is flagged
  const seenKeywords = new Map<string, PruneReason>();

  for (const row of rows) {
    const kw = row.adGroupCriterion.keyword.text;
    const metrics = {
      costMicros: parseInt(row.metrics.costMicros || '0', 10),
      conversions: parseFloat(row.metrics.conversions || '0'),
    };

    // Check if we already classified this keyword text
    let reason = seenKeywords.get(kw);
    if (reason === undefined) {
      const classification = classifyKeyword(kw, metrics);
      if (classification) {
        seenKeywords.set(kw, classification);
        reason = classification;
      }
    }

    if (reason) {
      flagged.push({ row, reason });
      reasonCounts[reason]++;
    }
  }

  // Summary
  const totalSpendMicros = flagged.reduce(
    (sum, f) => sum + parseInt(f.row.metrics.costMicros || '0', 10),
    0
  );
  const totalClicks = flagged.reduce(
    (sum, f) => sum + parseInt(f.row.metrics.clicks || '0', 10),
    0
  );

  console.info('=== AUDIT RESULTS ===');
  console.info(`Total keywords: ${rows.length}`);
  console.info(
    `Flagged for pruning: ${flagged.length} (${((flagged.length / rows.length) * 100).toFixed(1)}%)`
  );
  console.info(`Estimated wasted spend: £${(totalSpendMicros / 1_000_000).toFixed(2)}`);
  console.info(`Estimated wasted clicks: ${totalClicks}`);
  console.info();
  console.info('By reason:');
  for (const [reason, count] of Object.entries(reasonCounts)) {
    if (count > 0) console.info(`  ${reason}: ${count}`);
  }
  console.info();

  // Show by campaign
  const byCampaign = new Map<string, typeof flagged>();
  for (const f of flagged) {
    const key = f.row.campaign.name;
    if (!byCampaign.has(key)) byCampaign.set(key, []);
    byCampaign.get(key)!.push(f);
  }

  console.info('By campaign:');
  for (const [campaign, items] of byCampaign) {
    const spend = items.reduce((s, f) => s + parseInt(f.row.metrics.costMicros || '0', 10), 0);
    console.info(
      `  ${campaign}: ${items.length} keywords (£${(spend / 1_000_000).toFixed(2)} wasted)`
    );
  }
  console.info();

  // Show sample of flagged keywords
  console.info('Sample flagged keywords (first 30):');
  for (const f of flagged.slice(0, 30)) {
    const spend = parseInt(f.row.metrics.costMicros || '0', 10) / 1_000_000;
    console.info(
      `  [${f.reason}] "${f.row.adGroupCriterion.keyword.text}" ` +
        `(${f.row.adGroupCriterion.keyword.matchType}) — ` +
        `£${spend.toFixed(2)} / ${f.row.metrics.clicks} clicks / ${f.row.metrics.conversions} conv`
    );
  }
  console.info();

  if (DRY_RUN) {
    console.info('DRY RUN — no changes made. Run with --apply to pause flagged keywords.');
    return;
  }

  // Apply: pause flagged keywords
  let toPause = flagged.map((f) => ({
    adGroupId: f.row.adGroup.id,
    criterionId: f.row.adGroupCriterion.criterionId,
  }));

  if (LIMIT && toPause.length > LIMIT) {
    toPause = toPause.slice(0, LIMIT);
    console.info(`Limiting to first ${LIMIT} keywords`);
  }

  console.info(`Pausing ${toPause.length} keywords...`);
  const paused = await pauseAdGroupKeywords(toPause);

  console.info('\n=== SUMMARY ===');
  console.info(`Keywords paused: ${paused}/${toPause.length}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
