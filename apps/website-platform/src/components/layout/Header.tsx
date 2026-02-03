'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSite, useBrand } from '@/lib/site-context';

export function Header() {
  const site = useSite();
  const brand = useBrand();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const isHomepage = pathname === '/';

  useEffect(() => {
    if (!isHomepage) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 80);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isHomepage]);

  // Transparent when on homepage and not scrolled
  const isTransparent = isHomepage && !scrolled;

  const navigation = [
    { name: 'Experiences', href: '/experiences' },
    { name: 'Destinations', href: '/destinations' },
    { name: 'Categories', href: '/categories' },
    { name: 'About', href: '/about' },
  ];

  return (
    <header
      className={`z-50 w-full transition-all duration-300 ${
        isHomepage ? 'fixed top-0' : 'sticky top-0'
      } ${
        isTransparent
          ? 'border-b border-transparent bg-transparent'
          : 'border-b border-gray-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5">
            {brand?.logoUrl ? (
              <img
                className={`h-8 w-auto transition-all duration-300 ${
                  isTransparent ? 'brightness-0 invert drop-shadow-md' : ''
                }`}
                src={brand.logoUrl}
                alt={site.name}
              />
            ) : (
              <span
                className={`text-xl font-bold transition-colors duration-300 ${
                  isTransparent ? 'text-white drop-shadow-md' : ''
                }`}
                style={{ color: isTransparent ? undefined : (brand?.primaryColor ?? '#6366f1') }}
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
            className={`-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 transition-colors duration-300 ${
              isTransparent ? 'text-white' : 'text-gray-700'
            }`}
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
              className={`text-sm font-medium transition-colors duration-300 ${
                isTransparent
                  ? 'text-white/90 hover:text-white'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden lg:flex lg:flex-1 lg:justify-end">
          <Link
            href="/experiences"
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-300 ${
              isTransparent ? 'ring-1 ring-white/30' : ''
            }`}
            style={{
              backgroundColor: brand?.primaryColor ?? '#6366f1',
            }}
          >
            Book Now
          </Link>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div
          className={`lg:hidden ${
            isTransparent ? 'bg-white/95 backdrop-blur-md rounded-b-lg shadow-lg' : ''
          }`}
        >
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
              href="/experiences"
              className="mt-4 block rounded-md px-3 py-2.5 text-center text-base font-semibold text-white"
              style={{ backgroundColor: brand?.primaryColor ?? '#6366f1' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              Book Now
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
