/**
 * Currency utilities for geo-based price display.
 *
 * Detects user's preferred currency from Cloudflare CF-IPCountry header,
 * persists in a cookie, and provides locale mappings for Intl.NumberFormat.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cookie name for user's currency preference */
export const CURRENCY_COOKIE = 'preferred_currency';

/** Currencies the platform supports (must be supported by Holibob via x-holibob-currency) */
export const SUPPORTED_CURRENCIES = ['GBP', 'EUR', 'USD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

// ---------------------------------------------------------------------------
// Country → Currency mapping
// ---------------------------------------------------------------------------

/** ISO 3166-1 alpha-2 country code → currency */
const COUNTRY_TO_CURRENCY: Record<string, SupportedCurrency> = {
  // GBP
  GB: 'GBP',
  IM: 'GBP', // Isle of Man
  JE: 'GBP', // Jersey
  GG: 'GBP', // Guernsey
  GI: 'GBP', // Gibraltar

  // USD
  US: 'USD',
  PR: 'USD', // Puerto Rico
  GU: 'USD', // Guam
  VI: 'USD', // US Virgin Islands
  AS: 'USD', // American Samoa
  MP: 'USD', // Northern Mariana Islands

  // EUR — Eurozone member states
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
  SK: 'EUR',
  SI: 'EUR',
  LT: 'EUR',
  LV: 'EUR',
  EE: 'EUR',
  CY: 'EUR',
  MT: 'EUR',
  LU: 'EUR',
  HR: 'EUR',
};

const DEFAULT_CURRENCY: SupportedCurrency = 'GBP';

/**
 * Map a Cloudflare CF-IPCountry code to the user's display currency.
 * Returns GBP for unmapped countries.
 */
export function countryToCurrency(countryCode: string | null): SupportedCurrency {
  if (!countryCode) return DEFAULT_CURRENCY;
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] ?? DEFAULT_CURRENCY;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Type guard: is this string one of our supported currencies? */
export function isSupportedCurrency(currency: string): currency is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(currency);
}

// ---------------------------------------------------------------------------
// Locale mapping
// ---------------------------------------------------------------------------

/** Map currency to the best Intl.NumberFormat locale for formatting */
const CURRENCY_TO_LOCALE: Record<SupportedCurrency, string> = {
  GBP: 'en-GB',
  EUR: 'en-IE', // Euro with English number formatting
  USD: 'en-US',
};

/**
 * Get the Intl locale appropriate for a currency code.
 * Falls back to 'en-GB' for unknown currencies.
 */
export function currencyToLocale(currency: string): string {
  return CURRENCY_TO_LOCALE[currency as SupportedCurrency] ?? 'en-GB';
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective currency for the current request.
 * Priority: valid cookie value > site's primary currency > GBP.
 */
export function getEffectiveCurrency(
  sitePrimaryCurrency: string,
  cookieValue: string | undefined
): string {
  if (cookieValue && isSupportedCurrency(cookieValue)) {
    return cookieValue;
  }
  return sitePrimaryCurrency || 'GBP';
}
