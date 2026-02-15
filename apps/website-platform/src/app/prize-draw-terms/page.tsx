import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { StaticPageTemplate } from '@/components/content/StaticPageTemplate';

/**
 * Generate SEO metadata for Prize Draw Terms page
 */
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const title = 'Prize Draw Terms & Conditions';
  const description = `Official terms and conditions for the Holibob prize draw competition. Win £1,000 of experiences.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    alternates: {
      canonical: `https://${site.primaryDomain || hostname}/prize-draw-terms`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

/**
 * Prize Draw Terms & Conditions page
 * Static content - Holibob Limited is the promoter for all platform sites
 */
export default async function PrizeDrawTermsPage() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const content = `# Holibob Prize Draw Terms & Conditions

**Effective Date:** ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}

## 1. The Promoter

This prize draw is operated by **Holibob Limited**, a company registered in Scotland with company number SC631937, whose registered office is at 20 Braid Mount, Edinburgh, Scotland EH10 6JJ (the "Promoter").

## 2. Eligibility

2.1. The prize draw is open to UK residents aged 18 years or over, except employees of the Promoter and their immediate family members, and anyone professionally connected with the prize draw.

2.2. Only one entry per person is permitted across all Holibob-powered websites. Multiple entries from the same person will be disqualified.

2.3. By entering the prize draw, you confirm that you are eligible to do so and that the information you provide is accurate.

## 3. How to Enter

3.1. Entry to the prize draw is free and no purchase is necessary.

3.2. To enter, submit your email address through the prize draw popup or entry form on any Holibob-powered website.

3.3. Entries must be received before the closing date specified on the entry form. Late entries will not be accepted.

## 4. The Prize

4.1. The winner will receive £1,000 (one thousand pounds) credit to spend on experiences through Holibob-powered platforms.

4.2. The prize credit is valid for 12 months from the date of the draw and must be used within this period. Any unused credit will expire.

4.3. The prize is non-transferable and there is no cash alternative.

4.4. The prize credit can be used on any experience available through Holibob-powered websites, subject to availability.

## 5. Winner Selection

5.1. The winner will be selected at random from all valid entries received before the closing date.

5.2. The draw will be conducted within 30 days of the closing date.

5.3. The winner will be notified by email within 7 days of the draw. If the winner does not respond to claim their prize within 14 days of notification, the Promoter reserves the right to select an alternative winner.

5.4. The Promoter's decision is final and no correspondence will be entered into.

## 6. Data Protection

6.1. **Holibob Limited** is the data controller for all personal data collected in connection with this prize draw.

6.2. Personal data collected will be used for the purpose of administering this prize draw, including contacting the winner.

6.3. If you opt in to marketing communications by ticking the optional checkbox, we will use your email address to send you exclusive offers, travel inspiration, and experience recommendations. You can withdraw this consent at any time by clicking the unsubscribe link in any marketing email.

6.4. Your entry to the prize draw and your marketing preferences are separate. Unsubscribing from marketing emails does not affect your entry in the prize draw.

6.5. For full details on how we handle your personal data, please see our [Privacy Policy](/privacy).

6.6. Under the UK General Data Protection Regulation (UK GDPR), you have rights including the right to access, rectify, erase, and port your data. To exercise these rights, please contact us.

## 7. General

7.1. The Promoter reserves the right to cancel or amend the prize draw and these terms and conditions without notice in the event of circumstances arising beyond its control.

7.2. Entry into the prize draw constitutes acceptance of these terms and conditions.

7.3. The Promoter's decision in respect of all matters to do with the prize draw will be final.

7.4. These terms and conditions are governed by the laws of Scotland, and any disputes will be subject to the exclusive jurisdiction of the Scottish courts.

## 8. Contact

For any queries regarding this prize draw, please contact us through the website's contact page.

---

*This prize draw is promoted by Holibob Limited, a company committed to connecting travellers with amazing experiences.*`;

  // Create display page structure
  const displayPage = {
    id: 'prize-draw-terms',
    title: 'Prize Draw Terms & Conditions',
    metaDescription: `Prize draw terms for ${site.name}`,
    content: {
      id: 'prize-draw-terms-content',
      body: content,
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
        name: 'Prize Draw Terms',
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
            <span className="text-gray-900">Prize Draw Terms</span>
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
