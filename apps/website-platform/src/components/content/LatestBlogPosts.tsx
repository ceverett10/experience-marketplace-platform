/**
 * LatestBlogPosts Component
 * Displays recent blog posts on the homepage
 */

import Link from 'next/link';
import { cleanPlainText } from '@/lib/seo';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  metaDescription?: string | null;
  createdAt: Date;
  content?: {
    body: string;
    qualityScore?: number | null;
  } | null;
}

interface LatestBlogPostsProps {
  posts: BlogPost[];
  siteName?: string;
}

/**
 * Generate excerpt from content body
 */
function generateExcerpt(body: string, maxLength: number = 120): string {
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
 * Format date for display
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function LatestBlogPosts({ posts, siteName: _siteName }: LatestBlogPostsProps) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="py-16 sm:py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Travel Guides & Tips
            </h2>
            <p className="mt-2 text-base text-gray-600">
              Expert advice to help you plan your perfect experience
            </p>
          </div>
          <Link
            href="/blog"
            className="hidden sm:inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            View all articles
            <svg
              className="ml-1 h-4 w-4"
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

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {posts.slice(0, 3).map((post) => (
            <article
              key={post.id}
              className="group flex flex-col overflow-hidden rounded-2xl bg-white border border-gray-200 shadow-sm transition-all hover:shadow-md"
            >
              {/* Placeholder Image */}
              <div className="h-40 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <svg
                  className="h-12 w-12 text-white/50"
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
              <div className="flex flex-1 flex-col p-5">
                {/* Meta */}
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                  <time dateTime={post.createdAt.toISOString()}>{formatDate(post.createdAt)}</time>
                  {post.content?.qualityScore && post.content.qualityScore >= 80 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      Expert
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2">
                  <Link href={`/${post.slug}`}>{post.title}</Link>
                </h3>

                {/* Excerpt */}
                <p className="text-gray-600 text-sm line-clamp-2 flex-1">
                  {post.metaDescription
                    ? cleanPlainText(post.metaDescription)
                    : generateExcerpt(post.content?.body || '')}
                </p>

                {/* Read More */}
                <Link
                  href={`/${post.slug}`}
                  className="mt-4 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Read more
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

        {/* Mobile View All Link */}
        <div className="mt-8 text-center sm:hidden">
          <Link
            href="/blog"
            className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            View all articles
          </Link>
        </div>
      </div>
    </section>
  );
}
