import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { isParentDomain } from '@/lib/parent-domain';
import { getPlatformStats } from '@/lib/parent-domain';
import { prisma } from '@/lib/prisma';
import { StaticPageTemplate } from '@/components/content/StaticPageTemplate';

/**
 * Fetch About page from database
 */
async function getAboutPage(siteId: string) {
  return await prisma.page.findFirst({
    where: {
      siteId,
      slug: 'about',
      type: 'ABOUT',
    },
    include: {
      content: true,
    },
  });
}

/**
 * Generate SEO metadata for About page
 */
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';

  if (isParentDomain(hostname)) {
    return {
      title: 'About Us | Experiencess',
      description:
        'Experiencess is a network of experience brands powered through a partnership with Holibob, helping people discover and book incredible experiences worldwide.',
      openGraph: {
        title: 'About Us | Experiencess',
        description: 'A network of experience brands powered through a partnership with Holibob.',
        type: 'website',
      },
      alternates: {
        canonical: `https://${hostname}/about`,
      },
    };
  }

  const site = await getSiteFromHostname(hostname);
  const page = await getAboutPage(site.id);

  const title = page?.metaTitle || page?.title || 'About Us';
  const description =
    page?.metaDescription ||
    `Learn more about ${site.name} and our mission to connect travellers with unforgettable experiences.`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | ${site.name}`,
      description,
      type: 'website',
    },
    alternates: {
      canonical: `https://${site.primaryDomain || hostname}/about`,
    },
    robots: {
      index: page ? !page.noIndex : true,
      follow: page ? !page.noIndex : true,
    },
  };
}

/**
 * About page
 */
export default async function AboutPage() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';

  // Parent domain gets bespoke About content
  if (isParentDomain(hostname)) {
    const stats = await getPlatformStats();
    return <ParentDomainAbout stats={stats} />;
  }

  const site = await getSiteFromHostname(hostname);

  const page = await getAboutPage(site.id);

  // If no page exists, create a default structure for display
  const displayPage = page || {
    id: 'default',
    title: 'About Us',
    metaDescription: `Learn more about ${site.name}`,
    content: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Generate JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: displayPage.title,
    description: displayPage.metaDescription,
    publisher: {
      '@type': 'Organization',
      name: site.name,
    },
  };

  // BreadcrumbList structured data
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `https://${site.primaryDomain || hostname}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'About Us',
      },
    ],
  };

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* Breadcrumb */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <a href="/" className="hover:text-gray-700">
              Home
            </a>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-gray-900">About Us</span>
          </nav>
        </div>
      </div>

      {/* Page Content */}
      <StaticPageTemplate page={displayPage} siteName={site.name} pageType="about" />
    </>
  );
}

/**
 * Parent domain About page component
 */
function ParentDomainAbout({
  stats,
}: {
  stats: {
    totalSuppliers: number;
    totalProducts: number;
    totalCities: number;
    totalCategories: number;
    activeMicrosites: number;
  };
}) {
  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'AboutPage',
            name: 'About Experiencess',
            description:
              'Experiencess is a network of experience brands powered through a partnership with Holibob.',
            publisher: {
              '@type': 'Organization',
              name: 'Experiencess',
            },
          }),
        }}
      />

      {/* Breadcrumb */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <a href="/" className="hover:text-gray-700">
              Home
            </a>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-gray-900">About Us</span>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 py-16">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            About Experiencess
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-indigo-100">
            A network of experience brands helping people discover and book incredible experiences
            around the world.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4">
          <div className="max-w-none text-gray-700 [&>h2]:mt-8 [&>h2]:mb-4 [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:text-gray-900 [&>p]:mb-4 [&>p]:leading-7">
            <h2>Our Mission</h2>
            <p>
              Experiencess brings together a curated network of specialist experience brands, each
              focused on helping travellers find the perfect tours, activities and experiences for
              their next adventure. Whether you are looking for food tours in a vibrant city,
              adventure activities in the great outdoors, or cultural experiences that bring history
              to life, our brands have you covered.
            </p>

            <h2>Powered by Holibob</h2>
            <p>
              Our platform is powered through a partnership with <strong>Holibob</strong>, a leading
              technology company in the experiences industry. Holibob provides the infrastructure
              that connects travellers with thousands of experience providers worldwide, ensuring
              seamless booking, reliable availability, and outstanding customer support.
            </p>
            <p>
              Through this partnership, we are able to offer access to an extensive catalogue of{' '}
              {stats.totalProducts.toLocaleString()}+ tours and activities from{' '}
              {stats.totalSuppliers.toLocaleString()} experience providers across{' '}
              {stats.totalCities.toLocaleString()} destinations globally.
            </p>

            <h2>Our Network</h2>
            <p>
              Each brand in the Experiencess network is designed to serve a specific audience or
              destination, providing a tailored experience that goes beyond a generic marketplace.
              Our {stats.activeMicrosites.toLocaleString()} active microsites cover{' '}
              {stats.totalCategories.toLocaleString()} experience categories, making it easy for
              travellers to find exactly what they are looking for.
            </p>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 gap-8 sm:grid-cols-4">
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
                {stats.activeMicrosites.toLocaleString()}
              </div>
              <div className="mt-1 text-sm text-gray-600">Active Microsites</div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <Link
              href="/"
              className="inline-block rounded-lg bg-indigo-600 px-8 py-3 font-semibold text-white shadow-lg hover:bg-indigo-700"
            >
              Explore Our Network
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// Dynamic rendering
export const dynamic = 'force-dynamic';
