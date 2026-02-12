import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { isParentDomain } from '@/lib/parent-domain';
import {
  getFeaturedSuppliers,
  getSupplierCategories,
  getSupplierCities,
  type FeaturedSupplier,
} from '@/lib/parent-domain';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Fetch suppliers filtered by city or category
 */
async function getFilteredSuppliers(
  city?: string,
  category?: string
): Promise<FeaturedSupplier[]> {
  const where: Record<string, unknown> = {
    productCount: { gt: 0 },
  };

  if (city) {
    where['cities'] = { has: city };
  }
  if (category) {
    where['categories'] = { has: category };
  }

  const suppliers = await prisma.supplier.findMany({
    where,
    orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }, { productCount: 'desc' }],
    take: 50,
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      productCount: true,
      cities: true,
      categories: true,
      rating: true,
      reviewCount: true,
      logoUrl: true,
      heroImageUrl: true,
      microsite: {
        select: {
          fullDomain: true,
          status: true,
        },
      },
      // Fallback: grab the top-rated product's image if supplier has no hero
      products: {
        where: { primaryImageUrl: { not: null } },
        orderBy: { rating: 'desc' },
        take: 1,
        select: { primaryImageUrl: true },
      },
    },
  });

  return suppliers.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    productCount: s.productCount,
    cities: s.cities,
    categories: s.categories,
    rating: s.rating,
    reviewCount: s.reviewCount,
    logoUrl: null,
    heroImageUrl: s.heroImageUrl || s.products[0]?.primaryImageUrl || null,
    micrositeUrl: s.microsite?.status === 'ACTIVE' ? `https://${s.microsite.fullDomain}` : null,
  }));
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; category?: string }>;
}): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const params = await searchParams;

  let title = 'Experience Providers';
  if (params.city) {
    title = `Experience Providers in ${params.city}`;
  } else if (params.category) {
    title = `${params.category} Providers`;
  }

  return {
    title: `${title} | Experiencess`,
    description: params.city
      ? `Discover top-rated tour operators and activity providers in ${params.city}.`
      : params.category
        ? `Browse ${params.category} experience providers across our network.`
        : 'Browse all experience providers in the Experiencess network.',
    alternates: {
      canonical: `https://${hostname}/providers`,
    },
  };
}

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; category?: string }>;
}) {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';

  // Only parent domain has providers page
  if (!isParentDomain(hostname)) {
    redirect('/');
  }

  const params = await searchParams;
  const city = params.city;
  const category = params.category;

  const [suppliers, allCategories, allCities] = await Promise.all([
    city || category ? getFilteredSuppliers(city, category) : getFeaturedSuppliers(50),
    getSupplierCategories(),
    getSupplierCities(24),
  ]);

  // Page heading
  let heading = 'All Experience Providers';
  let subtitle = 'Browse top-rated tour operators and activity providers across our network';
  if (city) {
    heading = `Experience Providers in ${city}`;
    subtitle = `Discover tours, activities and experiences in ${city}`;
  } else if (category) {
    heading = `${category} Providers`;
    subtitle = `Browse ${category.toLowerCase()} experience providers`;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 py-16">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            {heading}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-indigo-100">{subtitle}</p>
          {(city || category) && (
            <Link
              href="/providers"
              className="mt-6 inline-block rounded-lg border-2 border-white px-6 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              View All Providers
            </Link>
          )}
        </div>
      </section>

      {/* Filter Bar */}
      <section className="border-b bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Filter:</span>
            {/* City filters */}
            {allCities.slice(0, 12).map((c) => (
              <Link
                key={c.slug}
                href={`/providers?city=${encodeURIComponent(c.name)}`}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  city === c.name
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-indigo-50 hover:text-indigo-700'
                }`}
              >
                {c.name}
              </Link>
            ))}
          </div>
          {allCategories.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Category:</span>
              {allCategories.slice(0, 8).map((cat) => (
                <Link
                  key={cat.slug}
                  href={`/providers?category=${encodeURIComponent(cat.name)}`}
                  className={`rounded-full px-3 py-1 text-sm transition-colors ${
                    category === cat.name
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-indigo-50 hover:text-indigo-700'
                  }`}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="mb-8 text-sm text-gray-500">
            {suppliers.length} provider{suppliers.length !== 1 ? 's' : ''} found
          </p>

          {suppliers.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {suppliers.map((supplier) => (
                <SupplierCard key={supplier.id} supplier={supplier} />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <p className="text-lg text-gray-500">
                No providers found{city ? ` in ${city}` : category ? ` for ${category}` : ''}.
              </p>
              <Link
                href="/providers"
                className="mt-4 inline-block text-indigo-600 hover:text-indigo-800"
              >
                Browse all providers
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
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
 * Supplier Card
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
            <span className="text-4xl font-bold text-indigo-300">{supplier.name.charAt(0)}</span>
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
