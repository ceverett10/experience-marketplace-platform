'use client';

import { calculatePromoPrice, DEFAULT_PRICING_CONFIG, type PricingConfig } from '@/lib/pricing';

interface PriceDisplayProps {
  /** Formatted actual price (e.g., "£50.00") */
  priceFormatted: string;
  /** Numeric price amount (in major units, e.g., 50.00) */
  priceAmount: number;
  /** Currency code (e.g., "GBP") */
  currency: string;
  /** Pricing config - defaults to 5% markup */
  pricingConfig?: PricingConfig;
  /** Display variant */
  variant?: 'card' | 'detail' | 'compact' | 'checkout';
  /** Brand primary color */
  primaryColor?: string;
  /** Show "From" prefix */
  showFrom?: boolean;
}

export function PriceDisplay({
  priceFormatted,
  priceAmount,
  currency,
  pricingConfig = DEFAULT_PRICING_CONFIG,
  variant = 'card',
  primaryColor = '#6366f1',
  showFrom = true,
}: PriceDisplayProps) {
  const promo = calculatePromoPrice(priceFormatted, priceAmount, currency, pricingConfig);

  if (!promo.hasPromo) {
    // No promotional pricing - show simple price
    if (variant === 'compact') {
      return (
        <span className="font-semibold" style={{ color: primaryColor }}>
          {showFrom && 'From '}{priceFormatted}
        </span>
      );
    }
    return (
      <span className="font-semibold" style={{ color: primaryColor }}>
        {showFrom && 'From '}{priceFormatted}
      </span>
    );
  }

  // Promotional pricing variants
  if (variant === 'card') {
    return (
      <div className="flex flex-col items-end">
        <span className="text-xs text-gray-400 line-through">{promo.originalFormatted}</span>
        <span className="font-semibold" style={{ color: primaryColor }}>
          {showFrom && 'From '}{promo.discountedFormatted}
        </span>
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-gray-400 line-through">{promo.originalFormatted}</span>
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            {promo.discountLabel}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold" style={{ color: primaryColor }}>
            {promo.discountedFormatted}
          </span>
          <span className="text-gray-500">per person</span>
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-gray-400 line-through">{promo.originalFormatted}</span>
        <span className="text-sm font-semibold" style={{ color: primaryColor }}>
          {showFrom && 'From '}{promo.discountedFormatted}
        </span>
      </div>
    );
  }

  // checkout variant
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Subtotal</span>
        <span className="line-through">{promo.originalFormatted}</span>
      </div>
      <div className="flex items-center justify-between text-sm text-emerald-600">
        <span>Discount ({promo.savingsPercent}% off)</span>
        <span>-{promo.savingsFormatted}</span>
      </div>
    </div>
  );
}

/**
 * Discount badge for card overlays
 */
export function DiscountBadge({
  pricingConfig = DEFAULT_PRICING_CONFIG,
  className = '',
}: {
  pricingConfig?: PricingConfig;
  className?: string;
}) {
  if (!pricingConfig.showDiscountBadge || pricingConfig.markupPercentage <= 0) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center rounded-md bg-rose-500 px-2 py-1 text-xs font-bold text-white shadow-sm ${className}`}
    >
      {pricingConfig.markupPercentage}% OFF
    </span>
  );
}
