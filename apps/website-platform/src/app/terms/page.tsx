import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { StaticPageTemplate } from '@/components/content/StaticPageTemplate';

/**
 * Standard Holibob Terms of Service - used across ALL sites and microsites.
 * This is a legal requirement and must NOT be replaced by AI-generated content.
 * All Sites in the Holibob Network are subject to these same Terms of Service.
 */
const HOLIBOB_TERMS_OF_SERVICE = `# Terms of Service
## Holibob Platform Network
*Last updated: 10 February 2026*

**Effective Date:** 10 February 2026

Welcome to this website (the "Site"). This Site is part of the Holibob platform network – a collection of branded travel and experience booking websites (collectively, the "Holibob Network") that are owned, operated, and managed by Holibob Ltd ("Holibob", "we", "us", or "our"), a company registered in England and Wales.

Although the Site may operate under its own distinct brand name, all Sites within the Holibob Network are powered by the Holibob platform and are subject to these same Terms of Service.

By accessing or using this Site and our services, you agree to be bound by these Terms of Service.

## 1. Acceptance of Terms

By using any Site within the Holibob Network, you confirm that you are at least 18 years old and have the legal capacity to enter into binding agreements. If you are booking on behalf of others, you confirm you have their authority to do so.

These Terms of Service apply uniformly across all Sites in the Holibob Network, regardless of the brand name under which the Site operates. Your use of any Site within the network constitutes acceptance of these terms.

## 2. About the Holibob Network

Holibob Ltd operates a network of branded travel and experience booking websites. While each Site may carry a distinct brand identity, all Sites are:

- Owned and operated by Holibob Ltd
- Powered by the Holibob technology platform
- Subject to the same terms, policies, and service standards
- Managed and supported by the Holibob team

Your contractual relationship for any booking made through a Site in the Holibob Network is with Holibob Ltd, regardless of the brand name displayed on the Site.

## 3. Our Services

Each Site within the Holibob Network is a platform that connects travellers with experience providers. We act as an intermediary to facilitate bookings but are not the direct provider of the experiences.

### 3.1 Booking Process

- All bookings are subject to availability
- Prices are displayed in the currency indicated at the time of booking
- Confirmation is sent upon successful payment
- You will receive a confirmation email with your booking details

### 3.2 Experience Providers

The experiences listed on our platform are provided by third-party operators. While we take care to work with reputable providers, we cannot guarantee every aspect of third-party services.

## 4. Pricing and Payment

- All prices include applicable taxes unless otherwise stated
- Payment is processed securely through our payment providers
- Full payment is required at the time of booking unless otherwise specified
- Currency conversions, where applicable, are indicative and may vary

## 5. Cancellation and Refunds

### 5.1 Your Cancellation Rights

Cancellation policies vary by experience. Please review the specific cancellation policy displayed at the time of booking. Under UK consumer law, you may have additional cancellation rights for certain bookings.

### 5.2 Our Cancellation Rights

We or the experience provider may cancel a booking if:

- The experience becomes unavailable due to circumstances beyond our control
- Safety concerns arise
- Minimum participant numbers are not met

In such cases, you will receive a full refund or the option to rebook.

## 6. Your Responsibilities

When using our services, you agree to:

- Provide accurate and complete booking information
- Arrive on time for your booked experiences
- Follow all safety instructions provided by experience operators
- Behave respectfully towards guides, staff, and other participants
- Ensure you meet any health, fitness, or age requirements for your chosen experience

## 7. Limitation of Liability

To the extent permitted by UK law:

- We are not liable for the acts or omissions of third-party experience providers
- Our liability for any claim is limited to the amount you paid for the booking
- We are not liable for indirect, consequential, or special damages

Nothing in these terms excludes or limits our liability for death or personal injury caused by our negligence, fraud, or any other liability that cannot be excluded by law.

## 8. Intellectual Property

All content on this Site, including text, graphics, logos, images, and software, is the property of Holibob Ltd or its licensors and is protected by copyright and other intellectual property laws. You may not reproduce, distribute, or otherwise use our content without our express written permission.

## 9. Privacy

Your use of our services is also governed by our [Privacy Policy](/privacy). Please review it to understand how we collect, use, and protect your personal information. Holibob Ltd is the data controller for all Sites within the Holibob Network.

## 10. Dispute Resolution

We aim to resolve any disputes amicably. If you have a complaint, please contact us first at info@holibob.tech. If we cannot resolve the matter, disputes will be subject to the exclusive jurisdiction of the courts of England and Wales.

## 11. Changes to These Terms

We may update these Terms of Service from time to time. Any changes will be posted on this page with an updated "Last updated" date. Continued use of our services after changes constitutes acceptance of the new terms.

## 12. Governing Law

These Terms of Service are governed by the laws of England and Wales.

## 13. Contact Us

If you have any questions about these Terms of Service, please contact us at info@holibob.tech.

---

*Holibob Ltd is committed to fair dealing and compliance with UK consumer protection laws, including the Consumer Rights Act 2015.*`;

/**
 * Generate SEO metadata for Terms of Service page
 */
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const title = 'Terms of Service';
  const description =
    'Terms of Service for the Holibob Platform Network. Please read these terms carefully before using our services.';

  return {
    title: `${title} | ${site.name}`,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    alternates: {
      canonical: `https://${site.primaryDomain || hostname}/terms`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

/**
 * Terms of Service page
 * Always renders the standard Holibob Platform Network terms of service.
 * This is NOT fetched from the database to ensure legal consistency
 * across all sites and prevent AI-generated content from overwriting it.
 */
export default async function TermsPage() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  // Always use the standard Holibob terms of service
  const displayPage = {
    id: 'terms-of-service',
    title: 'Terms of Service',
    metaDescription: 'Terms of Service for the Holibob Platform Network.',
    content: {
      id: 'terms-of-service-content',
      body: HOLIBOB_TERMS_OF_SERVICE,
      bodyFormat: 'MARKDOWN' as const,
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
      name: 'Holibob Limited',
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
