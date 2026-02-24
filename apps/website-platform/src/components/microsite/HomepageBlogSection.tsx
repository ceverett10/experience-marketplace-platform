/**
 * HomepageBlogSection Component
 *
 * Displays the 3 latest blog posts on the homepage.
 * Used in CatalogHomepage to increase engagement and SEO.
 */

import Link from 'next/link';
import { cleanPlainText } from '@/lib/seo';

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

interface HomepageBlogSectionProps {
  posts: BlogPost[];
  primaryColor: string;
  siteName: string;
}

/**
 * Generate excerpt from content body (markdown)
 */
function generateExcerpt(body: string, maxLength: number = 120): string {
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
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function HomepageBlogSection({ posts, primaryColor, siteName }: HomepageBlogSectionProps) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="bg-gray-50 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Latest Articles
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
            Travel tips, insider guides, and inspiration for your next adventure
          </p>
        </div>

        {/* Blog Posts Grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {posts.slice(0, 3).map((post) => (
            <article
              key={post.id}
              className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm transition-all hover:shadow-md"
            >
              {/* Placeholder Image - Gradient background with icon */}
              <div
                className="h-40 flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${adjustColor(primaryColor, -20)} 100%)`,
                }}
              >
                <svg
                  className="h-12 w-12 text-white/40"
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
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                    >
                      Expert Guide
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-gray-700 transition-colors">
                  <Link href={`/${post.slug}`}>{post.title}</Link>
                </h3>

                {/* Excerpt */}
                <p className="text-sm text-gray-600 mb-4 line-clamp-2 flex-1">
                  {post.metaDescription
                    ? cleanPlainText(post.metaDescription)
                    : generateExcerpt(post.content?.body || '', 120)}
                </p>

                {/* Read More Link */}
                <Link
                  href={`/${post.slug}`}
                  className="inline-flex items-center text-sm font-medium transition-colors"
                  style={{ color: primaryColor }}
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

        {/* View All Link */}
        <div className="mt-10 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-lg border-2 px-6 py-3 text-sm font-semibold transition-colors hover:bg-gray-100"
            style={{ borderColor: primaryColor, color: primaryColor }}
          >
            View All Articles
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Adjust color brightness (simple hex manipulation)
 */
function adjustColor(hex: string, amount: number): string {
  // Remove # if present
  hex = hex.replace('#', '');

  // Parse RGB values
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  // Adjust brightness
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));

  // Convert back to hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
