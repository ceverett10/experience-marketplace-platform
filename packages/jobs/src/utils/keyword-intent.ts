/**
 * Keyword Intent Classification
 *
 * Shared utility for classifying keyword intent across the paid traffic pipeline.
 * Used by: paid-keyword-scanner, keyword-enrichment, bidding-engine.
 *
 * Two layers of filtering:
 *   1. isLowIntentKeyword() — rejects keywords with no purchase potential
 *   2. hasCommercialIntent() — ensures keyword has booking/commercial signals
 */

// ---------------------------------------------------------------------------
// Positive signals — indicate booking/transactional intent
// ---------------------------------------------------------------------------

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
  'sightseeing',
  'things to do',
  'what to do',
  'attraction',
  'attractions',
  'museum',
  'gallery',
  'price',
  'prices',
  'cost',
  'cheap',
  'best',
  'top',
  'buy',
  'reserve',
  'available',
  'availability',
  'online',
  'near me',
];

// ---------------------------------------------------------------------------
// Negative signals — indicate non-commercial intent
// ---------------------------------------------------------------------------

/** Words that indicate zero purchase intent */
const LOW_INTENT_TERMS = ['free', 'gratis', 'no cost', 'complimentary', 'freebie', 'for nothing'];

/** Wrong product type — we don't sell these */
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

/** Informational/research intent — not ready to book */
const INFORMATIONAL_PATTERNS = [
  /\bwhat is\b/i,
  /\bhistory of\b/i,
  /\bfacts about\b/i,
  /\bdefinition\b/i,
  /\bmeaning\b/i,
  /\bwiki\b/i,
  /\bessay\b/i,
  /\bsalary\b/i,
  /\bjobs?\b/i,
  /\bcareer\b/i,
  /\bweather\b/i,
  /\bvisa\b/i,
  /\bpopulation\b/i,
  /\blanguage\b/i,
  /\bcurrency\b/i,
];

/** Navigational intent — looking for a place, not a tour */
const NAVIGATIONAL_PATTERNS = [
  /\bopening hours\b/i,
  /\bopening times\b/i,
  /\bhow to get to\b/i,
  /\bdirections to\b/i,
  /\baddress\b/i,
  /\bwhere is\b/i,
  /\bnearest\b/i,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the keyword contains terms that indicate zero purchase intent.
 * Matches whole words only to avoid false positives (e.g. "freestyle").
 */
export function isLowIntentKeyword(keyword: string): boolean {
  const kw = keyword.toLowerCase();

  // Check free/gratis terms
  if (
    LOW_INTENT_TERMS.some((term) => {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      return regex.test(kw);
    })
  ) {
    return true;
  }

  // Single-word keywords are too broad for paid search
  const wordCount = kw.trim().split(/\s+/).length;
  if (wordCount === 1) {
    return true;
  }

  // Wrong product type (unless it has a commercial modifier)
  if (WRONG_PRODUCT_PATTERNS.some((p) => p.test(kw)) && !hasCommercialModifier(kw)) {
    return true;
  }

  // Navigational intent
  if (NAVIGATIONAL_PATTERNS.some((p) => p.test(kw))) {
    return true;
  }

  // Informational patterns (unless it has a commercial modifier)
  if (INFORMATIONAL_PATTERNS.some((p) => p.test(kw)) && !hasCommercialModifier(kw)) {
    return true;
  }

  return false;
}

/**
 * Returns true if the keyword has commercial/booking intent.
 * A keyword must have at least one positive signal AND no disqualifying negative signals.
 *
 * Use this as a quality gate before upserting new keyword opportunities.
 */
export function hasCommercialIntent(keyword: string): boolean {
  const kw = keyword.toLowerCase();

  // Reject if it has low-intent signals
  if (isLowIntentKeyword(kw)) return false;

  // Must have at least one commercial modifier
  return hasCommercialModifier(kw);
}

/** Internal helper: check for any commercial/booking modifier */
function hasCommercialModifier(kw: string): boolean {
  const lower = kw.toLowerCase();
  return COMMERCIAL_MODIFIERS.some((mod) => lower.includes(mod));
}

/**
 * Returns Prisma-compatible OR conditions for archiving low-intent keywords.
 * Used by bidding-engine's archiveLowIntentKeywords() for bulk DB updates.
 */
export function getLowIntentPrismaConditions(): Array<Record<string, unknown>> {
  const allTerms = [
    ...LOW_INTENT_TERMS,
    // Wrong product type terms
    'hotel',
    'hotels',
    'hostel',
    'airbnb',
    'accommodation',
    'resort',
    'flight',
    'flights',
    'restaurant',
    'parking',
    'rental car',
    'car hire',
    'insurance',
    // Navigational
    'opening hours',
    'opening times',
    'how to get to',
    'directions to',
    // Informational
    'what is',
    'history of',
    'facts about',
    'definition',
    'meaning',
    'wiki',
    'essay',
    'salary',
    'career',
    'weather',
    'visa',
    'population',
  ];

  return allTerms.flatMap((term) => [
    { keyword: { contains: ` ${term} `, mode: 'insensitive' as const } },
    { keyword: { startsWith: `${term} `, mode: 'insensitive' as const } },
    { keyword: { endsWith: ` ${term}`, mode: 'insensitive' as const } },
  ]);
}
