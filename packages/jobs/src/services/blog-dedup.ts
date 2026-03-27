/**
 * Blog Deduplication Service
 *
 * Provides similarity detection for blog titles to prevent near-duplicate
 * content. Uses Jaccard similarity on tokenized, stemmed keywords.
 */

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
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
  'being',
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
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'my',
  'your',
  'his',
  'her',
  'our',
  'their',
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
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'up',
  'down',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  // Common in blog titles but not differentiating
  'guide',
  'ultimate',
  'complete',
  'best',
  'top',
  'tips',
  'things',
  'must',
  'need',
  'know',
  'everything',
]);

/**
 * Tokenize a title into meaningful keywords, lowercased and deduplicated.
 * Strips stop words and numbers-only tokens.
 */
export function tokenize(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  return new Set(words);
}

/**
 * Compute Jaccard similarity between two sets of tokens.
 * Returns a value between 0 (no overlap) and 1 (identical).
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Default similarity threshold. Titles with Jaccard similarity above this
 * are considered near-duplicates.
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

/**
 * Check if a proposed title is too similar to any existing title.
 * Returns the matching title if a near-duplicate is found, or null if the title is unique enough.
 */
export function findSimilarTitle(
  proposedTitle: string,
  existingTitles: string[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): string | null {
  const proposedTokens = tokenize(proposedTitle);

  for (const existing of existingTitles) {
    const existingTokens = tokenize(existing);
    const similarity = jaccardSimilarity(proposedTokens, existingTokens);
    if (similarity >= threshold) {
      return existing;
    }
  }

  return null;
}

/**
 * Given a list of titles, group them into clusters of near-duplicates.
 * Returns an array of clusters, where each cluster is an array of { index, title }.
 * The first item in each cluster is the "canonical" one (earliest by index).
 */
export function clusterDuplicateTitles(
  titles: string[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): Array<Array<{ index: number; title: string }>> {
  const tokenSets = titles.map((t) => tokenize(t));
  const assigned = new Set<number>();
  const clusters: Array<Array<{ index: number; title: string }>> = [];

  for (let i = 0; i < titles.length; i++) {
    if (assigned.has(i)) continue;

    const cluster: Array<{ index: number; title: string }> = [{ index: i, title: titles[i]! }];
    assigned.add(i);

    for (let j = i + 1; j < titles.length; j++) {
      if (assigned.has(j)) continue;
      const similarity = jaccardSimilarity(tokenSets[i]!, tokenSets[j]!);
      if (similarity >= threshold) {
        cluster.push({ index: j, title: titles[j]! });
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}
