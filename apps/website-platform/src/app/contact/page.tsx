import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { StaticPageTemplate } from '@/components/content/StaticPageTemplate';

/**
 * Fetch Contact page from database
 */
async function getContactPage(siteId: string) {
  return await prisma.page.findFirst({
    where: {
      siteId,
      slug: 'contact',
      type: 'CONTACT',
    },
    include: {
      content: true,
    },
  });
}

/**
 * Generate SEO metadata for Contact page
 */
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const page = await getContactPage(site.id);

  const title = page?.metaTitle || page?.title || 'Contact Us';
  const description =
    page?.metaDescription || `Get in touch with ${site.name}. We're here to help with your travel experience questions.`;

  return {
    title: `${title} | ${site.name}`,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    robots: {
      index: page ? !page.noIndex : true,
      follow: page ? !page.noIndex : true,
    },
  };
}

/**
 * Contact page
 */
export default async function ContactPage() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const page = await getContactPage(site.id);

  // If no page exists, create a default structure for display
  const displayPage = page || {
    id: 'default',
    title: 'Contact Us',
    metaDescription: `Get in touch with ${site.name}`,
    content: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Generate JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
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
        name: 'Contact Us',
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
            <span className="text-gray-900">Contact Us</span>
          </nav>
        </div>
      </div>

      {/* Page Content */}
      <StaticPageTemplate page={displayPage} siteName={site.name} pageType="contact" />
    </>
  );
}

// Dynamic rendering
export const dynamic = 'force-dynamic';
