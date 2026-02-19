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
 * Map of major tourism cities to their DataForSEO country names.
 * Used by Task 4.3 to pass destination-specific locations to DataForSEO
 * instead of hardcoded "United Kingdom".
 *
 * Keys are lowercase city names. Values match the country names in
 * DataForSEOClient.getLocationCode()'s commonLocations map.
 */
const CITY_TO_COUNTRY: Record<string, string> = {
  // United Kingdom
  london: 'United Kingdom',
  edinburgh: 'United Kingdom',
  manchester: 'United Kingdom',
  birmingham: 'United Kingdom',
  glasgow: 'United Kingdom',
  liverpool: 'United Kingdom',
  bristol: 'United Kingdom',
  oxford: 'United Kingdom',
  cambridge: 'United Kingdom',
  bath: 'United Kingdom',
  york: 'United Kingdom',
  brighton: 'United Kingdom',
  cardiff: 'United Kingdom',
  belfast: 'United Kingdom',
  inverness: 'United Kingdom',
  // Spain
  barcelona: 'Spain',
  madrid: 'Spain',
  seville: 'Spain',
  valencia: 'Spain',
  malaga: 'Spain',
  granada: 'Spain',
  bilbao: 'Spain',
  ibiza: 'Spain',
  palma: 'Spain',
  'palma de mallorca': 'Spain',
  tenerife: 'Spain',
  'san sebastian': 'Spain',
  toledo: 'Spain',
  cordoba: 'Spain',
  // France
  paris: 'France',
  nice: 'France',
  lyon: 'France',
  marseille: 'France',
  bordeaux: 'France',
  strasbourg: 'France',
  toulouse: 'France',
  montpellier: 'France',
  cannes: 'France',
  // Italy
  rome: 'Italy',
  florence: 'Italy',
  venice: 'Italy',
  milan: 'Italy',
  naples: 'Italy',
  amalfi: 'Italy',
  positano: 'Italy',
  sorrento: 'Italy',
  siena: 'Italy',
  pisa: 'Italy',
  turin: 'Italy',
  verona: 'Italy',
  palermo: 'Italy',
  catania: 'Italy',
  bologna: 'Italy',
  'cinque terre': 'Italy',
  // Germany
  berlin: 'Germany',
  munich: 'Germany',
  hamburg: 'Germany',
  frankfurt: 'Germany',
  cologne: 'Germany',
  dusseldorf: 'Germany',
  dresden: 'Germany',
  // Netherlands
  amsterdam: 'Netherlands',
  rotterdam: 'Netherlands',
  'the hague': 'Netherlands',
  // Portugal
  lisbon: 'Portugal',
  porto: 'Portugal',
  faro: 'Portugal',
  funchal: 'Portugal',
  // Greece
  athens: 'Greece',
  santorini: 'Greece',
  mykonos: 'Greece',
  crete: 'Greece',
  rhodes: 'Greece',
  corfu: 'Greece',
  thessaloniki: 'Greece',
  // Turkey
  istanbul: 'Turkey',
  antalya: 'Turkey',
  cappadocia: 'Turkey',
  bodrum: 'Turkey',
  ephesus: 'Turkey',
  // Croatia
  dubrovnik: 'Croatia',
  split: 'Croatia',
  zagreb: 'Croatia',
  hvar: 'Croatia',
  // Czech Republic
  prague: 'Czech Republic',
  // Hungary
  budapest: 'Hungary',
  // Austria
  vienna: 'Austria',
  salzburg: 'Austria',
  innsbruck: 'Austria',
  // Switzerland
  zurich: 'Switzerland',
  geneva: 'Switzerland',
  lucerne: 'Switzerland',
  interlaken: 'Switzerland',
  // Ireland
  dublin: 'Ireland',
  galway: 'Ireland',
  cork: 'Ireland',
  // Belgium
  brussels: 'Belgium',
  bruges: 'Belgium',
  ghent: 'Belgium',
  antwerp: 'Belgium',
  // Scandinavia
  copenhagen: 'Denmark',
  stockholm: 'Sweden',
  oslo: 'Norway',
  helsinki: 'Finland',
  reykjavik: 'Iceland',
  // Poland
  krakow: 'Poland',
  warsaw: 'Poland',
  gdansk: 'Poland',
  // USA
  'new york': 'United States',
  'new york city': 'United States',
  'los angeles': 'United States',
  'san francisco': 'United States',
  'las vegas': 'United States',
  miami: 'United States',
  chicago: 'United States',
  washington: 'United States',
  boston: 'United States',
  'san diego': 'United States',
  orlando: 'United States',
  seattle: 'United States',
  'new orleans': 'United States',
  honolulu: 'United States',
  hawaii: 'United States',
  // Canada
  toronto: 'Canada',
  vancouver: 'Canada',
  montreal: 'Canada',
  quebec: 'Canada',
  // Australia
  sydney: 'Australia',
  melbourne: 'Australia',
  brisbane: 'Australia',
  perth: 'Australia',
  cairns: 'Australia',
  'gold coast': 'Australia',
  // New Zealand
  auckland: 'New Zealand',
  queenstown: 'New Zealand',
  wellington: 'New Zealand',
  rotorua: 'New Zealand',
  // Japan
  tokyo: 'Japan',
  kyoto: 'Japan',
  osaka: 'Japan',
  hiroshima: 'Japan',
  // Thailand
  bangkok: 'Thailand',
  'chiang mai': 'Thailand',
  phuket: 'Thailand',
  'koh samui': 'Thailand',
  // UAE
  dubai: 'United Arab Emirates',
  'abu dhabi': 'United Arab Emirates',
  // Singapore
  singapore: 'Singapore',
  // India
  delhi: 'India',
  'new delhi': 'India',
  mumbai: 'India',
  jaipur: 'India',
  goa: 'India',
  agra: 'India',
  // South Korea
  seoul: 'South Korea',
  busan: 'South Korea',
  // Indonesia
  bali: 'Indonesia',
  jakarta: 'Indonesia',
  // Vietnam
  hanoi: 'Vietnam',
  'ho chi minh': 'Vietnam',
  'da nang': 'Vietnam',
  // Malaysia
  'kuala lumpur': 'Malaysia',
  // Philippines
  manila: 'Philippines',
  cebu: 'Philippines',
  // Mexico
  'mexico city': 'Mexico',
  cancun: 'Mexico',
  'playa del carmen': 'Mexico',
  tulum: 'Mexico',
  // Brazil
  'rio de janeiro': 'Brazil',
  'sao paulo': 'Brazil',
  // Colombia
  cartagena: 'Colombia',
  bogota: 'Colombia',
  medellin: 'Colombia',
  // Argentina
  'buenos aires': 'Argentina',
  // Peru
  lima: 'Peru',
  cusco: 'Peru',
  'machu picchu': 'Peru',
  // Chile
  santiago: 'Chile',
  // Morocco
  marrakech: 'Morocco',
  fez: 'Morocco',
  casablanca: 'Morocco',
  // Egypt
  cairo: 'Egypt',
  luxor: 'Egypt',
  // South Africa
  'cape town': 'South Africa',
  johannesburg: 'South Africa',
};

/**
 * Resolve a city name to its DataForSEO country name.
 * Returns the country if found, or a fallback (default: 'United Kingdom').
 *
 * Task 4.3: Keyword research per destination — DataForSEO location should
 * match the keyword's destination, not a fixed country.
 *
 * @param city - City name (case-insensitive)
 * @param fallback - Country to return if city is not in the map
 */
export function getCountryForCity(city: string, fallback = 'United Kingdom'): string {
  if (!city) return fallback;
  return CITY_TO_COUNTRY[city.toLowerCase()] ?? fallback;
}

/**
 * Extract the destination country from a keyword string.
 * First extracts the city via extractDestinationFromKeyword(),
 * then resolves it to a country via getCountryForCity().
 *
 * @returns The DataForSEO country name, or fallback if no city detected.
 */
export async function getDataForSEOLocationForKeyword(
  keyword: string,
  fallback = 'United Kingdom'
): Promise<string> {
  const city = await extractDestinationFromKeyword(keyword);
  if (!city) return fallback;
  return getCountryForCity(city, fallback);
}

/**
 * Reset the city cache (useful for testing or after bulk imports).
 */
export function resetCityCache(): void {
  _cityCache = null;
  _cityCacheTime = 0;
}
