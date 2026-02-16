/**
 * Paid Traffic Detection Utilities
 *
 * Detects paid visitors from UTM parameters, gclid, or fbclid.
 * Used to show conversion-optimized elements for paid traffic.
 */

/**
 * Checks if the current request comes from a paid ad.
 * Works with both search params objects and URLSearchParams.
 */
export function isPaidTraffic(
  searchParams: Record<string, string | undefined> | URLSearchParams
): boolean {
  const get = (key: string) =>
    searchParams instanceof URLSearchParams ? searchParams.get(key) : searchParams[key];

  return !!(
    get('gclid') ||
    get('fbclid') ||
    get('utm_medium') === 'cpc' ||
    get('utm_source')?.includes('google_ads') ||
    get('utm_source')?.includes('facebook_ads')
  );
}
