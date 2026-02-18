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
  const isMicrosite = !!site.micrositeContext;
  const hasCustomContent = page?.content?.body && page.content.body.trim().length > 0;

  const title = page?.metaTitle || page?.title || 'About Us';
  const description =
    page?.metaDescription ||
    (isMicrosite && !hasCustomContent
      ? `${site.name} is part of the Experiencess.com network. Discover and book verified travel experiences with secure payments and full customer protection.`
      : `Learn more about ${site.name} and our mission to connect travellers with unforgettable experiences.`);

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
  const isMicrosite = !!site.micrositeContext;
  const hasCustomContent = !!(page?.content as { body?: string })?.body?.trim();

  // Generate JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: page?.title || 'About Us',
    description: page?.metaDescription || `About ${site.name}`,
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

  // For microsites without custom content, show platform trust messaging
  if (isMicrosite && !hasCustomContent) {
    return (
      <>
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

        <MicrositeAbout siteName={site.name} />
      </>
    );
  }

  // If no page exists, create a default structure for display
  const displayPage = page || {
    id: 'default',
    title: 'About Us',
    metaDescription: `Learn more about ${site.name}`,
    content: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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

/**
 * Microsite About page - platform trust messaging
 * Shown for microsites without custom about page content
 */
function MicrositeAbout({ siteName }: { siteName: string }) {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-50 to-white py-16">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            About {siteName}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            Part of the Experiencess.com network — connecting travellers with unforgettable
            experiences.
          </p>
        </div>
      </section>

      {/* What is Experiencess.com? */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold text-gray-900">What is Experiencess.com?</h2>
          <p className="mt-4 leading-7 text-gray-700">
            Experiencess.com is a trusted network of specialist travel experience brands. Each brand
            in our network focuses on a specific destination, activity type, or travel niche —
            making it easy for you to find exactly the right experience for your next adventure.
          </p>
          <p className="mt-4 leading-7 text-gray-700">
            {siteName} is part of this network, providing curated experiences backed by the full
            support and protection of the Experiencess.com platform.
          </p>

          {/* Trust signals grid */}
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <svg
                  className="h-5 w-5 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Secure Payments</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                All payments are processed securely via Stripe, a PCI DSS Level 1 certified payment
                provider. Your financial information is never stored on our servers.
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                <svg
                  className="h-5 w-5 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Verified Operators</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Every experience provider in our network is vetted and verified. We partner only
                with established, reputable operators.
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <svg
                  className="h-5 w-5 text-amber-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Customer Protection</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Your booking is protected. Cancellation terms vary by experience — please review the
                cancellation policy before completing your booking.
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
                <svg
                  className="h-5 w-5 text-purple-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
                  />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Customer Support</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Our customer support team is here to help with any questions or issues before,
                during, or after your experience. Contact us at support@holibob.tech.
              </p>
            </div>
          </div>

          {/* Powered by Holibob */}
          <div className="mt-16">
            <h2 className="text-2xl font-bold text-gray-900">Powered by Holibob</h2>
            <p className="mt-4 leading-7 text-gray-700">
              Experiencess.com operates in partnership with{' '}
              <a
                href="https://holibob.tech"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-gray-900 hover:underline"
              >
                Holibob
              </a>
              , a leading technology company in the travel experiences industry. Holibob provides
              the booking technology, payment processing, and customer support infrastructure that
              powers every brand in our network.
            </p>
            <p className="mt-4 leading-7 text-gray-700">
              Holibob Ltd is registered in Scotland (SC631937) and connects travellers with
              experience providers worldwide. When you book through {siteName}, your booking is
              managed and protected by the Holibob platform. The charge on your bank statement will
              appear as <span className="font-semibold">&quot;HOLIBOB LTD UK&quot;</span>.
            </p>
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <Link
              href="/experiences"
              className="inline-block rounded-lg bg-gray-900 px-8 py-3 font-semibold text-white shadow-lg hover:bg-gray-800"
            >
              Browse Experiences
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// Dynamic rendering
export const dynamic = 'force-dynamic';
