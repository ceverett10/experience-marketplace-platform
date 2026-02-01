import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { BlogPostTemplate } from '@/components/content/BlogPostTemplate';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Fetch blog post from database
 */
async function getBlogPost(siteId: string, slug: string) {
  return await prisma.page.findUnique({
    where: {
      siteId_slug: {
        siteId,
        slug,
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
 * Generate SEO metadata for blog post
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const post = await getBlogPost(site.id, slug);

  if (!post) {
    return {
      title: 'Blog Post Not Found',
    };
  }

  const title = post.metaTitle || post.title;
  const description = post.metaDescription || post.content?.body.substring(0, 160);

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
    alternates: post.canonicalUrl
      ? {
          canonical: post.canonicalUrl,
        }
      : undefined,
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
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const post = await getBlogPost(site.id, slug);

  if (!post) {
    notFound();
  }

  // Generate JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.metaDescription || undefined,
    datePublished: post.createdAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: {
      '@type': 'Organization',
      name: site.name,
    },
    publisher: {
      '@type': 'Organization',
      name: site.name,
    },
    ...((post.content?.structuredData as Record<string, unknown>) || {}),
  };

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
