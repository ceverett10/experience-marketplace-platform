import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { cleanPlainText, generateFaqJsonLd } from '@/lib/seo';
import { FAQPageTemplate } from '@/components/content/FAQPageTemplate';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Fetch FAQ page from database
 * Note: FAQ pages are stored with 'faq/' prefix in slug (e.g., 'faq/booking-questions')
 * The URL /faq/booking-questions maps to slug 'faq/booking-questions' in the database
 */
async function getFAQPage(siteId: string, slug: string) {
  // Slugs are stored with 'faq/' prefix, so prepend it for the query
  const fullSlug = `faq/${slug}`;

  return await prisma.page.findUnique({
    where: {
      siteId_slug: {
        siteId,
        slug: fullSlug,
      },
      type: 'FAQ',
      status: 'PUBLISHED',
    },
    include: {
      content: true,
    },
  });
}

/**
 * Extract FAQ Q&A pairs from markdown content
 * Looks for H3 headings (questions) followed by content (answers)
 */
function extractFAQsFromMarkdown(content: string): { question: string; answer: string }[] {
  const faqs: { question: string; answer: string }[] = [];
  const lines = content.split('\n');

  let currentQuestion = '';
  let currentAnswer: string[] = [];

  for (const line of lines) {
    // Check for H3 heading (question)
    const h3Match = line.match(/^###\s+(.+)/);

    if (h3Match) {
      // Save previous Q&A if exists
      if (currentQuestion && currentAnswer.length > 0) {
        faqs.push({
          question: currentQuestion,
          answer: currentAnswer.join('\n').trim(),
        });
      }

      currentQuestion = h3Match[1] ? h3Match[1].replace(/\?$/, '') + '?' : '';
      currentAnswer = [];
    } else if (currentQuestion) {
      // Skip other headings
      if (line.match(/^#{1,2}\s/)) continue;
      currentAnswer.push(line);
    }
  }

  // Don't forget the last Q&A
  if (currentQuestion && currentAnswer.length > 0) {
    faqs.push({
      question: currentQuestion,
      answer: currentAnswer.join('\n').trim(),
    });
  }

  return faqs;
}

/**
 * Generate SEO metadata for FAQ page
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const page = await getFAQPage(site.id, slug);

  if (!page) {
    return {
      title: 'FAQ Not Found',
    };
  }

  const title = page.metaTitle || page.title;
  const rawDescription = page.metaDescription || page.content?.body.substring(0, 160);
  const description = rawDescription ? cleanPlainText(rawDescription) : undefined;

  // Generate canonical URL - use custom if set, otherwise default to page URL
  const canonicalUrl = page.canonicalUrl || `https://${site.primaryDomain || hostname}/faq/${slug}`;

  // OG image fallback chain
  const ogImage = site.brand?.ogImageUrl || site.homepageConfig?.hero?.backgroundImage;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | ${site.name}`,
      description: description || undefined,
      type: 'article',
      publishedTime: page.createdAt.toISOString(),
      modifiedTime: page.updatedAt.toISOString(),
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: !page.noIndex,
      follow: !page.noIndex,
    },
  };
}

/**
 * FAQ detail page
 */
export default async function FAQDetailPage({ params }: Props) {
  const { slug } = await params;
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const page = await getFAQPage(site.id, slug);

  if (!page) {
    notFound();
  }

  // Extract FAQs from content for structured data
  const faqs = extractFAQsFromMarkdown(page.content?.body || '');

  // Generate FAQPage JSON-LD if we have Q&A pairs
  const faqJsonLd = faqs.length > 0 ? generateFaqJsonLd(faqs) : null;

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
        name: 'FAQ',
        item: `https://${site.primaryDomain || hostname}/faq`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: page.title,
      },
    ],
  };

  return (
    <>
      {/* JSON-LD Structured Data - FAQPage */}
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      {/* JSON-LD Structured Data - Breadcrumbs */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* Breadcrumb */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-700">
              Home
            </Link>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
            <Link href="/faq" className="hover:text-gray-700">
              FAQ
            </Link>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-gray-900">{page.title}</span>
          </nav>
        </div>
      </div>

      {/* FAQ Content */}
      <FAQPageTemplate page={page} siteName={site.name} faqs={faqs} />
    </>
  );
}

// Dynamic rendering - pages generated on-demand
export const dynamic = 'force-dynamic';
