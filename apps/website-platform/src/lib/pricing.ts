/**
 * Promotional Pricing Utilities
 *
 * Calculates RRP (recommended retail price) by applying a configurable markup
 * to the actual price, then displays the actual price as a promotional discount.
 *
 * IMPORTANT: This uses a markup percentage to create a reference price (RRP).
 * The displayed "discount" is always relative to this calculated RRP.
 */

export interface PricingConfig {
  /** Markup percentage to calculate RRP (e.g., 5 means 5%) */
  markupPercentage: number;
  /** Whether to show the discount badge on cards */
  showDiscountBadge: boolean;
  /** Label for the discount (e.g., "SAVE 5%", "5% OFF", "SPECIAL OFFER") */
  discountLabel?: string;
}

export interface PromoPrice {
  /** Formatted RRP string (e.g., "£52.50") */
  originalFormatted: string;
  /** Formatted actual price string (e.g., "£50.00") */
  discountedFormatted: string;
  /** Discount percentage (e.g., 5) */
  savingsPercent: number;
  /** Formatted savings amount (e.g., "£2.50") */
  savingsFormatted: string;
  /** Whether promotional pricing is active */
  hasPromo: boolean;
  /** Label for the discount badge */
  discountLabel: string;
}

/**
 * Default pricing config - used as fallback when no product ID is available.
 * Prefer getProductPricingConfig(productId) for per-product varied discounts.
 */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  markupPercentage: 5,
  showDiscountBadge: true,
  discountLabel: 'SAVE 5%',
};

/** Min/max markup range for per-product variation */
const MIN_MARKUP = 5;
const MAX_MARKUP = 15;

/**
 * Simple deterministic hash from a product ID string.
 * Returns a positive integer.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Get a per-product pricing config with a varied markup percentage (5–15%).
 * The discount is deterministic — the same product ID always yields the same %.
 */
export function getProductPricingConfig(productId: string): PricingConfig {
  const markup = MIN_MARKUP + (hashString(productId) % (MAX_MARKUP - MIN_MARKUP + 1));
  return {
    markupPercentage: markup,
    showDiscountBadge: true,
    discountLabel: `SAVE ${markup}%`,
  };
}

/**
 * Calculate promotional pricing from actual price + markup percentage.
 *
 * @param actualPriceFormatted - The formatted actual price string (e.g., "£50.00")
 * @param currency - Currency code (e.g., "GBP", "EUR")
 * @param markupPercent - Markup percentage (e.g., 5 for 5%)
 * @param discountLabel - Optional custom label for the discount
 * @returns PromoPrice object with all display values
 */
export function calculatePromoPrice(
  actualPriceFormatted: string,
  actualPriceAmount: number,
  currency: string,
  config: PricingConfig
): PromoPrice {
  if (config.markupPercentage <= 0 || actualPriceAmount <= 0) {
    return {
      originalFormatted: actualPriceFormatted,
      discountedFormatted: actualPriceFormatted,
      savingsPercent: 0,
      savingsFormatted: '',
      hasPromo: false,
      discountLabel: '',
    };
  }

  // Calculate RRP by adding markup to actual price
  const rrpAmount = actualPriceAmount * (1 + config.markupPercentage / 100);

  // Round RRP to nearest .99 for psychological pricing
  const rrpRounded = Math.ceil(rrpAmount) - 0.01;

  // Format the RRP
  const rrpFormatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(rrpRounded);

  // Calculate actual savings (between rounded RRP and actual price)
  const savings = rrpRounded - actualPriceAmount;
  const savingsFormatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(savings);

  const label = config.discountLabel || `SAVE ${config.markupPercentage}%`;

  return {
    originalFormatted: rrpFormatted,
    discountedFormatted: actualPriceFormatted,
    savingsPercent: config.markupPercentage,
    savingsFormatted: savingsFormatted,
    hasPromo: true,
    discountLabel: label,
  };
}
