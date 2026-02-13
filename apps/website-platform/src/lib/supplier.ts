/**
 * Supplier type helpers
 * Thin routing layer to determine which API to use for a given site
 */

import type { SiteConfig } from './tenant';

export type SupplierType = 'HOLIBOB' | 'TICKITTO';

/**
 * Check if a site uses Tickitto as its supplier
 */
export function isTickittoSite(site: SiteConfig): boolean {
  return site.micrositeContext?.supplierType === 'TICKITTO';
}

/**
 * Check if a site uses Holibob as its supplier (default)
 */
export function isHolibobSite(site: SiteConfig): boolean {
  return !site.micrositeContext?.supplierType || site.micrositeContext.supplierType === 'HOLIBOB';
}

/**
 * Get the supplier type for a site
 */
export function getSupplierType(site: SiteConfig): SupplierType {
  return site.micrositeContext?.supplierType ?? 'HOLIBOB';
}
