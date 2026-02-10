import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteFromHostname, type HomepageConfig, type SiteConfig } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { BlogPostTemplate } from '@/components/content/BlogPostTemplate';

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
  const description = post.metaDescription || post.content?.body.substring(0, 160);

  // Generate canonical URL - use custom if set, otherwise default to page URL
  // Note: blog posts are stored with 'blog/' prefix in slug
  const canonicalUrl =
    post.canonicalUrl || `https://${site.primaryDomain || hostname}/blog/${slug}`;

  return {
    title: `${title} | ${site.name}`,
    description,
    openGraph: {
      title,
      description: description || undefined,
      type: 'article',
      publishedTime: post.createdAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
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
    description: post.metaDescription || post.content?.body?.substring(0, 160) || undefined,
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
    </>
  );
}

// Dynamic rendering - pages generated on-demand
// Static generation removed as it requires database access at build time
export const dynamic = 'force-dynamic';
