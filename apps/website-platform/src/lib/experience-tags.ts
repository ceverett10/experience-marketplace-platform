/**
 * Derive "Perfect For" occasion tags from experience data.
 * Uses category names, title, and description keywords to infer suitability.
 * No external data needed — pure computation from existing Holibob fields.
 */

export type OccasionTag =
  | 'couples'
  | 'families'
  | 'solo'
  | 'groups'
  | 'foodies'
  | 'adventure'
  | 'culture'
  | 'relaxation';

interface TagConfig {
  label: string;
  icon: string;
  color: string;
}

export const OCCASION_TAG_CONFIG: Record<OccasionTag, TagConfig> = {
  couples: { label: 'Couples', icon: '💑', color: 'bg-rose-100 text-rose-800' },
  families: { label: 'Families', icon: '👨‍👩‍👧', color: 'bg-blue-100 text-blue-800' },
  solo: { label: 'Solo Travelers', icon: '🧳', color: 'bg-purple-100 text-purple-800' },
  groups: { label: 'Groups', icon: '👥', color: 'bg-amber-100 text-amber-800' },
  foodies: { label: 'Foodies', icon: '🍽️', color: 'bg-orange-100 text-orange-800' },
  adventure: { label: 'Adventure', icon: '🏔️', color: 'bg-emerald-100 text-emerald-800' },
  culture: { label: 'Culture Lovers', icon: '🏛️', color: 'bg-indigo-100 text-indigo-800' },
  relaxation: { label: 'Relaxation', icon: '🧘', color: 'bg-teal-100 text-teal-800' },
};

// Keywords that signal each occasion tag
const TAG_KEYWORDS: Record<OccasionTag, string[]> = {
  couples: [
    'romantic',
    'romance',
    'couples',
    'honeymoon',
    'anniversary',
    'sunset',
    'private dinner',
    'wine tasting',
    'champagne',
    'intimate',
    'date night',
  ],
  families: [
    'family',
    'families',
    'kids',
    'children',
    'child-friendly',
    'kid-friendly',
    'all ages',
    'interactive',
    'educational',
  ],
  solo: [
    'solo',
    'solo traveler',
    'solo-friendly',
    'independent',
    'self-guided',
    'walking tour',
    'small group',
  ],
  groups: [
    'group',
    'team building',
    'team-building',
    'corporate',
    'party',
    'hen',
    'stag',
    'bachelorette',
    'bachelor',
    'celebration',
  ],
  foodies: [
    'food',
    'culinary',
    'cooking',
    'tasting',
    'gastronomy',
    'chef',
    'market tour',
    'wine',
    'beer',
    'tapas',
    'street food',
    'restaurant',
  ],
  adventure: [
    'adventure',
    'extreme',
    'adrenaline',
    'kayak',
    'hiking',
    'climbing',
    'surfing',
    'rafting',
    'zipline',
    'paragliding',
    'skydiving',
    'diving',
    'snorkeling',
    'cycling',
    'mountain bike',
  ],
  culture: [
    'museum',
    'gallery',
    'art',
    'history',
    'historical',
    'heritage',
    'architecture',
    'ancient',
    'cultural',
    'archaeological',
    'monument',
    'cathedral',
    'palace',
    'castle',
  ],
  relaxation: [
    'spa',
    'wellness',
    'yoga',
    'meditation',
    'retreat',
    'relaxation',
    'cruise',
    'boat tour',
    'scenic',
    'leisurely',
    'hammam',
    'thermal',
  ],
};

// Category names that directly map to tags
const CATEGORY_TAG_MAP: Record<string, OccasionTag[]> = {
  'food and drink tours': ['foodies'],
  'food tours': ['foodies'],
  'wine tours': ['foodies', 'couples'],
  'wine tasting': ['foodies', 'couples'],
  'cooking classes': ['foodies'],
  'water activities': ['adventure'],
  'outdoor activities': ['adventure'],
  'hiking and trekking': ['adventure'],
  'kayaking and canoeing': ['adventure'],
  'sailing and boating': ['relaxation', 'couples'],
  'cruises and boat tours': ['relaxation', 'couples'],
  'museum tours': ['culture'],
  'art and culture': ['culture'],
  'historical tours': ['culture'],
  'walking tours': ['culture', 'solo'],
  'spa and wellness': ['relaxation'],
  'yoga and meditation': ['relaxation'],
  'family-friendly': ['families'],
  'theme parks': ['families'],
  'team building': ['groups'],
};

/**
 * Derive occasion tags for an experience based on its categories, title, and description.
 * Returns up to 3 most relevant tags, ordered by confidence.
 */
export function getOccasionTags(input: {
  title?: string;
  shortDescription?: string;
  categories?: string[];
}): OccasionTag[] {
  const scores: Record<OccasionTag, number> = {
    couples: 0,
    families: 0,
    solo: 0,
    groups: 0,
    foodies: 0,
    adventure: 0,
    culture: 0,
    relaxation: 0,
  };

  const searchText = [input.title ?? '', input.shortDescription ?? ''].join(' ').toLowerCase();

  // Score from categories (highest weight)
  for (const category of input.categories ?? []) {
    const catLower = category.toLowerCase();
    for (const [catName, tags] of Object.entries(CATEGORY_TAG_MAP)) {
      if (catLower.includes(catName) || catName.includes(catLower)) {
        for (const tag of tags) {
          scores[tag] += 3;
        }
      }
    }
  }

  // Score from keyword matching in title/description
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS) as [OccasionTag, string[]][]) {
    for (const keyword of keywords) {
      if (searchText.includes(keyword)) {
        scores[tag] += keyword.split(' ').length > 1 ? 2 : 1; // Multi-word matches score higher
      }
    }
  }

  // Return top 3 tags with score > 0
  return (Object.entries(scores) as [OccasionTag, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
}
