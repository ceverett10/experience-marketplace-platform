import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteFromHostname, type HomepageConfig, type SiteConfig } from '@/lib/tenant';
import { cleanPlainText } from '@/lib/seo';
import { prisma } from '@/lib/prisma';
import { getRelatedMicrosites, getNetworkRelatedBlogPosts } from '@/lib/microsite-experiences';
import { BlogPostTemplate } from '@/components/content/BlogPostTemplate';
import { RelatedMicrosites } from '@/components/microsites/RelatedMicrosites';
import { NetworkRelatedPosts } from '@/components/microsites/NetworkRelatedPosts';
import { TrackFunnelEvent } from '@/components/analytics/TrackFunnelEvent';
import { RelatedExperiences } from '@/components/experiences/RelatedExperiences';
import { RelatedArticles } from '@/components/experiences/RelatedArticles';
import {
  extractContentKeywords,
  getRelatedPagesByKeywords,
  getRelatedExperiencesForContent,
} from '@/lib/related-content';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Fetch blog post from database
 * Note: Blog pages are stored with 'blog/' prefix in slug (e.g., 'blog/my-post')
 * The URL /blog/my-post maps to slug 'blog/my-post' in the database
 */
async function getBlogPost(site: SiteConfig, slug: string) {
  const fullSlug = `blog/${slug}`;
  const isMicrosite = !!site.micrositeContext?.micrositeId;

  if (isMicrosite) {
    // Microsite pages use micrositeId_slug composite key
    return await prisma.page.findUnique({
      where: {
        micrositeId_slug: {
          micrositeId: site.micrositeContext!.micrositeId,
          slug: fullSlug,
        },
        type: 'BLOG',
        status: 'PUBLISHED',
      },
      include: {
        content: true,
      },
    });
  }

  // Regular sites use siteId_slug composite key
  return await prisma.page.findUnique({
    where: {
      siteId_slug: {
        siteId: site.id,
        slug: fullSlug,
      },
      type: 'BLOG',
      status: 'PUBLISHED',
    },
    include: {
      content: true,
    },
  });
}

/**
 * Get a default image for structured data from site configuration
 * Falls back through: ogImage -> hero background -> logo -> generic placeholder
 */
function getDefaultImage(
  site: {
    brand?: { ogImageUrl?: string | null; logoUrl?: string | null } | null;
    homepageConfig?: HomepageConfig | null;
  },
  hostname: string
): string {
  // Try OG image first (usually best for articles)
  if (site.brand?.ogImageUrl) {
    return site.brand.ogImageUrl;
  }

  // Try hero background image
  if (site.homepageConfig?.hero?.backgroundImage) {
    return site.homepageConfig.hero.backgroundImage;
  }

  // Try logo
  if (site.brand?.logoUrl) {
    return site.brand.logoUrl;
  }

  // Fallback to a generic placeholder
  return `https://${hostname}/og-image.png`;
}

/**
 * Generate SEO metadata for blog post
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const post = await getBlogPost(site, slug);

  if (!post) {
    return {
      title: 'Blog Post Not Found',
    };
  }

  const title = post.metaTitle || post.title;
  const rawDescription = post.metaDescription || post.content?.body.substring(0, 160);
  const description = rawDescription ? cleanPlainText(rawDescription) : undefined;

  // Generate canonical URL - use custom if set, otherwise default to page URL
  // Note: blog posts are stored with 'blog/' prefix in slug
  const canonicalUrl =
    post.canonicalUrl || `https://${site.primaryDomain || hostname}/blog/${slug}`;

  // OG image fallback chain
  const ogImage = site.brand?.ogImageUrl || site.homepageConfig?.hero?.backgroundImage;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | ${site.name}`,
      description: description || undefined,
      type: 'article',
      publishedTime: post.createdAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${site.name}`,
      description: description || undefined,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: !post.noIndex,
      follow: !post.noIndex,
    },
  };
}

/**
 * Blog post page
 */
export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const post = await getBlogPost(site, slug);

  if (!post) {
    notFound();
  }

  // Get page URL and image for structured data
  const baseUrl = `https://${site.primaryDomain || hostname}`;
  const pageUrl = `${baseUrl}/blog/${slug}`;
  const defaultImage = getDefaultImage(site, site.primaryDomain || hostname);

  // Get logo URL for publisher
  const publisherLogo = site.brand?.faviconUrl || site.brand?.logoUrl;

  // Generate JSON-LD structured data with all required fields for rich snippets
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title.substring(0, 110), // Google truncates at 110 chars
    description: cleanPlainText(
      post.metaDescription || post.content?.body?.substring(0, 160) || ''
    ),
    datePublished: post.createdAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    // Image is REQUIRED for BlogPosting rich results
    image: [defaultImage],
    // mainEntityOfPage helps Google understand this is the main content
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': pageUrl,
    },
    author: {
      '@type': 'Organization',
      name: site.name,
      url: baseUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: site.name,
      ...(publisherLogo && {
        logo: {
          '@type': 'ImageObject',
          url: publisherLogo,
        },
      }),
    },
    // Word count helps search engines understand content depth
    wordCount: post.content?.body ? post.content.body.split(/\s+/).length : undefined,
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
        item: `https://${site.primaryDomain || hostname}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
      },
    ],
  };

  return (
    <>
      {/* JSON-LD Structured Data - BlogPosting */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* JSON-LD Structured Data - Breadcrumbs */}
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
            <a href="/blog" className="hover:text-gray-700">
              Blog
            </a>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-gray-900">{post.title}</span>
          </nav>
        </div>
      </div>

      {/* Blog Post Content */}
      <BlogPostTemplate post={post} siteName={site.name} />

      {/* Topic cluster: related experiences and blog posts */}
      <BlogRelatedContent site={site} post={post} />

      {/* Network cross-linking (microsites only) */}
      {site.micrositeContext?.micrositeId && (
        <NetworkRelatedPostsSection
          micrositeId={site.micrositeContext.micrositeId}
          cities={site.micrositeContext.supplierCities || []}
          categories={site.micrositeContext.supplierCategories || []}
        />
      )}

      {/* Related microsites grid (microsites only) */}
      {site.relatedMicrosites && site.relatedMicrosites.length > 0 && (
        <RelatedMicrosites
          microsites={site.relatedMicrosites.map((ms) => ({
            ...ms,
            logoUrl: null,
            productCount: 0,
            rating: null,
          }))}
        />
      )}
      <TrackFunnelEvent step="LANDING_PAGE_VIEW" />
    </>
  );
}

/**
 * Server component that fetches network related posts.
 * Separated to avoid blocking the main page render.
 */
async function NetworkRelatedPostsSection({
  micrositeId,
  cities,
  categories,
}: {
  micrositeId: string;
  cities: string[];
  categories: string[];
}) {
  try {
    const posts = await getNetworkRelatedBlogPosts(micrositeId, cities, categories, 4);
    return <NetworkRelatedPosts posts={posts} />;
  } catch {
    return null;
  }
}

/**
 * Topic cluster internal linking for blog posts.
 * Shows related experiences (money pages) and related blog posts (sibling spokes).
 */
async function BlogRelatedContent({
  site,
  post,
}: {
  site: SiteConfig;
  post: { id: string; title: string; metaDescription: string | null };
}) {
  try {
    const keywords = extractContentKeywords(post.title, post.metaDescription);
    if (keywords.length === 0) return null;

    const isMicrosite = !!site.micrositeContext?.micrositeId;

    const [relatedExperiences, relatedPosts, destinationPage] = await Promise.all([
      getRelatedExperiencesForContent(site, keywords, 4),
      getRelatedPagesByKeywords({
        siteId: site.id,
        micrositeId: isMicrosite ? site.micrositeContext?.micrositeId : undefined,
        pageType: 'BLOG',
        keywords,
        excludePageId: post.id,
        limit: 3,
      }),
      getRelatedPagesByKeywords({
        siteId: site.id,
        micrositeId: isMicrosite ? site.micrositeContext?.micrositeId : undefined,
        pageType: 'LANDING',
        keywords,
        limit: 1,
      }),
    ]);

    const locationKeyword = keywords[0] ?? '';

    return (
      <>
        {relatedExperiences.length > 0 && (
          <RelatedExperiences
            experiences={relatedExperiences}
            title={`Book ${locationKeyword ? locationKeyword.charAt(0).toUpperCase() + locationKeyword.slice(1) + ' ' : ''}Experiences`}
          />
        )}
        {relatedPosts.length > 0 && (
          <RelatedArticles
            posts={relatedPosts.map((p) => ({
              id: p.id,
              slug: p.slug,
              title: p.title,
              metaDescription: p.metaDescription,
              createdAt: p.publishedAt ?? new Date(),
              content: p.content,
            }))}
            experienceTitle={post.title}
            locationName={locationKeyword || undefined}
          />
        )}
        {destinationPage.length > 0 && destinationPage[0] && (
          <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
            <a
              href={`/${destinationPage[0].slug}`}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-sm"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-teal-50">
                <svg
                  className="h-5 w-5 text-teal-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{destinationPage[0].title}</p>
                <p className="text-xs text-gray-500">Explore our full destination guide</p>
              </div>
              <svg
                className="ml-auto h-5 w-5 flex-shrink-0 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </a>
          </section>
        )}
      </>
    );
  } catch {
    return null;
  }
}

// Dynamic rendering - pages generated on-demand
// Static generation removed as it requires database access at build time
export const dynamic = 'force-dynamic';
