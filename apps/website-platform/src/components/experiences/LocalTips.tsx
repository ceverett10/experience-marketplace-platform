/**
 * Local Tips / Insider Advice
 *
 * Shows deterministic, location-aware tips on the experience detail page.
 * Tips are generated based on the experience location and category.
 */

interface LocalTipsProps {
  locationName: string;
  categories: string[];
}

// Pool of tips per category/context
const GENERAL_TIPS = [
  'Arrive 10-15 minutes early to get settled and meet your guide.',
  'Wear comfortable walking shoes — most experiences involve some walking.',
  'Bring a reusable water bottle to stay hydrated throughout the day.',
  'Download an offline map of the area in case you lose mobile signal.',
  'Keep a small amount of local currency on hand for tips or small purchases.',
];

const FOOD_TIPS = [
  'Come with an empty stomach — food tours typically include generous portions.',
  'Let your guide know about any dietary requirements at the start.',
  'Ask your guide for their personal restaurant recommendations nearby.',
];

const OUTDOOR_TIPS = [
  'Check the weather forecast and dress in layers for comfort.',
  'Apply sunscreen before you start, even on cloudy days.',
  'Bring a small backpack for water, snacks, and any gear provided.',
];

const CULTURAL_TIPS = [
  'Check if the venue has a dress code — some religious sites require covered shoulders.',
  'Photos may be restricted in certain areas — ask your guide first.',
  'Ask your guide about the local history — they often know fascinating stories not in guidebooks.',
];

const WATER_TIPS = [
  'Wear clothes you don\'t mind getting wet and bring a change for after.',
  'Secure your phone and valuables in a waterproof bag or leave them onshore.',
  'If you\'re prone to seasickness, take medication 30 minutes before departure.',
];

function getTipsForExperience(locationName: string, categories: string[]): string[] {
  const tips: string[] = [];
  const lowerCats = categories.map((c) => c.toLowerCase());

  // Add category-specific tips
  if (lowerCats.some((c) => c.includes('food') || c.includes('wine') || c.includes('culinary'))) {
    tips.push(...FOOD_TIPS);
  }
  if (lowerCats.some((c) => c.includes('outdoor') || c.includes('hiking') || c.includes('nature'))) {
    tips.push(...OUTDOOR_TIPS);
  }
  if (lowerCats.some((c) => c.includes('cultural') || c.includes('museum') || c.includes('heritage'))) {
    tips.push(...CULTURAL_TIPS);
  }
  if (lowerCats.some((c) => c.includes('water') || c.includes('boat') || c.includes('cruise') || c.includes('kayak'))) {
    tips.push(...WATER_TIPS);
  }

  // Always add some general tips
  tips.push(...GENERAL_TIPS);

  // Pick 3 unique tips deterministically based on location name hash
  let hash = 0;
  for (let i = 0; i < locationName.length; i++) {
    hash = ((hash << 5) - hash) + locationName.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash);

  const selected: string[] = [];
  const pool = [...tips];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = (hash + i * 7) % pool.length;
    const tip = pool[idx];
    if (tip) selected.push(tip);
    pool.splice(idx, 1);
  }

  return selected;
}

export function LocalTips({ locationName, categories }: LocalTipsProps) {
  const tips = getTipsForExperience(locationName, categories);

  if (tips.length === 0) return null;

  return (
    <section className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
        <svg className="h-5 w-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clipRule="evenodd"
          />
        </svg>
        {locationName ? `Insider tips for ${locationName}` : 'Insider tips'}
      </h2>
      <ul className="space-y-2.5">
        {tips.map((tip, idx) => (
          <li key={idx} className="flex items-start gap-2.5 text-sm text-amber-900">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
            {tip}
          </li>
        ))}
      </ul>
    </section>
  );
}
