import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { StaticPageTemplate } from '@/components/content/StaticPageTemplate';

/**
 * Standard Holibob Privacy Policy - used across ALL sites and microsites.
 * This is a legal requirement and must NOT be replaced by AI-generated content.
 * Holibob Limited is the data controller for all platform sites.
 */
const HOLIBOB_PRIVACY_POLICY = `# Privacy Policy

## Introduction

Welcome to Holibob Limited, where your personal data protection is of paramount importance to us. This Privacy Policy aims to provide transparency regarding how we process your data within our business operations and digital platforms.

## Data Controller

**Holibob Limited**
C/O Johnston Carmichael,
7-11 Melville Street,
Edinburgh, Scotland, EH3 7PE

Company Number: SC631937
Email: info@holibob.tech

## Data Processing Principles

- **Legality:** Ensuring data is processed lawfully, fairly, and transparently.
- **Purpose Limitation:** Utilising data for defined, explicit, and legitimate purposes.
- **Data Minimisation:** Processing only the data necessary for relevant purposes.
- **Accuracy:** Maintaining accurate and current data.
- **Storage Limitation:** Retaining data only for the necessary duration.
- **Integrity and Confidentiality:** Ensuring data security and confidential processing.

## Data Collected

During our business development activities, we may collect and store the following data:

- Email address
- Company name
- Position within the company
- Name

## Purpose of Processing

We utilise your data for:

- Conducting business development activities
- Distributing newsletters or promotional materials (with explicit consent)
- Enhancing our services and online platform
- Legal compliance

## Legal Basis

Data processing is aligned with GDPR Article 6(1):

- (a) Consent
- (b) Contract performance or pre-contractual activities
- (c) Compliance with legal obligations
- (f) Pursuit of legitimate interests

## Data Subject Rights

You retain the right to:

- Request access, rectification, or erasure of your personal data.
- Restrict or object to data processing and request data portability.
- Withdraw your consent at any point.
- Lodge a complaint with a supervisory authority.

## Data Protection

We utilise appropriate technical and organisational measures to protect your data from unauthorized access.

## Changes to the Privacy Policy

We may amend this policy to ensure alignment with legal requisites.

## Contact

For queries or concerns regarding your data protection, please contact us at info@holibob.tech`;

/**
 * Generate SEO metadata for Privacy Policy page
 */
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const title = 'Privacy Policy';
  const description =
    'Privacy Policy for Holibob Limited. Learn how we collect, use, and protect your personal data.';

  return {
    title: `${title} | ${site.name}`,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    alternates: {
      canonical: `https://${site.primaryDomain || hostname}/privacy`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

/**
 * Privacy Policy page
 * Always renders the standard Holibob Limited privacy policy.
 * This is NOT fetched from the database to ensure legal consistency
 * across all sites and prevent AI-generated content from overwriting it.
 */
export default async function PrivacyPage() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  // Always use the standard Holibob privacy policy
  const displayPage = {
    id: 'privacy-policy',
    title: 'Privacy Policy',
    metaDescription: 'Privacy Policy for Holibob Limited.',
    content: {
      id: 'privacy-policy-content',
      body: HOLIBOB_PRIVACY_POLICY,
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
