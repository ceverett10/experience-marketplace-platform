'use client';

import { useState, useRef, useEffect } from 'react';
import { useCurrency } from '@/lib/site-context';
import { SUPPORTED_CURRENCIES, CURRENCY_COOKIE } from '@/lib/currency';

const CURRENCY_CONFIG: Record<string, { symbol: string; label: string; flag: string }> = {
  GBP: { symbol: '£', label: 'GBP', flag: '🇬🇧' },
  EUR: { symbol: '€', label: 'EUR', flag: '🇪🇺' },
  USD: { symbol: '$', label: 'USD', flag: '🇺🇸' },
};

/**
 * Polished currency picker with button + popover dropdown.
 * Sets the preferred_currency cookie and reloads the page so server components
 * re-fetch prices from Holibob in the new currency.
 */
export function CurrencySelector({ className }: { className?: string }) {
  const currentCurrency = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = CURRENCY_CONFIG[currentCurrency] ?? CURRENCY_CONFIG['GBP']!;

  const handleSelect = (currency: string) => {
    if (currency === currentCurrency) {
      setOpen(false);
      return;
    }
    document.cookie = `${CURRENCY_COOKIE}=${currency};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    window.location.reload();
  };

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Select currency"
        className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
      >
        <span>{current.flag}</span>
        <span>{current.symbol}</span>
        <span>{current.label}</span>
        <svg
          className={`h-3 w-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {SUPPORTED_CURRENCIES.map((c) => {
            const config = CURRENCY_CONFIG[c];
            if (!config) return null;
            const isActive = c === currentCurrency;
            return (
              <button
                key={c}
                type="button"
                onClick={() => handleSelect(c)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${isActive ? 'font-semibold text-teal-700' : 'text-gray-700'}`}
              >
                <span>{config.flag}</span>
                <span>{config.symbol}</span>
                <span className="flex-1">{config.label}</span>
                {isActive && (
                  <svg
                    className="h-4 w-4 text-teal-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
