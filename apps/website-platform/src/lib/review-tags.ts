/**
 * Infer traveler type from review text using keyword matching.
 * Since Holibob reviews don't include traveler metadata, we derive it from content.
 */

export type TravelerType = 'solo' | 'couple' | 'family' | 'group' | 'business';

interface TravelerTypeConfig {
  label: string;
  icon: string;
}

export const TRAVELER_TYPE_CONFIG: Record<TravelerType, TravelerTypeConfig> = {
  solo: { label: 'Solo', icon: '🧳' },
  couple: { label: 'Couple', icon: '💑' },
  family: { label: 'Family', icon: '👨‍👩‍👧' },
  group: { label: 'Group', icon: '👥' },
  business: { label: 'Business', icon: '💼' },
};

const TRAVELER_PATTERNS: Record<TravelerType, RegExp[]> = {
  couple: [
    /\b(my wife|my husband|my partner|my girlfriend|my boyfriend)\b/i,
    /\b(we both|the two of us|just us two|our anniversary|honeymoon)\b/i,
    /\b(romantic|date night|couples)\b/i,
  ],
  family: [
    /\b(my kids|our kids|the kids|my children|our children|my daughter|my son)\b/i,
    /\b(family trip|family holiday|family vacation|family of)\b/i,
    /\b(our baby|toddler|teenager|my teen)\b/i,
    /\b(kid-friendly|child-friendly|great for kids|kids loved)\b/i,
  ],
  group: [
    /\b(our group|a group of|friends and I|my friends|group of \d+)\b/i,
    /\b(hen party|stag do|bachelorette|bachelor party|birthday group)\b/i,
    /\b(girls trip|girls weekend|lads trip)\b/i,
  ],
  business: [
    /\b(team building|corporate event|work trip|business trip|colleagues)\b/i,
    /\b(office outing|company event|team outing)\b/i,
  ],
  solo: [
    /\b(by myself|on my own|solo trip|solo travel|traveling alone)\b/i,
    /\b(I went alone|just me|as a solo)\b/i,
  ],
};

/**
 * Infer the traveler type from review text content.
 * Returns null if no strong signal is found.
 */
export function inferTravelerType(reviewText: string): TravelerType | null {
  if (!reviewText || reviewText.length < 10) return null;

  // Check patterns in priority order (more specific first)
  const checks: TravelerType[] = ['family', 'couple', 'group', 'business', 'solo'];

  for (const type of checks) {
    const patterns = TRAVELER_PATTERNS[type];
    if (patterns?.some((pattern) => pattern.test(reviewText))) {
      return type;
    }
  }

  return null;
}

/**
 * Tag a batch of reviews with inferred traveler types.
 * Returns a map of review ID to traveler type.
 */
export function tagReviews(reviews: { id: string; content: string }[]): Map<string, TravelerType> {
  const tags = new Map<string, TravelerType>();
  for (const review of reviews) {
    const type = inferTravelerType(review.content);
    if (type) {
      tags.set(review.id, type);
    }
  }
  return tags;
}

/**
 * Get traveler type distribution from tagged reviews.
 */
export function getTravelerTypeDistribution(
  reviews: { id: string; content: string }[]
): { type: TravelerType; count: number; percentage: number }[] {
  const tags = tagReviews(reviews);
  const counts = new Map<TravelerType, number>();

  for (const type of tags.values()) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const total = tags.size || 1;

  return Array.from(counts.entries())
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}
