/**
 * Parent Domain Homepage Component
 * Displays the experiencess.com directory/marketplace landing page
 */

import Link from 'next/link';
import type {
  FeaturedSupplier,
  SupplierCategory,
  SupplierCity,
  PlatformStats,
  FeaturedSite,
} from '@/lib/parent-domain';

interface ParentDomainHomepageProps {
  suppliers: FeaturedSupplier[];
  categories: SupplierCategory[];
  cities: SupplierCity[];
  stats: PlatformStats;
  sites: FeaturedSite[];
}

export function ParentDomainHomepage({
  suppliers,
  categories,
  cities,
  stats,
  sites,
}: ParentDomainHomepageProps) {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Experiencess
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl text-indigo-100">
              A network of experience brands powered through our partnership with Holibob,
              helping people discover and book incredible experiences worldwide.
            </p>
            <div className="mx-auto mt-8 flex flex-wrap justify-center gap-4">
              <a
                href="#our-brands"
                className="rounded-lg bg-white px-6 py-3 font-semibold text-indigo-600 shadow-lg hover:bg-indigo-50"
              >
                Our Brands
              </a>
              <a
                href="#featured-providers"
                className="rounded-lg border-2 border-white px-6 py-3 font-semibold text-white hover:bg-white/10"
              >
                Our Providers
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-b bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="text-center">
              <div className="text-3xl font-bold text-indigo-600">
                {stats.totalSuppliers.toLocaleString()}
              </div>
              <div className="mt-1 text-sm text-gray-600">Experience Providers</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-indigo-600">
                {stats.totalProducts.toLocaleString()}+
              </div>
              <div className="mt-1 text-sm text-gray-600">Tours & Activities</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-indigo-600">
                {stats.totalCities.toLocaleString()}
              </div>
              <div className="mt-1 text-sm text-gray-600">Destinations</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-indigo-600">
                {stats.totalCategories.toLocaleString()}
              </div>
              <div className="mt-1 text-sm text-gray-600">Categories</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-indigo-600">
                {stats.activeMicrosites.toLocaleString()}
              </div>
              <div className="mt-1 text-sm text-gray-600">Active Microsites</div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Brands */}
      {sites.length > 0 && (
        <section id="our-brands" className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">Our Brands</h2>
              <p className="mt-2 text-lg text-gray-600">
                Explore our network of specialist experience brands
              </p>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sites.map((site) => (
                <SiteCard key={site.id} site={site} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Our Featured Providers */}
      <section id="featured-providers" className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Our Featured Providers
            </h2>
            <p className="mt-2 text-lg text-gray-600">
              Top-rated tour operators and activity providers across our network
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {suppliers.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} />
            ))}
          </div>

          {suppliers.length === 0 && (
            <div className="mt-10 text-center text-gray-500">
              <p>No suppliers found yet. Run the sync to populate data.</p>
            </div>
          )}
        </div>
      </section>

      {/* Top Locations */}
      {cities.length > 0 && (
        <section id="top-locations" className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">Top Locations</h2>
              <p className="mt-2 text-lg text-gray-600">
                Browse experience providers by destination
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
              {cities.map((city) => (
                <Link
                  key={city.slug}
                  href={`/providers?city=${encodeURIComponent(city.name)}`}
                  className="group flex flex-col items-center rounded-lg bg-gray-50 p-4 transition-all hover:bg-indigo-50"
                >
                  <span className="text-2xl">{getCityEmoji(city.name)}</span>
                  <h3 className="mt-2 text-center text-sm font-medium text-gray-900 group-hover:text-indigo-600">
                    {city.name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {city.supplierCount} provider{city.supplierCount !== 1 ? 's' : ''}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Browse by Category */}
      {categories.length > 0 && (
        <section className="bg-gray-50 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                Browse by Category
              </h2>
              <p className="mt-2 text-lg text-gray-600">
                Find experiences that match your interests
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/providers?category=${encodeURIComponent(category.name)}`}
                  className="group rounded-lg bg-white p-6 shadow-sm transition-all hover:shadow-md"
                >
                  <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600">
                    {category.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {category.supplierCount} provider{category.supplierCount !== 1 ? 's' : ''}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="bg-indigo-600 py-16">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Are you an experience provider?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-indigo-100">
            Join our network and get your own branded microsite to showcase your tours and
            activities to travellers worldwide.
          </p>
          <div className="mt-8">
            <Link
              href="/providers/join"
              className="inline-block rounded-lg bg-white px-8 py-3 font-semibold text-indigo-600 shadow-lg hover:bg-indigo-50"
            >
              Get Started
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Site/Brand Card Component
 */
function SiteCard({ site }: { site: FeaturedSite }) {
  const href = site.primaryDomain ? `https://${site.primaryDomain}` : '#';
  const brandColor = site.brand?.primaryColor || '#6366f1';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-lg"
    >
      {/* Brand Header */}
      <div
        className="flex items-center gap-4 p-6"
        style={{ borderBottom: `3px solid ${brandColor}` }}
      >
        {site.brand?.logoUrl ? (
          <img
            src={site.brand.logoUrl}
            alt={site.name}
            className="h-12 w-12 rounded-lg object-contain"
          />
        ) : (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-lg text-xl font-bold text-white"
            style={{ backgroundColor: brandColor }}
          >
            {site.name.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 truncate">
            {site.name}
          </h3>
          {site.brand?.tagline && (
            <p className="text-sm text-gray-500 truncate">{site.brand.tagline}</p>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="flex-1 p-6 pt-4">
        {site.description && (
          <p className="line-clamp-2 text-sm text-gray-600">{site.description}</p>
        )}
        {site.primaryDomain && (
          <p className="mt-3 text-xs text-indigo-600 group-hover:underline">
            {site.primaryDomain}
          </p>
        )}
      </div>
    </a>
  );
}

/**
 * Supplier Card Component
 */
function SupplierCard({ supplier }: { supplier: FeaturedSupplier }) {
  const href = supplier.micrositeUrl || `/providers/${supplier.slug}`;

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-lg"
    >
      {/* Image */}
      <div className="relative aspect-video overflow-hidden bg-gray-100">
        {supplier.heroImageUrl ? (
          <img
            src={supplier.heroImageUrl}
            alt={supplier.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-100 to-purple-100">
            {supplier.logoUrl ? (
              <img
                src={supplier.logoUrl}
                alt={supplier.name}
                className="h-16 w-16 rounded-full object-contain"
              />
            ) : (
              <span className="text-4xl font-bold text-indigo-300">{supplier.name.charAt(0)}</span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600">{supplier.name}</h3>

        {/* Rating */}
        {supplier.rating && supplier.rating > 0 && (
          <div className="mt-1 flex items-center gap-1">
            <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{supplier.rating.toFixed(1)}</span>
            <span className="text-sm text-gray-500">
              ({supplier.reviewCount.toLocaleString()} reviews)
            </span>
          </div>
        )}

        {/* Description */}
        {supplier.description && (
          <p className="mt-2 line-clamp-2 text-sm text-gray-600">{supplier.description}</p>
        )}

        {/* Meta */}
        <div className="mt-auto flex flex-wrap gap-2 pt-3">
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
            {supplier.productCount} experience{supplier.productCount !== 1 ? 's' : ''}
          </span>
          {supplier.cities.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
              {supplier.cities[0]}
              {supplier.cities.length > 1 && ` +${supplier.cities.length - 1}`}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * Get emoji for a city (simple mapping for common destinations)
 */
function getCityEmoji(city: string): string {
  const cityEmojis: Record<string, string> = {
    London: '\u{1F1EC}\u{1F1E7}',
    Paris: '\u{1F1EB}\u{1F1F7}',
    Barcelona: '\u{1F1EA}\u{1F1F8}',
    Rome: '\u{1F1EE}\u{1F1F9}',
    Amsterdam: '\u{1F1F3}\u{1F1F1}',
    Berlin: '\u{1F1E9}\u{1F1EA}',
    Madrid: '\u{1F1EA}\u{1F1F8}',
    Lisbon: '\u{1F1F5}\u{1F1F9}',
    Prague: '\u{1F1E8}\u{1F1FF}',
    Vienna: '\u{1F1E6}\u{1F1F9}',
    Athens: '\u{1F1EC}\u{1F1F7}',
    Dublin: '\u{1F1EE}\u{1F1EA}',
    Edinburgh: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
    'New York': '\u{1F1FA}\u{1F1F8}',
    'Los Angeles': '\u{1F1FA}\u{1F1F8}',
    'San Francisco': '\u{1F1FA}\u{1F1F8}',
    Tokyo: '\u{1F1EF}\u{1F1F5}',
    Sydney: '\u{1F1E6}\u{1F1FA}',
    Dubai: '\u{1F1E6}\u{1F1EA}',
    Singapore: '\u{1F1F8}\u{1F1EC}',
    'Hong Kong': '\u{1F1ED}\u{1F1F0}',
    Bangkok: '\u{1F1F9}\u{1F1ED}',
  };

  return cityEmojis[city] || '\u{1F4CD}';
}
