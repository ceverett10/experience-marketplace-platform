/**
 * Category Display Name Mapping
 *
 * Maps raw Holibob category names to SEO-friendly display names suitable for
 * page titles like "Best {category} in {city} - Book Online".
 *
 * Raw category names are preserved in Supplier.categories for keyword enrichment
 * and bidding engine compatibility. This mapping is applied at read-time only
 * in title generation (homepage titles, title templates, admin dashboard).
 *
 * To add new mappings: add entries to CATEGORY_DISPLAY_MAP below.
 * Key must be lowercase. Value should be a concise, user-friendly name.
 */

/**
 * Raw Holibob category name (lowercase) → SEO-friendly display name.
 *
 * Guidelines for display names:
 * - Should work in "Best {name} in {city}" pattern
 * - Plural form preferred ("Tours" not "Tour")
 * - Concise (2-4 words max)
 * - No generic filler words
 */
export const CATEGORY_DISPLAY_MAP: Record<string, string> = {
  // Activity types
  walking: 'Walking Tours',
  hiking: 'Hiking Tours',
  cycling: 'Bike Tours',
  running: 'Running Tours',
  climbing: 'Climbing Experiences',
  segway: 'Segway Tours',

  // Food & drink
  'food and drink tours': 'Food Tours',
  'street food': 'Street Food Tours',
  cooking: 'Cooking Classes',
  'wine and spirits': 'Wine Tasting Tours',
  'beer and brewery': 'Brewery Tours',
  'coffee and tea': 'Coffee Tours',
  'food and drink': 'Food & Drink Experiences',
  market: 'Market Tours',

  // Water activities
  'water sports': 'Water Sports',
  'sailing and boating': 'Boat Tours',
  'snorkeling and diving': 'Snorkeling & Diving',
  surfing: 'Surfing Lessons',
  kayaking: 'Kayaking Tours',
  fishing: 'Fishing Trips',
  'jet ski': 'Jet Ski Experiences',
  'whale watching': 'Whale Watching Tours',
  rafting: 'Rafting Adventures',

  // Sightseeing & culture
  sightseeing: 'Sightseeing Tours',
  'cultural and historical': 'Cultural Tours',
  'arts and crafts': 'Art & Craft Workshops',
  museum: 'Museum Tours',
  architecture: 'Architecture Tours',
  historical: 'Historical Tours',
  'religious and spiritual': 'Spiritual Tours',
  heritage: 'Heritage Tours',
  photography: 'Photo Tours',
  literary: 'Literary Tours',

  // Nature & adventure
  nature: 'Nature Tours',
  adventure: 'Adventure Tours',
  safari: 'Safari Tours',
  'eco-tourism': 'Eco Tours',
  wildlife: 'Wildlife Tours',
  'bird watching': 'Bird Watching Tours',
  garden: 'Garden Tours',

  // Entertainment & nightlife
  nightlife: 'Nightlife Tours',
  'shows and performances': 'Shows & Performances',
  'theme parks': 'Theme Park Tickets',
  'escape rooms': 'Escape Rooms',
  'live music': 'Live Music Experiences',
  comedy: 'Comedy Shows',
  entertainment: 'Entertainment',

  // Wellness & relaxation
  'spa and wellness': 'Spa & Wellness',
  yoga: 'Yoga Classes',
  meditation: 'Meditation Experiences',
  'hot springs': 'Hot Springs',

  // Transport & transfers
  'car, bus or mini-van': 'Private Transfers',
  transfer: 'Airport Transfers',
  transportation: 'Transport Services',
  shuttle: 'Shuttle Services',
  'airport transfer': 'Airport Transfers',
  'port transfer': 'Port Transfers',
  'hop-on / hop-off': 'Hop-On Hop-Off Bus Tours',

  // Day trips & multi-day
  'day trips': 'Day Trips',
  'multi-day': 'Multi-Day Tours',
  'full day': 'Full-Day Tours',
  'half day': 'Half-Day Tours',
  'shore excursions': 'Shore Excursions',
  'cruise excursions': 'Cruise Excursions',

  // Family & groups
  family: 'Family Activities',
  'kids activities': 'Kids Activities',
  romantic: 'Romantic Experiences',
  'team building': 'Team Building Activities',

  // Seasonal & special
  seasonal: 'Seasonal Tours',
  christmas: 'Christmas Experiences',
  halloween: 'Halloween Tours',
  festival: 'Festival Experiences',

  // Sport & fitness
  golf: 'Golf Experiences',
  skiing: 'Ski Experiences',
  'horse riding': 'Horse Riding',
  paragliding: 'Paragliding',
  'zip line': 'Zip Line Adventures',
  'bungee jumping': 'Bungee Jumping',
  skydiving: 'Skydiving Experiences',
  'quad and atv': 'ATV Tours',

  // Tickets & passes
  passes: 'City Passes & Tickets',
  tickets: 'Attraction Tickets',
  'skip the line': 'Skip-the-Line Tickets',

  // Generic / low-value categories (map to reasonable defaults)
  general: 'Tours & Activities',
  private: 'Private Tours',
  other: 'Tours & Activities',
  city: 'City Tours',
  natural: 'Nature Tours',
  iconic: 'Iconic Attractions',
  themed: 'Themed Tours',
  classes: 'Classes & Workshops',
  luxury: 'Luxury Experiences',
  virtual: 'Virtual Tours',
};

/**
 * Get a clean, SEO-friendly display name for a raw Holibob category.
 * Returns the raw name unchanged if no mapping exists.
 */
export function getCategoryDisplayName(raw: string): string {
  return CATEGORY_DISPLAY_MAP[raw.toLowerCase()] ?? raw;
}
