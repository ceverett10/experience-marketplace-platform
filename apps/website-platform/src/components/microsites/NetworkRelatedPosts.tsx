import type { NetworkRelatedPost } from '@/lib/microsite-experiences';

interface NetworkRelatedPostsProps {
  posts: NetworkRelatedPost[];
}

/**
 * Network Related Posts Component
 * Shows blog posts from related microsites in the Experiencess network.
 * Renders as a server component — data fetched at page level.
 */
export function NetworkRelatedPosts({ posts }: NetworkRelatedPostsProps) {
  if (posts.length === 0) return null;

  return (
    <section className="border-t border-gray-200 bg-white py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl font-bold text-gray-900">Related Articles from Our Network</h2>
        <p className="mt-1 text-sm text-gray-500">Discover more from the Experiencess network</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {posts.map((post) => (
            <a
              key={`${post.fullDomain}/${post.slug}`}
              href={`https://${post.fullDomain}/${post.slug}`}
              className="group rounded-lg border border-gray-200 p-4 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50"
            >
              <p className="text-xs font-medium text-indigo-600">{post.siteName}</p>
              <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900 group-hover:text-indigo-700">
                {post.title}
              </h3>
              {post.publishedAt && (
                <p className="mt-2 text-xs text-gray-400">
                  {new Date(post.publishedAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              )}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
