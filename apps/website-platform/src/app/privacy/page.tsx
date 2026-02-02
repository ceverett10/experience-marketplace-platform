import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { StaticPageTemplate } from '@/components/content/StaticPageTemplate';

/**
 * Fetch Privacy Policy page from database
 */
async function getPrivacyPage(siteId: string) {
  return await prisma.page.findFirst({
    where: {
      siteId,
      slug: 'privacy',
      type: 'LEGAL',
    },
    include: {
      content: true,
    },
  });
}

/**
 * Generate SEO metadata for Privacy Policy page
 */
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const page = await getPrivacyPage(site.id);

  const title = page?.metaTitle || page?.title || 'Privacy Policy';
  const description =
    page?.metaDescription || `Privacy Policy for ${site.name}. Learn how we collect, use, and protect your personal information.`;

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
 * Privacy Policy page
 */
export default async function PrivacyPage() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const page = await getPrivacyPage(site.id);

  // Default privacy policy content
  const defaultContent = `# Privacy Policy

**Effective Date:** ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}

${site.name} ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website.

## Information We Collect

### Personal Information
When you make a booking or create an account, we may collect:
- Name and contact details (email address, phone number)
- Billing and payment information
- Travel preferences and booking history

### Automatically Collected Information
When you visit our website, we automatically collect certain information:
- Device and browser information
- IP address and location data
- Pages visited and time spent on site
- Referral sources

## How We Use Your Information

We use the information we collect to:
- Process and manage your bookings
- Communicate with you about your reservations
- Improve our website and services
- Send promotional communications (with your consent)
- Comply with legal obligations

## Information Sharing

We may share your information with:
- Experience providers and tour operators to fulfil your bookings
- Payment processors to handle transactions
- Service providers who assist our operations
- Legal authorities when required by law

## Your Rights Under UK Law

Under the UK General Data Protection Regulation (UK GDPR), you have the right to:
- Access your personal data
- Rectify inaccurate data
- Erase your data (right to be forgotten)
- Restrict processing
- Data portability
- Object to processing

## Data Security

We implement appropriate technical and organisational measures to protect your personal information against unauthorised access, alteration, disclosure, or destruction.

## Cookies

Our website uses cookies to enhance your experience. You can control cookie settings through your browser preferences.

## Contact Us

If you have questions about this Privacy Policy or wish to exercise your data protection rights, please contact us.

## Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.

---

*This policy is governed by the laws of England and Wales.*`;

  // If no page exists, create a default structure for display
  const displayPage = page || {
    id: 'default',
    title: 'Privacy Policy',
    metaDescription: `Privacy Policy for ${site.name}`,
    content: {
      id: 'default',
      body: defaultContent,
      bodyFormat: 'MARKDOWN',
      isAiGenerated: false,
      qualityScore: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Generate JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
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
        name: 'Privacy Policy',
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
            <span className="text-gray-900">Privacy Policy</span>
          </nav>
        </div>
      </div>

      {/* Page Content */}
      <StaticPageTemplate page={displayPage} siteName={site.name} pageType="legal" />
    </>
  );
}

// Dynamic rendering
export const dynamic = 'force-dynamic';
