'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSite, useBrand } from '@/lib/site-context';

export function Header() {
  const site = useSite();
  const brand = useBrand();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Detect paid traffic — simplify navigation to reduce distraction
  const isPaid = !!(
    searchParams.get('gclid') ||
    searchParams.get('fbclid') ||
    searchParams.get('utm_medium') === 'cpc'
  );

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
            { name: 'Blog', href: '/blog' },
            { name: 'About', href: '/about' },
          ]
        : [
            { name: 'Experiences', href: '/experiences' },
            { name: 'Destinations', href: '/destinations' },
            { name: 'Categories', href: '/categories' },
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

      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-3">
            {brand?.logoUrl ? (
              <div className="relative h-10 w-40 sm:h-12 sm:w-48 lg:h-14 lg:w-56">
                <Image
                  className="object-contain object-left"
                  src={brand.logoUrl}
                  alt={site.name}
                  fill
                  sizes="(min-width: 1024px) 224px, (min-width: 640px) 192px, 160px"
                  priority
                />
              </div>
            ) : (
              <div className="flex items-baseline gap-2">
                <span
                  className="text-xl font-bold"
                  style={{ color: brand?.primaryColor ?? '#6366f1' }}
                >
                  {site.name}
                </span>
                {isMicrosite && (
                  <span className="hidden text-[11px] text-gray-400 sm:inline">
                    powered by{' '}
                    <a
                      href="https://experiencess.com"
                      className="text-gray-500 hover:text-gray-700 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Experiencess.com
                    </a>
                  </span>
                )}
              </div>
            )}
          </Link>
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
        <div className="hidden lg:flex lg:flex-1 lg:justify-end">
          <Link
            href={isParentDomainSite ? '/#our-brands' : '/experiences'}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm"
            style={{
              backgroundColor: brand?.primaryColor ?? '#6366f1',
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
              style={{ backgroundColor: brand?.primaryColor ?? '#6366f1' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              {isParentDomainSite ? 'Explore Brands' : 'Book Now'}
            </Link>
            {isMicrosite && (
              <p className="mt-4 border-t border-gray-100 pt-4 text-center text-[11px] text-gray-400">
                powered by{' '}
                <a href="https://experiencess.com" className="text-gray-500 hover:text-gray-700">
                  Experiencess.com
                </a>
              </p>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
