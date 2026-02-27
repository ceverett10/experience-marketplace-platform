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
  'biking / cycling': 'Cycling Tours',
  running: 'Running Tours',
  climbing: 'Climbing Experiences',
  segway: 'Segway Tours',
  'segway / scooter': 'Segway & Scooter Tours',

  // Food & drink
  'food and drink tours': 'Food Tours',
  'street food': 'Street Food Tours',
  cooking: 'Cooking Classes',
  'cooking classes': 'Cooking Classes',
  'paella cooking class': 'Cooking Classes',
  'food tasting': 'Food Tasting Tours',
  'food experiences': 'Food Experiences',
  'wine and spirits': 'Wine Tasting Tours',
  'wine tours': 'Wine Tours',
  'beer and brewery': 'Brewery Tours',
  'coffee and tea': 'Coffee Tours',
  'food and drink': 'Food & Drink Experiences',
  'dining experience': 'Dining Experiences',
  'drink experience': 'Drink Experiences',
  'drink experiences': 'Drink Experiences',
  restaurants: 'Restaurant Experiences',
  market: 'Market Tours',

  // Water activities
  'water sports': 'Water Sports',
  watersports: 'Water Sports',
  'sailing and boating': 'Boat Tours',
  sailing: 'Sailing Tours',
  boat: 'Boat Tours',
  'snorkeling and diving': 'Snorkeling & Diving',
  surfing: 'Surfing Lessons',
  'surfing / windsurfing': 'Surfing & Windsurfing',
  kayaking: 'Kayaking Tours',
  fishing: 'Fishing Trips',
  'jet ski': 'Jet Ski Experiences',
  'whale watching': 'Whale Watching Tours',
  rafting: 'Rafting Adventures',
  'dinner cruise': 'Dinner Cruises',

  // Sightseeing & culture
  sightseeing: 'Sightseeing Tours',
  'sightseeing pass': 'Sightseeing Passes',
  'cultural and historical': 'Cultural Tours',
  culture: 'Cultural Tours',
  'history & heritage': 'History & Heritage Tours',
  'arts and crafts': 'Art & Craft Workshops',
  museum: 'Museum Tours',
  architecture: 'Architecture Tours',
  historical: 'Historical Tours',
  'religious and spiritual': 'Spiritual Tours',
  religion: 'Religious Tours',
  heritage: 'Heritage Tours',
  photography: 'Photo Tours',
  literary: 'Literary Tours',
  exhibitions: 'Exhibitions & Shows',
  'observation decks': 'Observation Deck Tickets',
  theatre: 'Theatre Experiences',
  'flamenco show': 'Flamenco Shows',

  // Nature & adventure
  nature: 'Nature Tours',
  adventure: 'Adventure Tours',
  safari: 'Safari Tours',
  'eco-tourism': 'Eco Tours',
  wildlife: 'Wildlife Tours',
  'bird watching': 'Bird Watching Tours',
  birdwatching: 'Bird Watching Tours',
  garden: 'Garden Tours',
  gardens: 'Garden Tours',
  'desert experiences': 'Desert Tours',

  // Entertainment & nightlife
  nightlife: 'Nightlife Tours',
  'shows and performances': 'Shows & Performances',
  'theme parks': 'Theme Park Tickets',
  'theme park / amusement park': 'Theme Park Tickets',
  'escape rooms': 'Escape Rooms',
  'live music': 'Live Music Experiences',
  live: 'Live Entertainment',
  comedy: 'Comedy Shows',
  entertainment: 'Entertainment',
  'fun and games - experiences': 'Fun Activities',
  dance: 'Dance Experiences',
  shopping: 'Shopping Tours',

  // Wellness & relaxation
  'spa and wellness': 'Spa & Wellness',
  spa: 'Spa & Wellness',
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
  'hop-on hop-off': 'Hop-On Hop-Off Bus Tours',
  motorbike: 'Motorbike Tours',
  train: 'Train Experiences',

  // Day trips & multi-day
  'day trips': 'Day Trips',
  'multi-day': 'Multi-Day Tours',
  'full day': 'Full-Day Tours',
  'half day': 'Half-Day Tours',
  'shore excursions': 'Shore Excursions',
  'cruise excursions': 'Cruise Excursions',
  'cruise / cruise excursion': 'Cruise Excursions',

  // Family & groups
  family: 'Family Activities',
  'kids activities': 'Kids Activities',
  romantic: 'Romantic Experiences',
  couples: 'Couples Experiences',
  adults: 'Adult Experiences',
  'team building': 'Team Building Activities',

  // Seasonal & special
  seasonal: 'Seasonal Tours',
  christmas: 'Christmas Experiences',
  halloween: 'Halloween Tours',
  festival: 'Festival Experiences',
  'festival - event': 'Festival Events',

  // Sport & fitness
  golf: 'Golf Experiences',
  skiing: 'Ski Experiences',
  snowmobile: 'Snowmobile Tours',
  'snow activities': 'Snow Activities',
  'horse riding': 'Horse Riding',
  paragliding: 'Paragliding',
  'zip line': 'Zip Line Adventures',
  ziplining: 'Zip Line Adventures',
  'bungee jumping': 'Bungee Jumping',
  skydiving: 'Skydiving Experiences',
  'quad and atv': 'ATV Tours',
  'hot-air balooning': 'Hot Air Balloon Rides',
  helicopter: 'Helicopter Tours',
  tennis: 'Tennis Experiences',
  sport: 'Sports Activities',

  // Tickets & passes
  passes: 'City Passes & Tickets',
  tickets: 'Attraction Tickets',
  'skip the line': 'Skip-the-Line Tickets',

  // Generic / low-value categories (map to reasonable defaults)
  general: 'Tours & Activities',
  private: 'Private Tours',
  other: 'Tours & Activities',
  misc: 'Tours & Activities',
  city: 'City Tours',
  'city tour': 'City Tours',
  natural: 'Nature Tours',
  iconic: 'Iconic Attractions',
  themed: 'Themed Tours',
  classes: 'Classes & Workshops',
  'language class': 'Language Classes',
  luxury: 'Luxury Experiences',
  virtual: 'Virtual Tours',
  'local tour': 'Local Tours',
  'hunting - experiences': 'Hunting Experiences',
};

/**
 * Get a clean, SEO-friendly display name for a raw Holibob category.
 * Returns the raw name unchanged if no mapping exists.
 */
export function getCategoryDisplayName(raw: string): string {
  return CATEGORY_DISPLAY_MAP[raw.toLowerCase()] ?? raw;
}
