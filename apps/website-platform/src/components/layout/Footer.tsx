'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSite, useBrand, useHomepageConfig } from '@/lib/site-context';

// Default social links — shown on all sites unless brand has its own
const DEFAULT_SOCIAL_LINKS: Record<string, string> = {
  facebook: 'https://www.facebook.com/experiencess',
  twitter: 'https://x.com/experiencess',
};

// Default footer categories if none configured for the site
const DEFAULT_FOOTER_CATEGORIES = [
  { name: 'Tours & Activities', slug: 'tours' },
  { name: 'Day Trips', slug: 'day-trips' },
  { name: 'Attractions', slug: 'attractions' },
  { name: 'Food & Drink', slug: 'food-drink' },
];

export function Footer() {
  const site = useSite();
  const brand = useBrand();
  const homepageConfig = useHomepageConfig();

  // Parent domain has its own footer layout
  if (site.isParentDomain) {
    return <ParentDomainFooter />;
  }

  // Get destination from homepage config (e.g., "London" for london-food-tours.com)
  const destination = homepageConfig?.popularExperiences?.destination;

  // Use categories from homepage config, or fall back to defaults
  const siteCategories = homepageConfig?.categories ?? DEFAULT_FOOTER_CATEGORIES;

  // Build experience links with proper search params (q=what, destination=where)
  const experienceLinks = siteCategories.slice(0, 4).map((category) => {
    const params = new URLSearchParams();
    params.set('q', category.name);
    if (destination) {
      params.set('destination', destination);
    }
    return {
      name: category.name,
      href: `/experiences?${params.toString()}`,
    };
  });

  const footerNavigation = {
    experiences: experienceLinks,
    company: [
      { name: 'About Us', href: '/about' },
      { name: 'Contact', href: '/contact' },
    ],
    legal: [
      { name: 'Privacy Policy', href: '/privacy' },
      { name: 'Terms of Service', href: '/terms' },
    ],
  };

  const socialLinks = brand?.socialLinks ?? DEFAULT_SOCIAL_LINKS;

  return (
    <footer className="bg-gray-900" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="mx-auto max-w-7xl px-6 pb-8 pt-16 sm:pt-24 lg:px-8 lg:pt-32">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          {/* Brand section */}
          <div className="space-y-8">
            {brand?.logoUrl ? (
              <div className="relative h-8 w-32">
                <Image
                  className="object-contain object-left brightness-0 invert"
                  src={brand.logoUrl}
                  alt={site.name}
                  fill
                  sizes="128px"
                />
              </div>
            ) : (
              <span className="text-2xl font-bold text-white">{site.name}</span>
            )}
            <p className="text-sm leading-6 text-gray-300">
              {brand?.tagline ??
                site.description ??
                'Discover unique experiences in your destination.'}
            </p>
            <SocialLinks links={socialLinks} />
          </div>

          {/* Navigation */}
          <div className="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold leading-6 text-white">Experiences</h3>
                <ul role="list" className="mt-6 space-y-4">
                  {footerNavigation.experiences.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className="text-sm font-semibold leading-6 text-white">Company</h3>
                <ul role="list" className="mt-6 space-y-4">
                  {footerNavigation.company.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold leading-6 text-white">Legal</h3>
                <ul role="list" className="mt-6 space-y-4">
                  {footerNavigation.legal.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Cross-site links to related microsites */}
              {site.relatedMicrosites && site.relatedMicrosites.length > 0 && (
                <div className="mt-10 md:mt-0">
                  <h3 className="text-sm font-semibold leading-6 text-white">More Experiences</h3>
                  <ul role="list" className="mt-6 space-y-4">
                    {site.relatedMicrosites.slice(0, 5).map((ms) => (
                      <li key={ms.fullDomain}>
                        <a
                          href={`https://${ms.fullDomain}`}
                          className="text-sm leading-6 text-gray-300 hover:text-white"
                        >
                          {ms.siteName}
                        </a>
                      </li>
                    ))}
                    <li>
                      <a
                        href="https://experiencess.com"
                        className="text-sm leading-6 text-indigo-400 hover:text-indigo-300"
                      >
                        Experiencess Network &rarr;
                      </a>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <PaymentLogos />

        {/* Bottom section */}
        <div className="mt-8 border-t border-white/10 pt-8">
          <p className="text-xs leading-5 text-gray-400">
            &copy; {new Date().getFullYear()} Holibob. All rights reserved.
            {site.micrositeContext && (
              <>
                {' '}Part of the{' '}
                <a href="https://experiencess.com" className="text-gray-300 hover:text-white">
                  Experiencess.com
                </a>
                {' '}network.
              </>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * Social media links with icons
 */
function SocialLinks({ links }: { links: Record<string, string> }) {
  return (
    <div className="flex space-x-6">
      {links['facebook'] && (
        <a
          href={links['facebook']}
          className="text-gray-400 hover:text-gray-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="sr-only">Facebook</span>
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
            <path
              fillRule="evenodd"
              d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      )}
      {links['instagram'] && (
        <a
          href={links['instagram']}
          className="text-gray-400 hover:text-gray-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="sr-only">Instagram</span>
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
            <path
              fillRule="evenodd"
              d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      )}
      {links['twitter'] && (
        <a
          href={links['twitter']}
          className="text-gray-400 hover:text-gray-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="sr-only">X (Twitter)</span>
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      )}
    </div>
  );
}

/**
 * Payment provider logos shown in footer
 */
function PaymentLogos() {
  return (
    <div className="mt-12 border-t border-white/10 pt-8">
      <p className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-500">We accept</p>
      <div className="flex flex-wrap items-center gap-3">
        {/* Visa */}
        <div className="flex h-8 items-center rounded bg-white/10 px-3">
          <span className="text-xs font-bold tracking-wide text-gray-400">VISA</span>
        </div>
        {/* Mastercard */}
        <div className="flex h-8 items-center rounded bg-white/10 px-3">
          <svg className="h-5 w-auto" viewBox="0 0 32 20" fill="none">
            <circle cx="12" cy="10" r="7" fill="#6B7280" fillOpacity="0.4" />
            <circle cx="20" cy="10" r="7" fill="#6B7280" fillOpacity="0.4" />
          </svg>
        </div>
        {/* Amex */}
        <div className="flex h-8 items-center rounded bg-white/10 px-3">
          <span className="text-xs font-bold tracking-wide text-gray-400">AMEX</span>
        </div>
        {/* Apple Pay */}
        <div className="flex h-8 items-center rounded bg-white/10 px-3">
          <span className="text-xs font-semibold text-gray-400">Apple Pay</span>
        </div>
        {/* Google Pay */}
        <div className="flex h-8 items-center rounded bg-white/10 px-3">
          <span className="text-xs font-semibold text-gray-400">Google Pay</span>
        </div>
        {/* Secured by Stripe */}
        <div className="flex h-8 items-center gap-1.5 rounded bg-white/10 px-3">
          <svg
            className="h-3.5 w-3.5 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
          <span className="text-xs text-gray-500">Secured by Stripe</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Footer variant for the parent domain (experiencess.com)
 */
function ParentDomainFooter() {
  const footerNavigation = {
    network: [
      { name: 'Our Brands', href: '/#our-brands' },
      { name: 'Our Providers', href: '/#featured-providers' },
      { name: 'Top Locations', href: '/#top-locations' },
    ],
    company: [
      { name: 'About Us', href: '/about' },
      { name: 'Contact', href: '/contact' },
    ],
    legal: [
      { name: 'Privacy Policy', href: '/privacy' },
      { name: 'Terms of Service', href: '/terms' },
    ],
  };

  return (
    <footer className="bg-gray-900" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="mx-auto max-w-7xl px-6 pb-8 pt-16 sm:pt-24 lg:px-8 lg:pt-32">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          {/* Brand section */}
          <div className="space-y-8">
            <span className="text-2xl font-bold text-white">Experiencess</span>
            <p className="text-sm leading-6 text-gray-300">
              A network of experience brands powered through our partnership with Holibob, helping
              people discover incredible experiences worldwide.
            </p>
            <SocialLinks links={DEFAULT_SOCIAL_LINKS} />
          </div>

          {/* Navigation */}
          <div className="mt-16 grid grid-cols-3 gap-8 xl:col-span-2 xl:mt-0">
            <div>
              <h3 className="text-sm font-semibold leading-6 text-white">Network</h3>
              <ul role="list" className="mt-6 space-y-4">
                {footerNavigation.network.map((item) => (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className="text-sm leading-6 text-gray-300 hover:text-white"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-6 text-white">Company</h3>
              <ul role="list" className="mt-6 space-y-4">
                {footerNavigation.company.map((item) => (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className="text-sm leading-6 text-gray-300 hover:text-white"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-6 text-white">Legal</h3>
              <ul role="list" className="mt-6 space-y-4">
                {footerNavigation.legal.map((item) => (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className="text-sm leading-6 text-gray-300 hover:text-white"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <PaymentLogos />

        {/* Bottom section */}
        <div className="mt-8 border-t border-white/10 pt-8">
          <p className="text-xs leading-5 text-gray-400">
            &copy; {new Date().getFullYear()} Holibob. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
