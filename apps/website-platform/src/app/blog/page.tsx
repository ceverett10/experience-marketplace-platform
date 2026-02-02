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

const POSTS_PER_PAGE = 12;

/**
 * Generate SEO metadata for blog listing page
 */
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  return {
    title: `Travel Blog & Guides | ${site.name}`,
    description: `Explore travel tips, destination guides, and insider knowledge from ${site.name}. Get expert advice for planning your perfect experience.`,
    openGraph: {
      title: `Travel Blog & Guides | ${site.name}`,
      description: `Explore travel tips, destination guides, and insider knowledge from ${site.name}.`,
      type: 'website',
    },
  };
}

/**
 * Fetch blog posts with pagination
 */
async function getBlogPosts(siteId: string, page: number = 1) {
  const skip = (page - 1) * POSTS_PER_PAGE;

  const [posts, totalCount] = await Promise.all([
    prisma.page.findMany({
      where: {
        siteId,
        type: 'BLOG',
        status: 'PUBLISHED',
      },
      include: {
        content: {
          select: {
            body: true,
            qualityScore: true,
            isAiGenerated: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: POSTS_PER_PAGE,
    }),
    prisma.page.count({
      where: {
        siteId,
        type: 'BLOG',
        status: 'PUBLISHED',
      },
    }),
  ]);

  return {
    posts,
    totalCount,
    totalPages: Math.ceil(totalCount / POSTS_PER_PAGE),
    currentPage: page,
  };
}

/**
 * Generate excerpt from content body
 */
function generateExcerpt(body: string, maxLength: number = 160): string {
  // Strip markdown formatting
  const plainText = body
    .replace(/#{1,6}\s/g, '') // Remove headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
    .replace(/`[^`]+`/g, '') // Remove inline code
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .trim();

  if (plainText.length <= maxLength) return plainText;
  return plainText.substring(0, maxLength).trim() + '...';
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

/**
 * Blog listing page
 */
export default async function BlogPage({ searchParams }: Props) {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const resolvedParams = await searchParams;
  const currentPage = Math.max(1, parseInt(resolvedParams.page || '1', 10));

  const { posts, totalCount, totalPages } = await getBlogPosts(site.id, currentPage);

  // JSON-LD structured data for blog listing
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${site.name} Blog`,
    description: `Travel tips, destination guides, and insider knowledge from ${site.name}`,
    url: `https://${site.primaryDomain || hostname}/blog`,
    publisher: {
      '@type': 'Organization',
      name: site.name,
    },
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.metaDescription || generateExcerpt(post.content?.body || ''),
      datePublished: post.createdAt.toISOString(),
      dateModified: post.updatedAt.toISOString(),
      url: `https://${site.primaryDomain || hostname}/blog/${post.slug}`,
    })),
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
        name: 'Blog',
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
      <section className="bg-gradient-to-br from-indigo-900 via-purple-800 to-indigo-900 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Travel Blog & Guides
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-indigo-200 sm:text-xl">
              Expert tips, destination insights, and travel inspiration to help you plan your
              perfect experience
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
            <span className="text-gray-900">Blog</span>
          </nav>
        </div>
      </div>

      {/* Blog Posts Grid */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {posts.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto h-24 w-24 rounded-full bg-indigo-100 flex items-center justify-center mb-6">
                <svg
                  className="h-12 w-12 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No Blog Posts Yet</h2>
              <p className="text-gray-600 max-w-md mx-auto">
                We&apos;re working on creating helpful guides and travel tips. Check back soon for
                our latest articles!
              </p>
              <Link
                href="/experiences"
                className="mt-6 inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                Browse Experiences
              </Link>
            </div>
          ) : (
            <>
              {/* Results Count */}
              <div className="mb-8">
                <p className="text-gray-600">
                  {totalCount} {totalCount === 1 ? 'article' : 'articles'} available
                </p>
              </div>

              {/* Posts Grid */}
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => (
                  <article
                    key={post.id}
                    className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-md transition-all hover:shadow-xl"
                  >
                    {/* Placeholder Image */}
                    <div className="h-48 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <svg
                        className="h-16 w-16 text-white/50"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                        />
                      </svg>
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col p-6">
                      {/* Meta */}
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                        <time dateTime={post.createdAt.toISOString()}>
                          {formatDate(post.createdAt)}
                        </time>
                        {post.content?.qualityScore && post.content.qualityScore >= 80 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                            Expert Guide
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2">
                        <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                      </h2>

                      {/* Excerpt */}
                      <p className="text-gray-600 text-sm mb-4 line-clamp-3 flex-1">
                        {post.metaDescription || generateExcerpt(post.content?.body || '', 120)}
                      </p>

                      {/* Read More Link */}
                      <Link
                        href={`/blog/${post.slug}`}
                        className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Read article
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
                      href={`/blog?page=${currentPage - 1}`}
                      className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                          href={`/blog?page=${pageNum}`}
                          className={`px-4 py-2 text-sm font-medium rounded-lg ${
                            pageNum === currentPage
                              ? 'bg-indigo-600 text-white'
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
                      href={`/blog?page=${currentPage + 1}`}
                      className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Next
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* Subscribe Section */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-12 sm:px-12 sm:py-16">
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Looking for Your Next Adventure?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-indigo-100">
                Browse our curated collection of experiences and find something unforgettable
              </p>
              <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
                <Link
                  href="/experiences"
                  className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-medium text-indigo-600 shadow-md transition-all hover:bg-indigo-50"
                >
                  Browse Experiences
                </Link>
                <Link
                  href="/destinations"
                  className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20"
                >
                  Explore Destinations
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
