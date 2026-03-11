/**
 * STAG Quality Gate Validator
 *
 * Runs 18 quality checks against the bidding engine output.
 * ALL gates must pass before pushing campaigns to Google Ads.
 *
 * Usage:
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/validate-stag-output.js'
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/validate-stag-output.js --verbose'
 */
import { runBiddingEngine } from '../services/bidding-engine';
import type { CampaignGroup, CampaignGroupAdGroup } from '../services/bidding-engine';
import { PAID_TRAFFIC_CONFIG } from '../config/paid-traffic';
import { prisma } from '@experience-marketplace/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Violation {
  gate: number;
  gateName: string;
  campaign: string;
  adGroup: string;
  keyword?: string;
  url?: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Config: keyword relevance — which stems are valid for each domain
// ---------------------------------------------------------------------------

const DOMAIN_RELEVANT_STEMS: Record<string, string[]> = {
  'harry-potter-tours.com': ['harry potter'],
  'food-tour-guide.com': [
    'food tour',
    'cooking class',
    'wine tasting',
    'street food',
    'beer tour',
    'dining',
    'culinary',
    'halal',
    'restaurant',
  ],
  'water-tours.com': [
    'boat tour',
    'sailing',
    'kayak',
    'snorkel',
    'diving',
    'water sport',
    'cruise',
    'lake cruise',
    'glass bottom',
    'powerboat',
    'catamaran',
  ],
  'outdoorexploring.com': [
    'hiking',
    'safari',
    'atv',
    'quad',
    'cycling',
    'horse riding',
    'wildlife',
    'climbing',
    'adventure',
    'national park',
    'zion',
    'banff',
  ],
  'cultural-tours.com': [
    'walking tour',
    'city tour',
    'museum',
    'architecture',
    'sightseeing',
    'monument',
    'cultural',
    'guggenheim',
    'salvador dali',
    'sarawak',
  ],
  'attractionbooking.com': ['attraction', 'skip the line', 'hop on hop off', 'theme park'],
  'winetravelcollective.com': ['wine tour', 'wine tasting', 'vineyard', 'winery'],
  'zen-journeys.com': ['wellness', 'yoga', 'meditation', 'spa', 'retreat'],
  'bachelorette-party-ideas.com': [
    'bachelorette',
    'hen party',
    'hen do',
    'group activit',
    'stag do',
  ],
  'honeymoonexperiences.com': ['romantic', 'couple', 'honeymoon'],
};

// Words that signal non-booking / navigational / informational intent
const NON_BOOKING_WORDS = [
  'car park',
  'parking',
  'address',
  'directions',
  'how to get',
  'opening times',
  'opening hours',
  'reviews',
  'review',
  'map',
  'weather',
  'temperature',
  'wikipedia',
  'reddit',
  'youtube',
  'free ',
  'jobs',
  'career',
  'salary',
  'cost of living',
  'visa',
  'passport',
  'flight',
  'hotel',
  'hostel',
  'airbnb',
];

const BOOKING_PREFIXES = ['book', 'reserve', 'buy tickets'];
const BOOKING_WORDS_IN_KW = new Set([
  'book',
  'booking',
  'reserve',
  'buy',
  'purchase',
  'ticket',
  'tickets',
]);

// Excluded domains
const _paidConfig = PAID_TRAFFIC_CONFIG as Record<string, unknown>;
const EXCLUDED_DOMAINS = (_paidConfig['excludedDomains'] as string[] | undefined) ?? [
  'broke-nomad.com',
  'grad-trip.com',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function getSearchQuery(url: string): string {
  try {
    const u = new URL(url);
    return u.searchParams.get('q') ?? '';
  } catch {
    return '';
  }
}

/** Get the effective final URL for a keyword in an ad group */
function getKeywordUrl(ag: CampaignGroupAdGroup, kw: string): string {
  return ag.keywordFinalUrls?.[kw] ?? ag.targetUrl;
}

/** Check if keyword contains at least one relevant stem for its domain */
function isKeywordRelevantToDomain(kw: string, domain: string): boolean {
  const stems = DOMAIN_RELEVANT_STEMS[domain];
  if (!stems) return true; // Unknown domain — can't validate, pass by default
  const kwLower = kw.toLowerCase();
  return stems.some((stem) => kwLower.includes(stem));
}

/** Extract meaningful words from a keyword (strip "book" prefix and common stop words) */
function getMeaningfulWords(kw: string): string[] {
  const stopWords = new Set([
    'in',
    'at',
    'the',
    'a',
    'an',
    'of',
    'on',
    'for',
    'and',
    'to',
    'with',
    'near',
    'by',
  ]);
  let words = kw.toLowerCase().split(/\s+/);
  // Strip leading booking prefix
  if (words[0] === 'book' || words[0] === 'reserve') {
    words = words.slice(1);
  }
  if (words[0] === 'buy' && words[1] === 'tickets') {
    words = words.slice(2);
  }
  return words.filter((w) => !stopWords.has(w) && w.length > 1);
}

// ---------------------------------------------------------------------------
// Gate functions
// ---------------------------------------------------------------------------

function gate1_urlContainsKeywordWords(groups: CampaignGroup[], violations: Violation[]): void {
  // Gate 1: Every keyword-level final URL must contain all meaningful location/activity words
  for (const g of groups) {
    for (const ag of g.adGroups) {
      for (const kw of ag.keywords) {
        const url = getKeywordUrl(ag, kw);
        if (!url.includes('experiences?') && !url.includes('experiences?q=')) continue; // Destination pages are fine
        const query = getSearchQuery(url);
        if (!query) continue;
        const queryWords = new Set(query.toLowerCase().split(/[+ ]/));

        // Get the meaningful words from the keyword (strip "book" prefix)
        const kwWords = getMeaningfulWords(kw);

        // Check each keyword word appears in the query (allowing for stop word stripping)
        for (const word of kwWords) {
          if (!queryWords.has(word)) {
            // Check if it's a known-OK strip (prepositions, generic words)
            const okToStrip = new Set([
              'in',
              'at',
              'the',
              'a',
              'of',
              'on',
              'for',
              'and',
              'to',
              'with',
              'near',
              'by',
              'best',
              'top',
              'cheap',
              'popular',
              'recommended',
              'online',
              'united',
              'kingdom',
            ]);
            if (okToStrip.has(word)) continue;
            violations.push({
              gate: 1,
              gateName: 'URL contains keyword words',
              campaign: g.campaignGroup ?? 'General',
              adGroup: ag.primaryKeyword,
              keyword: kw,
              url,
              detail: `Word "${word}" from keyword missing in search query "${query}"`,
            });
          }
        }
      }
    }
  }
}

function gate2_noNonBookablePages(groups: CampaignGroup[], violations: Violation[]): void {
  for (const g of groups) {
    for (const ag of g.adGroups) {
      if (ag.landingPageType === 'BLOG' || ag.landingPageType === 'HOMEPAGE') {
        violations.push({
          gate: 2,
          gateName: 'No BLOG/HOMEPAGE landing pages',
          campaign: g.campaignGroup ?? 'General',
          adGroup: ag.primaryKeyword,
          url: ag.targetUrl,
          detail: `Landing page type is ${ag.landingPageType} — no bookable products`,
        });
      }
    }
  }
}

function gate3_httpsAndCorrectDomain(groups: CampaignGroup[], violations: Violation[]): void {
  for (const g of groups) {
    const config = PAID_TRAFFIC_CONFIG as Record<string, unknown>;
    const groupDomains = (config['campaignGroupDomains'] ?? {}) as Record<string, string[]>;
    const expectedDomains = groupDomains[g.campaignGroup ?? ''] ?? [];
    for (const ag of g.adGroups) {
      for (const kw of ag.keywords) {
        const url = getKeywordUrl(ag, kw);
        if (!url.startsWith('https://')) {
          violations.push({
            gate: 3,
            gateName: 'HTTPS and correct domain',
            campaign: g.campaignGroup ?? 'General',
            adGroup: ag.primaryKeyword,
            keyword: kw,
            url,
            detail: 'URL does not start with https://',
          });
        }
        const domain = getDomain(url);
        if (expectedDomains.length > 0 && !expectedDomains.includes(domain)) {
          violations.push({
            gate: 3,
            gateName: 'HTTPS and correct domain',
            campaign: g.campaignGroup ?? 'General',
            adGroup: ag.primaryKeyword,
            keyword: kw,
            url,
            detail: `Domain "${domain}" not in expected [${expectedDomains.join(', ')}]`,
          });
        }
      }
    }
  }
}

function gate4_destinationPageMatchesKeyword(
  groups: CampaignGroup[],
  violations: Violation[]
): void {
  for (const g of groups) {
    for (const ag of g.adGroups) {
      if (ag.landingPageType !== 'DESTINATION') continue;
      const urlPath = new URL(ag.targetUrl).pathname;
      if (!urlPath.startsWith('/destinations/')) continue;
      const slugBody = urlPath.replace('/destinations/', '').replace(/-/g, ' ');

      for (const kw of ag.keywords) {
        const kwLower = kw.toLowerCase();
        const slugWords = slugBody.split(' ');
        const allPresent = slugWords.every((sw) => kwLower.includes(sw));
        if (!allPresent) {
          violations.push({
            gate: 4,
            gateName: 'Destination page matches keyword city',
            campaign: g.campaignGroup ?? 'General',
            adGroup: ag.primaryKeyword,
            keyword: kw,
            url: ag.targetUrl,
            detail: `Destination slug "${slugBody}" words not all found in keyword`,
          });
        }
      }
    }
  }
}

function gate5_noInformationalKeywords(groups: CampaignGroup[], violations: Violation[]): void {
  for (const g of groups) {
    for (const ag of g.adGroups) {
      for (const kw of ag.keywords) {
        const kwLower = kw.toLowerCase();
        for (const pattern of NON_BOOKING_WORDS) {
          if (kwLower.includes(pattern)) {
            violations.push({
              gate: 5,
              gateName: 'No informational/navigational keywords',
              campaign: g.campaignGroup ?? 'General',
              adGroup: ag.primaryKeyword,
              keyword: kw,
              detail: `Contains non-booking pattern "${pattern}"`,
            });
            break; // One violation per keyword is enough
          }
        }
      }
    }
  }
}

function gate6_noDuplicateKeywordsInCampaign(
  groups: CampaignGroup[],
  violations: Violation[]
): void {
  for (const g of groups) {
    const seen = new Map<string, string>(); // keyword → first AG name
    for (const ag of g.adGroups) {
      for (const kw of ag.keywords) {
        const kwNorm = kw.toLowerCase().trim();
        const existingAg = seen.get(kwNorm);
        if (existingAg) {
          violations.push({
            gate: 6,
            gateName: 'No duplicate keywords in campaign',
            campaign: g.campaignGroup ?? 'General',
            adGroup: ag.primaryKeyword,
            keyword: kw,
            detail: `Duplicate — also in AG "${existingAg}"`,
          });
        } else {
          seen.set(kwNorm, ag.primaryKeyword);
        }
      }
    }
  }
}

function gate7_noDoubleBookingIntent(groups: CampaignGroup[], violations: Violation[]): void {
  for (const g of groups) {
    for (const ag of g.adGroups) {
      for (const kw of ag.keywords) {
        const words = kw.toLowerCase().split(/\s+/);
        // Check for "book ... booking" or "book book ..."
        const bookingHits = words.filter((w) => BOOKING_WORDS_IN_KW.has(w));
        if (bookingHits.length >= 2) {
          violations.push({
            gate: 7,
            gateName: 'No double booking-intent keywords',
            campaign: g.campaignGroup ?? 'General',
            adGroup: ag.primaryKeyword,
            keyword: kw,
            detail: `Multiple booking words found: [${bookingHits.join(', ')}]`,
          });
        }
      }
    }
  }
}

function gate8_bookingAGsMustStartWithPrefix(
  groups: CampaignGroup[],
  violations: Violation[]
): void {
  for (const g of groups) {
    for (const ag of g.adGroups) {
      if (!ag.bookingIntent) continue;
      for (const kw of ag.keywords) {
        const kwLower = kw.toLowerCase();
        const hasPrefix = BOOKING_PREFIXES.some((p) => kwLower.startsWith(p + ' '));
        if (!hasPrefix) {
          violations.push({
            gate: 8,
            gateName: 'Booking AG keywords must start with prefix',
            campaign: g.campaignGroup ?? 'General',
            adGroup: ag.primaryKeyword,
            keyword: kw,
            detail: `Booking-intent AG but keyword doesn't start with a booking prefix`,
          });
        }
      }
    }
  }
}

function gate9_maxKeywordsPerAdGroup(groups: CampaignGroup[], violations: Violation[]): void {
  for (const g of groups) {
    for (const ag of g.adGroups) {
      if (ag.keywords.length > 7) {
        violations.push({
          gate: 9,
          gateName: 'Max 7 keywords per ad group',
          campaign: g.campaignGroup ?? 'General',
          adGroup: ag.primaryKeyword,
          detail: `Ad group has ${ag.keywords.length} keywords (max 7)`,
        });
      }
    }
  }
}

function gate10_commonThemeInMultiKeywordAGs(
  groups: CampaignGroup[],
  violations: Violation[]
): void {
  for (const g of groups) {
    for (const ag of g.adGroups) {
      if (ag.keywords.length <= 1) continue;
      // All keywords in an AG should share at least 2 common non-stop words
      const wordSets = ag.keywords.map((kw) => new Set(getMeaningfulWords(kw)));
      // Find words common to ALL keywords
      const commonWords = Array.from(wordSets[0]!).filter((word) =>
        wordSets.every((ws) => ws.has(word))
      );
      if (commonWords.length < 2) {
        violations.push({
          gate: 10,
          gateName: 'Common activity theme in multi-KW ad groups',
          campaign: g.campaignGroup ?? 'General',
          adGroup: ag.primaryKeyword,
          detail: `Only ${commonWords.length} common word(s) across ${ag.keywords.length} keywords: [${commonWords.join(', ')}]. Keywords: ${ag.keywords.slice(0, 3).join(', ')}...`,
        });
      }
    }
  }
}

function gate11_noThinSingleKeywordAGs(groups: CampaignGroup[], _violations: Violation[]): void {
  // NOTE: We don't have search volume at this point in the pipeline.
  // This gate is informational — count and report but don't fail.
  let singleKwCount = 0;
  for (const g of groups) {
    for (const ag of g.adGroups) {
      if (ag.keywords.length === 1) singleKwCount++;
    }
  }
  if (singleKwCount > 0) {
    console.info(
      `  [INFO] Gate 11: ${singleKwCount} single-keyword ad groups (review manually for low volume)`
    );
  }
}

function gate12_minimumKeywordsPerCampaign(groups: CampaignGroup[], violations: Violation[]): void {
  for (const g of groups) {
    const totalKws = g.adGroups.reduce((sum, ag) => sum + ag.keywords.length, 0);
    if (totalKws < 3) {
      violations.push({
        gate: 12,
        gateName: 'Minimum 3 keywords per campaign',
        campaign: g.campaignGroup ?? 'General',
        adGroup: '-',
        detail: `Campaign has only ${totalKws} keyword(s) — too thin to justify a campaign`,
      });
    }
  }
}

function gate13_minimumBudget(groups: CampaignGroup[], violations: Violation[]): void {
  for (const g of groups) {
    if (g.totalExpectedDailyCost < 0.5 && g.adGroups.length > 0) {
      violations.push({
        gate: 13,
        gateName: 'Minimum £0.50 daily budget',
        campaign: g.campaignGroup ?? 'General',
        adGroup: '-',
        detail: `Daily budget £${g.totalExpectedDailyCost.toFixed(2)} — below £0.50 minimum for meaningful ad serving`,
      });
    }
  }
}

function gate14_noExcludedDomains(groups: CampaignGroup[], violations: Violation[]): void {
  for (const g of groups) {
    for (const ag of g.adGroups) {
      for (const kw of ag.keywords) {
        const url = getKeywordUrl(ag, kw);
        const domain = getDomain(url);
        if (EXCLUDED_DOMAINS.includes(domain)) {
          violations.push({
            gate: 14,
            gateName: 'No excluded domains',
            campaign: g.campaignGroup ?? 'General',
            adGroup: ag.primaryKeyword,
            keyword: kw,
            url,
            detail: `URL uses excluded domain "${domain}"`,
          });
        }
      }
    }
  }
}

function gate15_nonEmptySearchQuery(groups: CampaignGroup[], violations: Violation[]): void {
  for (const g of groups) {
    for (const ag of g.adGroups) {
      for (const kw of ag.keywords) {
        const url = getKeywordUrl(ag, kw);
        if (!url.includes('experiences')) continue;
        const query = getSearchQuery(url);
        if (!query || query.trim() === '' || query === '+') {
          violations.push({
            gate: 15,
            gateName: 'Non-empty search query in URL',
            campaign: g.campaignGroup ?? 'General',
            adGroup: ag.primaryKeyword,
            keyword: kw,
            url,
            detail: `Search query is empty or blank`,
          });
        }
      }
    }
  }
}

function gate16_noDoubleEncoding(groups: CampaignGroup[], violations: Violation[]): void {
  for (const g of groups) {
    for (const ag of g.adGroups) {
      for (const kw of ag.keywords) {
        const url = getKeywordUrl(ag, kw);
        if (url.includes('%2B') || url.includes('%2520') || url.includes('%25')) {
          violations.push({
            gate: 16,
            gateName: 'No double-encoded characters in URL',
            campaign: g.campaignGroup ?? 'General',
            adGroup: ag.primaryKeyword,
            keyword: kw,
            url,
            detail: `URL contains double-encoded characters`,
          });
        }
      }
    }
  }
}

function gate17_destinationSlugsExist(
  groups: CampaignGroup[],
  violations: Violation[],
  _knownSlugs: Set<string>
): void {
  // This gate checks destination URLs reference real page slugs.
  // We collect all destination URLs and verify the slug exists in our page data.
  // NOTE: Since we don't have page data in this script, we just validate slug format.
  for (const g of groups) {
    for (const ag of g.adGroups) {
      if (ag.landingPageType !== 'DESTINATION') continue;
      const urlPath = new URL(ag.targetUrl).pathname;
      if (!urlPath.startsWith('/destinations/')) {
        violations.push({
          gate: 17,
          gateName: 'Destination URLs have valid slug format',
          campaign: g.campaignGroup ?? 'General',
          adGroup: ag.primaryKeyword,
          url: ag.targetUrl,
          detail: `Destination page URL path doesn't start with /destinations/`,
        });
      }
      const slug = urlPath.replace('/', ''); // e.g. "destinations/london"
      if (slug.length < 5 || slug.includes('//')) {
        violations.push({
          gate: 17,
          gateName: 'Destination URLs have valid slug format',
          campaign: g.campaignGroup ?? 'General',
          adGroup: ag.primaryKeyword,
          url: ag.targetUrl,
          detail: `Destination slug "${slug}" looks malformed`,
        });
      }
    }
  }
}

function gate18_keywordRelevantToSite(groups: CampaignGroup[], violations: Violation[]): void {
  for (const g of groups) {
    for (const ag of g.adGroups) {
      for (const kw of ag.keywords) {
        const url = getKeywordUrl(ag, kw);
        const domain = getDomain(url);
        if (!isKeywordRelevantToDomain(kw, domain)) {
          violations.push({
            gate: 18,
            gateName: 'Keyword relevant to site domain',
            campaign: g.campaignGroup ?? 'General',
            adGroup: ag.primaryKeyword,
            keyword: kw,
            url,
            detail: `Keyword doesn't match any known stems for ${domain}`,
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const verbose = process.argv.includes('--verbose');

  console.info('\n' + '='.repeat(80));
  console.info('  STAG QUALITY GATE VALIDATOR');
  console.info('  All 18 gates must PASS before pushing to Google Ads');
  console.info('='.repeat(80) + '\n');

  console.info('Running bidding engine...\n');
  const result = await runBiddingEngine({ mode: 'full', maxDailyBudget: 1200 });

  const groups = (result.groups || []).filter((g) => g.platform === 'GOOGLE_SEARCH');

  const totalAGs = groups.reduce((sum, g) => sum + g.adGroups.length, 0);
  const totalKWs = groups.reduce(
    (sum, g) => sum + g.adGroups.reduce((s, ag) => s + ag.keywords.length, 0),
    0
  );

  console.info(`Campaigns: ${groups.length} | Ad Groups: ${totalAGs} | Keywords: ${totalKWs}\n`);

  // Run all gates
  const violations: Violation[] = [];

  const gates = [
    {
      num: 1,
      name: 'URL contains keyword words',
      fn: () => gate1_urlContainsKeywordWords(groups, violations),
    },
    {
      num: 2,
      name: 'No BLOG/HOMEPAGE landing pages',
      fn: () => gate2_noNonBookablePages(groups, violations),
    },
    {
      num: 3,
      name: 'HTTPS and correct domain',
      fn: () => gate3_httpsAndCorrectDomain(groups, violations),
    },
    {
      num: 4,
      name: 'Destination page matches keyword',
      fn: () => gate4_destinationPageMatchesKeyword(groups, violations),
    },
    {
      num: 5,
      name: 'No informational/navigational KWs',
      fn: () => gate5_noInformationalKeywords(groups, violations),
    },
    {
      num: 6,
      name: 'No duplicate KWs in campaign',
      fn: () => gate6_noDuplicateKeywordsInCampaign(groups, violations),
    },
    {
      num: 7,
      name: 'No double booking-intent',
      fn: () => gate7_noDoubleBookingIntent(groups, violations),
    },
    {
      num: 8,
      name: 'Booking AGs have prefix',
      fn: () => gate8_bookingAGsMustStartWithPrefix(groups, violations),
    },
    {
      num: 9,
      name: 'Max 7 KWs per ad group',
      fn: () => gate9_maxKeywordsPerAdGroup(groups, violations),
    },
    {
      num: 10,
      name: 'Common theme in multi-KW AGs',
      fn: () => gate10_commonThemeInMultiKeywordAGs(groups, violations),
    },
    {
      num: 11,
      name: 'Single-KW AG volume check',
      fn: () => gate11_noThinSingleKeywordAGs(groups, violations),
    },
    {
      num: 12,
      name: 'Min 3 KWs per campaign',
      fn: () => gate12_minimumKeywordsPerCampaign(groups, violations),
    },
    { num: 13, name: 'Min £0.50 daily budget', fn: () => gate13_minimumBudget(groups, violations) },
    {
      num: 14,
      name: 'No excluded domains',
      fn: () => gate14_noExcludedDomains(groups, violations),
    },
    {
      num: 15,
      name: 'Non-empty search query',
      fn: () => gate15_nonEmptySearchQuery(groups, violations),
    },
    {
      num: 16,
      name: 'No double-encoded URLs',
      fn: () => gate16_noDoubleEncoding(groups, violations),
    },
    {
      num: 17,
      name: 'Destination slug format',
      fn: () => gate17_destinationSlugsExist(groups, violations, new Set()),
    },
    {
      num: 18,
      name: 'Keyword relevant to site',
      fn: () => gate18_keywordRelevantToSite(groups, violations),
    },
  ];

  for (const gate of gates) {
    const beforeCount = violations.length;
    gate.fn();
    const gateViolations = violations.length - beforeCount;
    const status = gateViolations === 0 ? 'PASS' : 'FAIL';
    const icon = gateViolations === 0 ? '[PASS]' : '[FAIL]';
    console.info(
      `  ${icon} Gate ${String(gate.num).padStart(2)}: ${gate.name.padEnd(40)} ${status === 'FAIL' ? `(${gateViolations} violation${gateViolations > 1 ? 's' : ''})` : ''}`
    );
  }

  // Summary
  console.info('\n' + '='.repeat(80));
  if (violations.length === 0) {
    console.info('  ALL 18 GATES PASSED — Ready to push to Google Ads');
  } else {
    console.info(`  ${violations.length} TOTAL VIOLATIONS — Fix before pushing to Google`);
  }
  console.info('='.repeat(80));

  // Print violations grouped by gate
  if (violations.length > 0) {
    const byGate = new Map<number, Violation[]>();
    for (const v of violations) {
      if (!byGate.has(v.gate)) byGate.set(v.gate, []);
      byGate.get(v.gate)!.push(v);
    }

    for (const [gateNum, gateViolations] of Array.from(byGate.entries()).sort(
      (a, b) => a[0] - b[0]
    )) {
      const gateName = gateViolations[0]!.gateName;
      console.info(`\n--- Gate ${gateNum}: ${gateName} (${gateViolations.length} violations) ---`);

      const limit = verbose ? gateViolations.length : Math.min(gateViolations.length, 10);
      for (let i = 0; i < limit; i++) {
        const v = gateViolations[i]!;
        const parts = [`  Campaign: ${v.campaign}`];
        if (v.adGroup !== '-') parts.push(`AG: ${v.adGroup}`);
        if (v.keyword) parts.push(`KW: "${v.keyword}"`);
        if (v.url) parts.push(`URL: ${v.url}`);
        parts.push(`→ ${v.detail}`);
        console.info(parts.join(' | '));
      }

      if (!verbose && gateViolations.length > 10) {
        console.info(`  ... and ${gateViolations.length - 10} more (use --verbose to see all)`);
      }
    }
  }

  await prisma.$disconnect();
  process.exit(violations.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
