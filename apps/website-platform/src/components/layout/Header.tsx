'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSite, useBrand } from '@/lib/site-context';
import { CurrencySelector } from '@/components/ui/CurrencySelector';
import { useWishlist } from '@/hooks/useWishlist';

/**
 * Returns a logo text color that is guaranteed to be readable on a white header background.
 * If the brand's primary color is too light (relative luminance > 0.4), falls back to a
 * dark navy so the text-logo doesn't disappear against the white nav bar.
 */
function getLogoTextColor(primaryColor: string | undefined | null): string {
  const fallback = '#1a2744';
  if (!primaryColor) return fallback;
  try {
    const hex = primaryColor.replace('#', '');
    if (hex.length !== 6) return primaryColor;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    // Contrast ratio against white (luminance 1.0): (1 + 0.05) / (luminance + 0.05)
    // WCAG AA requires 4.5:1 for normal text. Threshold luminance ≈ 0.18.
    return luminance > 0.18 ? fallback : primaryColor;
  } catch {
    return primaryColor;
  }
}

export function Header() {
  const site = useSite();
  const brand = useBrand();
  const searchParams = useSearchParams();
  const { count: wishlistCount } = useWishlist();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Detect paid traffic — simplify navigation to reduce distraction
  // Check URL params first, then fall back to utm_params cookie (persisted by middleware)
  // so paid visitors keep simplified nav when navigating to new tabs/pages
  let isPaid = !!(
    searchParams.get('gclid') ||
    searchParams.get('fbclid') ||
    searchParams.get('utm_medium') === 'cpc'
  );
  if (!isPaid && typeof document !== 'undefined') {
    try {
      const utmCookie = document.cookie.split('; ').find((c) => c.startsWith('utm_params='));
      if (utmCookie) {
        const utm = JSON.parse(decodeURIComponent(utmCookie.split('=').slice(1).join('=')));
        isPaid = !!(utm.gclid || utm.fbclid || utm.medium === 'cpc');
      }
    } catch {
      // Invalid cookie — ignore
    }
  }

  // Paid visitors see "Free Cancellation" and "Best Price Guarantee" first
  const trustItems = isPaid
    ? [
        { icon: 'guarantee', text: 'Best Price Guarantee' },
        { icon: 'check', text: 'Free Cancellation' },
        { icon: 'bolt', text: 'Instant Confirmation' },
        { icon: 'shield', text: 'Secure Payments' },
        { icon: 'headset', text: '24/7 Support' },
      ]
    : [
        { icon: 'check', text: 'Free Cancellation' },
        { icon: 'bolt', text: 'Instant Confirmation' },
        { icon: 'shield', text: 'Secure Payments' },
        { icon: 'guarantee', text: 'Best Price Guarantee' },
        { icon: 'headset', text: '24/7 Support' },
      ];

  // Microsites use simplified navigation (no destinations/categories pages)
  const isMicrosite = !!site.micrositeContext;
  const isParentDomainSite = !!site.isParentDomain;

  // Paid traffic: simplified nav — only Experiences + Book Now (reduce distraction)
  const navigation = isPaid
    ? [{ name: 'Experiences', href: '/experiences' }]
    : isParentDomainSite
      ? [
          { name: 'Our Brands', href: '/#our-brands' },
          { name: 'Our Providers', href: '/#featured-providers' },
          { name: 'About Us', href: '/about' },
        ]
      : isMicrosite
        ? [
            { name: 'Experiences', href: '/experiences' },
            ...(site.hasBlogPosts ? [{ name: 'Blog', href: '/blog' }] : []),
            ...(site.hasFaqPages ? [{ name: 'FAQ', href: '/faq' }] : []),
            { name: 'About', href: '/about' },
          ]
        : [
            { name: 'Experiences', href: '/experiences' },
            { name: 'Destinations', href: '/destinations' },
            { name: 'Categories', href: '/categories' },
            ...(site.hasBlogPosts ? [{ name: 'Blog', href: '/blog' }] : []),
            ...(site.hasFaqPages ? [{ name: 'FAQ', href: '/faq' }] : []),
            { name: 'About', href: '/about' },
          ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      {/* Trust bar - always visible at the top */}
      <div className="border-b border-gray-100 bg-gray-50">
        {/* Desktop: show all items */}
        <div className="mx-auto hidden max-w-7xl items-center justify-center gap-6 px-4 py-1.5 sm:flex sm:px-6 lg:gap-8 lg:px-8">
          {trustItems.map((item) => (
            <div
              key={item.text}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600"
            >
              <svg className="h-3.5 w-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              {item.text}
            </div>
          ))}
        </div>
        {/* Mobile: scrollable row */}
        <div className="flex items-center gap-4 overflow-x-auto px-4 py-1.5 sm:hidden">
          {trustItems.map((item, index) => (
            <div
              key={item.text}
              className={`flex flex-shrink-0 items-center gap-1.5 text-xs font-medium text-gray-600${index >= 3 ? ' hidden' : ''}`}
            >
              <svg className="h-3.5 w-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              {item.text}
            </div>
          ))}
        </div>
      </div>

      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="lg:flex-1">
          <div className="flex items-center">
            <Link href="/" className="-m-1.5 p-1.5">
              {brand?.logoUrl ? (
                <Image
                  src={brand.logoUrl}
                  alt={site.name}
                  width={600}
                  height={400}
                  className="h-14 w-auto max-w-[280px] sm:h-16 sm:max-w-[360px]"
                  priority
                />
              ) : (
                <span
                  className="text-xl font-bold"
                  style={{ color: getLogoTextColor(brand?.primaryColor) }}
                >
                  {site.name}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile menu button */}
        <div className="flex lg:hidden">
          <button
            type="button"
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-3 text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="sr-only">Open main menu</span>
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Desktop navigation */}
        <div className="hidden lg:flex lg:gap-x-8">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500 rounded"
            >
              {item.name}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden lg:flex lg:flex-1 lg:items-center lg:justify-end lg:gap-3">
          <CurrencySelector />
          {/* Wishlist icon with count badge */}
          <Link
            href="/wishlist"
            className="relative rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-rose-500"
            aria-label={`Wishlist${wishlistCount > 0 ? ` (${wishlistCount} items)` : ''}`}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
              />
            </svg>
            {wishlistCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                {wishlistCount > 9 ? '9+' : wishlistCount}
              </span>
            )}
          </Link>
          <Link
            href={isParentDomainSite ? '/#our-brands' : '/experiences'}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm"
            style={{
              backgroundColor: isMicrosite
                ? `var(--supplier-brand, ${brand?.primaryColor ?? '#6366f1'})`
                : (brand?.primaryColor ?? '#6366f1'),
            }}
          >
            {isParentDomainSite ? 'Explore Brands' : 'Book Now'}
          </Link>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden">
          <div className="space-y-1 px-4 pb-3 pt-2">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="block rounded-lg px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            <Link
              href={isParentDomainSite ? '/#our-brands' : '/experiences'}
              className="mt-4 block rounded-md px-3 py-2.5 text-center text-base font-semibold text-white"
              style={{
                backgroundColor: isMicrosite
                  ? `var(--supplier-brand, ${brand?.primaryColor ?? '#6366f1'})`
                  : (brand?.primaryColor ?? '#6366f1'),
              }}
              onClick={() => setMobileMenuOpen(false)}
            >
              {isParentDomainSite ? 'Explore Brands' : 'Book Now'}
            </Link>
            <div className="mt-3 flex items-center gap-2 px-3">
              <span className="text-sm text-gray-500">Currency:</span>
              <CurrencySelector />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
