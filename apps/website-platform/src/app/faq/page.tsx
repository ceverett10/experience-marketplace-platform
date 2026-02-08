import { headers } from 'next/headers';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';

interface SearchParams {
  page?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

// Revalidate every 5 minutes
export const revalidate = 300;

const FAQS_PER_PAGE = 12;

/**
 * Generate SEO metadata for FAQ listing page
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const resolvedParams = await searchParams;
  const currentPage = Math.max(1, parseInt(resolvedParams.page || '1', 10));
  const baseUrl = `https://${site.primaryDomain || hostname}/faq`;

  // For paginated content, include page in canonical (except page 1)
  const canonicalUrl = currentPage > 1 ? `${baseUrl}?page=${currentPage}` : baseUrl;

  // Get total pages for rel-next/prev
  const totalCount = await prisma.page.count({
    where: {
      siteId: site.id,
      type: 'FAQ',
      status: 'PUBLISHED',
    },
  });
  const totalPages = Math.ceil(totalCount / FAQS_PER_PAGE);

  return {
    title: `Frequently Asked Questions | ${site.name}`,
    description: `Find answers to common questions about ${site.name}. Browse our comprehensive FAQ section for helpful information about our experiences and services.`,
    openGraph: {
      title: `Frequently Asked Questions | ${site.name}`,
      description: `Find answers to common questions about ${site.name}.`,
      type: 'website',
    },
    alternates: {
      canonical: canonicalUrl,
    },
    // Add rel-next/prev for pagination (helps Google understand paginated content)
    other: {
      ...(currentPage > 1 && {
        'link-prev': currentPage === 2 ? baseUrl : `${baseUrl}?page=${currentPage - 1}`,
      }),
      ...(currentPage < totalPages && {
        'link-next': `${baseUrl}?page=${currentPage + 1}`,
      }),
    },
  };
}

/**
 * Fetch FAQ pages with pagination
 */
async function getFAQPages(siteId: string, page: number = 1) {
  const skip = (page - 1) * FAQS_PER_PAGE;

  const [faqs, totalCount] = await Promise.all([
    prisma.page.findMany({
      where: {
        siteId,
        type: 'FAQ',
        status: 'PUBLISHED',
      },
      include: {
        content: {
          select: {
            body: true,
            qualityScore: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: FAQS_PER_PAGE,
    }),
    prisma.page.count({
      where: {
        siteId,
        type: 'FAQ',
        status: 'PUBLISHED',
      },
    }),
  ]);

  return {
    faqs,
    totalCount,
    totalPages: Math.ceil(totalCount / FAQS_PER_PAGE),
    currentPage: page,
  };
}

/**
 * Generate excerpt from content body
 */
function generateExcerpt(body: string, maxLength: number = 160): string {
  // Strip markdown formatting
  const plainText = body
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  if (plainText.length <= maxLength) return plainText;
  return plainText.substring(0, maxLength).trim() + '...';
}

/**
 * FAQ listing page
 */
export default async function FAQPage({ searchParams }: Props) {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const resolvedParams = await searchParams;
  const currentPage = Math.max(1, parseInt(resolvedParams.page || '1', 10));

  const { faqs, totalCount, totalPages } = await getFAQPages(site.id, currentPage);

  // JSON-LD structured data for FAQ listing
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${site.name} FAQ`,
    description: `Frequently asked questions about ${site.name}`,
    url: `https://${site.primaryDomain || hostname}/faq`,
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
        name: 'FAQ',
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

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-teal-900 via-teal-800 to-teal-900 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Frequently Asked Questions
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-teal-200 sm:text-xl">
              Find answers to common questions about our experiences, booking process, and services
            </p>
          </div>
        </div>
      </section>

      {/* Breadcrumb */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3">
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
            <span className="text-gray-900">FAQ</span>
          </nav>
        </div>
      </div>

      {/* FAQ List */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {faqs.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto h-24 w-24 rounded-full bg-teal-100 flex items-center justify-center mb-6">
                <svg
                  className="h-12 w-12 text-teal-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No FAQ Articles Yet</h2>
              <p className="text-gray-600 max-w-md mx-auto">
                We&apos;re working on creating helpful FAQ content. Check back soon for answers to
                common questions!
              </p>
              <Link
                href="/experiences"
                className="mt-6 inline-flex items-center px-6 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
              >
                Browse Experiences
              </Link>
            </div>
          ) : (
            <>
              {/* Results Count */}
              <div className="mb-8">
                <p className="text-gray-600">
                  {totalCount} FAQ {totalCount === 1 ? 'article' : 'articles'} available
                </p>
              </div>

              {/* FAQ Grid */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {faqs.map((faq) => (
                  <article
                    key={faq.id}
                    className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-md transition-all hover:shadow-xl border border-gray-100"
                  >
                    {/* Icon Header */}
                    <div className="h-24 bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
                      <svg
                        className="h-12 w-12 text-white/70"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                        />
                      </svg>
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col p-6">
                      {/* Title */}
                      <h2 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-teal-600 transition-colors line-clamp-2">
                        <Link href={`/${faq.slug}`}>{faq.title}</Link>
                      </h2>

                      {/* Excerpt */}
                      <p className="text-gray-600 text-sm mb-4 line-clamp-3 flex-1">
                        {faq.metaDescription || generateExcerpt(faq.content?.body || '', 120)}
                      </p>

                      {/* Read More Link */}
                      <Link
                        href={`/${faq.slug}`}
                        className="inline-flex items-center text-sm font-medium text-teal-600 hover:text-teal-700"
                      >
                        Read answers
                        <svg
                          className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                          />
                        </svg>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <nav className="mt-12 flex items-center justify-center gap-2">
                  {/* Previous */}
                  {currentPage > 1 ? (
                    <Link
                      href={`/faq?page=${currentPage - 1}`}
                      className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                      Previous
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded-lg cursor-not-allowed">
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                      Previous
                    </span>
                  )}

                  {/* Page Numbers */}
                  <div className="hidden sm:flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <Link
                          key={pageNum}
                          href={`/faq?page=${pageNum}`}
                          className={`px-4 py-2 text-sm font-medium rounded-lg ${
                            pageNum === currentPage
                              ? 'bg-teal-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </Link>
                      );
                    })}
                  </div>

                  {/* Current Page Indicator (Mobile) */}
                  <span className="sm:hidden text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </span>

                  {/* Next */}
                  {currentPage < totalPages ? (
                    <Link
                      href={`/faq?page=${currentPage + 1}`}
                      className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Next
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded-lg cursor-not-allowed">
                      Next
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </span>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-12 sm:px-12 sm:py-16">
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Still Have Questions?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-teal-100">
                Browse our experiences or get in touch with our team for personalized assistance
              </p>
              <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
                <Link
                  href="/experiences"
                  className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-medium text-teal-600 shadow-md transition-all hover:bg-teal-50"
                >
                  Browse Experiences
                </Link>
                <Link
                  href="/about"
                  className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20"
                >
                  Contact Us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
