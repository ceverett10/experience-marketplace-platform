import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { StaticPageTemplate } from '@/components/content/StaticPageTemplate';

/**
 * Fetch Terms of Service page from database
 */
async function getTermsPage(siteId: string) {
  return await prisma.page.findFirst({
    where: {
      siteId,
      slug: 'terms',
      type: 'LEGAL',
    },
    include: {
      content: true,
    },
  });
}

/**
 * Generate SEO metadata for Terms of Service page
 */
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const page = await getTermsPage(site.id);

  const title = page?.metaTitle || page?.title || 'Terms of Service';
  const description =
    page?.metaDescription ||
    `Terms of Service for ${site.name}. Please read these terms carefully before using our services.`;

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
 * Terms of Service page
 */
export default async function TermsPage() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const page = await getTermsPage(site.id);

  // Default terms of service content
  const defaultContent = `# Terms of Service

**Effective Date:** ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}

Welcome to ${site.name}. By accessing or using our website and services, you agree to be bound by these Terms of Service.

## 1. Acceptance of Terms

By using ${site.name}, you confirm that you are at least 18 years old and have the legal capacity to enter into binding agreements. If you are booking on behalf of others, you confirm you have their authority to do so.

## 2. Our Services

${site.name} is a platform that connects travellers with experience providers. We act as an intermediary to facilitate bookings but are not the direct provider of the experiences.

### 2.1 Booking Process
- All bookings are subject to availability
- Prices are displayed in the currency indicated at the time of booking
- Confirmation is sent upon successful payment

### 2.2 Experience Providers
The experiences listed on our platform are provided by third-party operators. While we take care to work with reputable providers, we cannot guarantee every aspect of third-party services.

## 3. Pricing and Payment

- All prices include applicable taxes unless otherwise stated
- Payment is processed securely through our payment providers
- You will receive a confirmation email with your booking details

## 4. Cancellation and Refunds

### 4.1 Your Cancellation Rights
Cancellation policies vary by experience. Please review the specific cancellation policy before booking. Under UK consumer law, you may have additional cancellation rights for certain bookings.

### 4.2 Our Cancellation Rights
We or the experience provider may cancel a booking if:
- The experience becomes unavailable due to circumstances beyond our control
- Safety concerns arise
- Minimum participant numbers are not met

In such cases, you will receive a full refund or the option to rebook.

## 5. Your Responsibilities

When using our services, you agree to:
- Provide accurate and complete booking information
- Arrive on time for your booked experiences
- Follow all safety instructions provided by experience operators
- Behave respectfully towards guides, staff, and other participants

## 6. Limitation of Liability

To the extent permitted by UK law:
- We are not liable for the acts or omissions of third-party experience providers
- Our liability for any claim is limited to the amount you paid for the booking
- We are not liable for indirect, consequential, or special damages

Nothing in these terms excludes or limits our liability for death or personal injury caused by our negligence, fraud, or any other liability that cannot be excluded by law.

## 7. Intellectual Property

All content on ${site.name}, including text, images, logos, and software, is protected by intellectual property rights. You may not use our content without our express permission.

## 8. Privacy

Your use of our services is also governed by our Privacy Policy. Please review it to understand how we collect and use your information.

## 9. Dispute Resolution

We aim to resolve any disputes amicably. If you have a complaint, please contact us first. If we cannot resolve the matter, disputes will be subject to the exclusive jurisdiction of the courts of England and Wales.

## 10. Changes to These Terms

We may update these Terms of Service from time to time. Continued use of our services after changes constitutes acceptance of the new terms.

## 11. Governing Law

These Terms of Service are governed by the laws of England and Wales.

## 12. Contact Us

If you have any questions about these Terms of Service, please contact us.

---

*${site.name} is committed to fair dealing and compliance with UK consumer protection laws, including the Consumer Rights Act 2015.*`;

  // If no page exists, create a default structure for display
  const displayPage = page || {
    id: 'default',
    title: 'Terms of Service',
    metaDescription: `Terms of Service for ${site.name}`,
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
        name: 'Terms of Service',
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
            <span className="text-gray-900">Terms of Service</span>
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
