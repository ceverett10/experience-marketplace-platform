/**
 * Keyword Location Utilities
 *
 * Extracts destination city from keyword text by matching against known cities
 * in our Product/Supplier database. Used by both paid-keyword-scanner and
 * keyword-enrichment to ensure consistent location values.
 *
 * Task 1.3: Standardize keyword locations
 */

import { prisma } from '@experience-marketplace/database';

/**
 * Cache of known city names from the Product and Supplier tables.
 * Sorted longest-first for accurate substring matching
 * (so "New York City" matches before "York").
 */
let _cityCache: string[] | null = null;
let _cityCacheTime = 0;
const CITY_CACHE_TTL = 3600000; // 1 hour

/**
 * Load all known city names from the database.
 * Merges cities from both Product.city and Supplier.cities[].
 */
async function getKnownCities(): Promise<string[]> {
  if (_cityCache && Date.now() - _cityCacheTime < CITY_CACHE_TTL) {
    return _cityCache;
  }

  // Get unique cities from products
  const productCities = await prisma.product.findMany({
    where: { city: { not: '' } },
    select: { city: true },
    distinct: ['city'],
  });

  // Get cities from suppliers
  const suppliers = await prisma.supplier.findMany({
    where: { cities: { isEmpty: false } },
    select: { cities: true },
  });

  const citySet = new Set<string>();
  for (const p of productCities) {
    if (p.city && p.city.length >= 3) citySet.add(p.city);
  }
  for (const s of suppliers) {
    for (const c of s.cities) {
      if (c.length >= 3) citySet.add(c);
    }
  }

  // Sort longest first so "New York City" matches before "York"
  _cityCache = [...citySet].sort((a, b) => b.length - a.length);
  _cityCacheTime = Date.now();

  console.log(`[KeywordLocation] Loaded ${_cityCache.length} known cities for location extraction`);
  return _cityCache;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the destination city from a keyword string.
 * Matches against known cities in our Product/Supplier database.
 *
 * Examples:
 *   "food tours barcelona" → "Barcelona"
 *   "things to do in london" → "London"
 *   "best cooking class" → "" (no city detected)
 *   "kayaking tours" → "" (no city detected)
 *
 * @returns The matched city name (proper case from DB) or empty string.
 */
export async function extractDestinationFromKeyword(keyword: string): Promise<string> {
  const cities = await getKnownCities();
  const keywordLower = keyword.toLowerCase();

  for (const city of cities) {
    const cityLower = city.toLowerCase();
    // Word boundary match to avoid partial matches ("Rome" in "Jerome")
    const regex = new RegExp(`\\b${escapeRegex(cityLower)}\\b`, 'i');
    if (regex.test(keywordLower)) {
      return city; // Return proper-cased city from DB
    }
  }

  return '';
}

/**
 * Reset the city cache (useful for testing or after bulk imports).
 */
export function resetCityCache(): void {
  _cityCache = null;
  _cityCacheTime = 0;
}
