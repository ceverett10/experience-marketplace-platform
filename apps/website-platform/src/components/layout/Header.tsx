'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSite, useBrand } from '@/lib/site-context';
import { CurrencySelector } from '@/components/ui/CurrencySelector';
import { PoweredByHolibob } from '@/components/ui/PoweredByHolibob';
import { useWishlist } from '@/hooks/useWishlist';

/**
 * Returns a logo text color that is guaranteed to be readable on a white header background.
 * If the brand's primary color is too light (relative luminance > 0.4), falls back to a
 * dark navy so the text-logo doesn't disappear against the white nav bar.
 */
/** Tiny SVG icons for the mobile trust bar, keyed by the `icon` field on trustItems. */
function TrustIcon({ type, className }: { type: string; className?: string }) {
  const cls = className ?? 'h-3 w-3';
  switch (type) {
    case 'check':
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      );
    case 'bolt':
      return (
        <svg className={cls} fill="currentColor" viewBox="0 0 20 20">
          <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
        </svg>
      );
    case 'shield':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
      );
    case 'guarantee':
      return (
        <svg className={cls} fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 1l2.928 5.856L19 7.82l-4.356 4.49.822 6.19L10 15.756 4.534 18.5l.822-6.19L1 7.82l6.072-.964L10 1z"
            clipRule="evenodd"
          />
        </svg>
      );
    case 'headset':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
          />
        </svg>
      );
    default:
      return (
        <svg className={cls} fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
            clipRule="evenodd"
          />
        </svg>
      );
  }
}

/** Icons for mobile menu navigation items, matched by item name. */
function MenuItemIcon({ name }: { name: string }) {
  const cls = 'h-5 w-5';
  switch (name) {
    case 'Experiences':
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
          />
        </svg>
      );
    case 'Destinations':
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
          />
        </svg>
      );
    case 'Categories':
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
        </svg>
      );
    case 'Blog':
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z"
          />
        </svg>
      );
    case 'FAQ':
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
          />
        </svg>
      );
    case 'About':
    case 'About Us':
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
          />
        </svg>
      );
    default:
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
          />
        </svg>
      );
  }
}

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

  // Paid traffic: minimal nav — Experiences + About for trust, everything else stripped
  const navigation = isPaid
    ? [
        { name: 'Experiences', href: '/experiences' },
        { name: 'About', href: '/about' },
      ]
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
    <>
      <header className="sticky top-0 z-50 w-full border-b border-gray-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        {/* Trust bar — subtle, premium feel */}
        <div className="border-b border-gray-100 bg-white">
          {/* Desktop: icons + text, bullet separators */}
          <div className="mx-auto hidden max-w-7xl items-center justify-center px-4 py-2 sm:flex sm:px-6 lg:px-8">
            {trustItems.map((item, index) => (
              <div key={item.text} className="flex items-center">
                {index > 0 && <span className="mx-4 text-gray-400">&middot;</span>}
                <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-gray-700">
                  <TrustIcon type={item.icon} className="h-3.5 w-3.5 text-emerald-500" />
                  {item.text}
                </span>
              </div>
            ))}
            {/* Main sites only: "Powered by Holibob" trust mark.
                Hidden on microsites (already supplier-branded) and parent
                domain (which IS the Holibob network). */}
            {!isMicrosite && !isParentDomainSite && (
              <div className="flex items-center">
                <span className="mx-4 text-gray-400">&middot;</span>
                <PoweredByHolibob variant="header" />
              </div>
            )}
          </div>
          {/* Mobile: scrollable row with small icons.
              Drop "Secure Payments" and "24/7 Support" to save horizontal space —
              still surfaced on desktop and inside the BookingWidget / checkout. */}
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-3 py-1.5 sm:hidden">
            {trustItems
              .filter((item) => item.text !== 'Secure Payments' && item.text !== '24/7 Support')
              .map((item, index) => (
                <div key={item.text} className="flex items-center">
                  {index > 0 && <span className="mr-2 text-gray-400">&middot;</span>}
                  <span className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-gray-700">
                    <TrustIcon type={item.icon} className="h-3 w-3 text-emerald-500" />
                    {item.text}
                  </span>
                </div>
              ))}
            {!isMicrosite && !isParentDomainSite && (
              <div className="flex items-center">
                <span className="mr-2 text-gray-400">&middot;</span>
                <PoweredByHolibob variant="header" />
              </div>
            )}
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:gap-12 lg:px-8">
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
                    className="font-display text-xl font-bold"
                    style={{ color: getLogoTextColor(brand?.primaryColor) }}
                  >
                    {site.name}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* Mobile actions: wishlist + menu */}
          <div className="flex items-center gap-1 lg:hidden">
            {/* Mobile wishlist icon */}
            <Link
              href="/wishlist"
              className="relative rounded-full p-2 text-gray-500 transition-colors hover:text-rose-500"
              aria-label={`Wishlist${wishlistCount > 0 ? ` (${wishlistCount} items)` : ''}`}
            >
              <svg
                className="h-5 w-5"
                fill={wishlistCount > 0 ? 'currentColor' : 'none'}
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                style={wishlistCount > 0 ? { color: '#f43f5e' } : undefined}
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
                className="font-display text-[15px] font-semibold tracking-tight text-gray-900 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500 rounded"
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
              className="rounded-full bg-gray-900 px-5 py-2 font-display text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {isParentDomainSite ? 'Explore Brands' : 'Book Now'}
            </Link>
          </div>
        </nav>
      </header>

      {/* Mobile menu rendered outside <header> to avoid backdrop-filter containing block */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white lg:hidden">
          {/* Menu header with brand color */}
          <div
            className="flex flex-shrink-0 items-center justify-between px-5 pb-4 pt-3"
            style={{ backgroundColor: brand?.primaryColor ?? '#1a2744' }}
          >
            <Link href="/" className="flex items-center" onClick={() => setMobileMenuOpen(false)}>
              {brand?.logoUrl ? (
                <Image
                  src={brand.logoUrl}
                  alt={site.name}
                  width={400}
                  height={200}
                  className="h-10 w-auto max-w-[200px] brightness-0 invert"
                />
              ) : (
                <span className="font-display text-lg font-bold text-white">{site.name}</span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-full p-2 text-white/80 hover:text-white"
              aria-label="Close menu"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable menu content */}
          <div className="flex-1 overflow-y-auto">
            {/* Navigation section */}
            <div className="border-b border-gray-100">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="flex items-center gap-4 border-b border-gray-100 px-5 py-4 last:border-b-0 active:bg-gray-50"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="flex h-6 w-6 items-center justify-center text-gray-500">
                    <MenuItemIcon name={item.name} />
                  </span>
                  <span className="flex-1 font-display text-[15px] font-medium text-gray-900">
                    {item.name}
                  </span>
                  <svg
                    className="h-4 w-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </Link>
              ))}
            </div>

            {/* Settings section */}
            <div className="px-5 pb-2 pt-5">
              <h3 className="font-display text-base font-bold text-gray-900">Settings</h3>
            </div>
            <div className="border-b border-gray-100">
              {/* Wishlist */}
              <Link
                href="/wishlist"
                className="flex items-center gap-4 border-b border-gray-100 px-5 py-4 active:bg-gray-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="flex h-6 w-6 items-center justify-center text-gray-500">
                  <svg
                    className="h-5 w-5"
                    fill={wishlistCount > 0 ? 'currentColor' : 'none'}
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    style={wishlistCount > 0 ? { color: '#f43f5e' } : undefined}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                    />
                  </svg>
                </span>
                <span className="flex-1 text-[15px] font-medium text-gray-900">Wishlist</span>
                {wishlistCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
                    {wishlistCount}
                  </span>
                )}
                <svg
                  className="h-4 w-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </Link>

              {/* Currency */}
              <div className="flex items-center gap-4 border-b border-gray-100 px-5 py-4">
                <span className="flex h-6 w-6 items-center justify-center text-gray-500">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </span>
                <span className="flex-1 text-[15px] font-medium text-gray-900">Currency</span>
                <CurrencySelector />
              </div>

              {/* Support */}
              <Link
                href="/about"
                className="flex items-center gap-4 px-5 py-4 active:bg-gray-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="flex h-6 w-6 items-center justify-center text-gray-500">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                    />
                  </svg>
                </span>
                <span className="flex-1 text-[15px] font-medium text-gray-900">Support</span>
                <svg
                  className="h-4 w-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </Link>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="flex-shrink-0 border-t border-gray-200 px-5 pb-6 pt-4">
            <Link
              href={isParentDomainSite ? '/#our-brands' : '/experiences'}
              className="block rounded-xl py-3.5 text-center font-display text-base font-semibold text-white shadow-sm"
              style={{
                backgroundColor: isMicrosite
                  ? `var(--supplier-brand, ${brand?.primaryColor ?? '#6366f1'})`
                  : (brand?.primaryColor ?? '#6366f1'),
              }}
              onClick={() => setMobileMenuOpen(false)}
            >
              {isParentDomainSite ? 'Explore Brands' : 'Book Now'}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
