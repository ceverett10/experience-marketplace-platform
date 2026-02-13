'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useSite, useBrand } from '@/lib/site-context';

export function Header() {
  const site = useSite();
  const brand = useBrand();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const trustItems = [
    { icon: 'check', text: 'Free Cancellation' },
    { icon: 'bolt', text: 'Instant Confirmation' },
    { icon: 'shield', text: 'Secure Payments' },
    { icon: 'headset', text: '24/7 Support' },
  ];

  // Microsites use simplified navigation (no destinations/categories pages)
  const isMicrosite = !!site.micrositeContext;
  const isParentDomainSite = !!site.isParentDomain;

  const navigation = isParentDomainSite
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
            <div key={item.text} className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
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
          {trustItems.map((item) => (
            <div key={item.text} className="flex flex-shrink-0 items-center gap-1.5 text-xs font-medium text-gray-600">
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
          <Link href="/" className="-m-1.5 p-1.5">
            {brand?.logoUrl ? (
              <div className="relative h-10 w-40">
                <Image
                  className="object-contain object-left"
                  src={brand.logoUrl}
                  alt={site.name}
                  fill
                  sizes="160px"
                  priority
                />
              </div>
            ) : (
              <span
                className="text-xl font-bold"
                style={{ color: brand?.primaryColor ?? '#6366f1' }}
              >
                {site.name}
              </span>
            )}
          </Link>
        </div>

        {/* Mobile menu button */}
        <div className="flex lg:hidden">
          <button
            type="button"
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
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
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
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
          </div>
        </div>
      )}
    </header>
  );
}
