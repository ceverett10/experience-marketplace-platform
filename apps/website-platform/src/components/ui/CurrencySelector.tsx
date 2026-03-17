'use client';

import { useCurrency } from '@/lib/site-context';
import { SUPPORTED_CURRENCIES, CURRENCY_COOKIE } from '@/lib/currency';

const CURRENCY_LABELS: Record<string, string> = {
  GBP: '£ GBP',
  EUR: '€ EUR',
  USD: '$ USD',
};

/**
 * Currency selector dropdown. Updates the preferred_currency cookie and reloads
 * the page so server components re-fetch prices from Holibob in the new currency.
 */
export function CurrencySelector({ className }: { className?: string }) {
  const currentCurrency = useCurrency();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCurrency = e.target.value;
    if (newCurrency === currentCurrency) return;
    document.cookie = `${CURRENCY_COOKIE}=${newCurrency};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    window.location.reload();
  };

  return (
    <select
      value={currentCurrency}
      onChange={handleChange}
      aria-label="Select currency"
      className={`rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:border-gray-300 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 ${className ?? ''}`}
    >
      {SUPPORTED_CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {CURRENCY_LABELS[c] ?? c}
        </option>
      ))}
    </select>
  );
}
