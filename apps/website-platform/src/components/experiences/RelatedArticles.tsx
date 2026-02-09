/**
 * RelatedArticles Component
 *
 * Displays related blog posts on experience detail pages.
 * Shows 2-3 articles relevant to the experience's location or category.
 */

import Link from 'next/link';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  metaDescription: string | null;
  createdAt: Date;
  content?: {
    body: string;
    qualityScore: number | null;
  } | null;
}

interface RelatedArticlesProps {
  posts: BlogPost[];
  experienceTitle: string;
  locationName?: string;
  categoryName?: string;
  primaryColor?: string;
}

/**
 * Generate excerpt from content body (markdown)
 */
function generateExcerpt(body: string, maxLength: number = 100): string {
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

export function RelatedArticles({
  posts,
  experienceTitle,
  locationName,
  categoryName,
  primaryColor = '#6366f1',
}: RelatedArticlesProps) {
  if (posts.length === 0) {
    return null;
  }

  // Generate contextual heading
  const heading = locationName
    ? `Guides for ${locationName}`
    : categoryName
      ? `Tips for ${categoryName}`
      : 'Travel Tips & Guides';

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{heading}</h2>
            <p className="mt-1 text-sm text-gray-500">
              Helpful articles to make the most of your experience
            </p>
          </div>
          <Link
            href="/blog"
            className="hidden text-sm font-medium transition-colors hover:opacity-80 sm:block"
            style={{ color: primaryColor }}
          >
            View all articles
          </Link>
        </div>

        {/* Articles Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.slice(0, 3).map((post) => (
            <Link
              key={post.id}
              href={`/${post.slug}`}
              className="group flex flex-col rounded-lg border border-gray-100 bg-gray-50 p-4 transition-all hover:border-gray-200 hover:bg-white hover:shadow-sm"
            >
              {/* Icon and Badge Row */}
              <div className="mb-2 flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${primaryColor}15` }}
                >
                  <svg
                    className="h-4 w-4"
                    style={{ color: primaryColor }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                    />
                  </svg>
                </div>
                {post.content?.qualityScore && post.content.qualityScore >= 80 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                  >
                    Expert Guide
                  </span>
                )}
              </div>

              {/* Title */}
              <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-gray-900 transition-colors group-hover:text-gray-700">
                {post.title}
              </h3>

              {/* Excerpt */}
              <p className="line-clamp-2 text-xs text-gray-500">
                {post.metaDescription || generateExcerpt(post.content?.body || '', 100)}
              </p>

              {/* Read More */}
              <div
                className="mt-2 text-xs font-medium transition-colors"
                style={{ color: primaryColor }}
              >
                Read more
              </div>
            </Link>
          ))}
        </div>

        {/* Mobile "View All" Link */}
        <div className="mt-4 text-center sm:hidden">
          <Link
            href="/blog"
            className="text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: primaryColor }}
          >
            View all articles
          </Link>
        </div>
      </div>
    </section>
  );
}
