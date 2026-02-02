import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';
import { prisma } from '@/lib/prisma';
import { CategoryPageTemplate } from '@/components/content/CategoryPageTemplate';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Fetch category page from database
 */
async function getCategoryPage(siteId: string, slug: string) {
  return await prisma.page.findUnique({
    where: {
      siteId_slug: {
        siteId,
        slug,
      },
      type: 'CATEGORY',
      status: 'PUBLISHED',
    },
    include: {
      content: true,
    },
  });
}

/**
 * Fetch related experiences from Holibob API
 */
async function getRelatedExperiences(
  site: Awaited<ReturnType<typeof getSiteFromHostname>>,
  categoryId?: string | null
) {
  if (!categoryId) return [];

  try {
    const client = getHolibobClient(site);
    const response = await client.discoverProducts(
      {
        categoryIds: [categoryId],
        currency: 'GBP',
      },
      { pageSize: 6 }
    );

    return response.products.map((product) => ({
      id: product.id,
      slug: product.id, // Product type doesn't have slug, use id
      title: product.name,
      shortDescription: product.shortDescription || '',
      imageUrl: product.primaryImageUrl || product.imageUrl || product.imageList?.[0]?.url || '',
      price: {
        formatted: product.priceFromFormatted || product.guidePriceFormattedText || 'From £0',
      },
      rating:
        product.reviewRating && product.reviewCount
          ? {
              average: product.reviewRating,
              count: product.reviewCount,
            }
          : null,
    }));
  } catch (error) {
    console.error('Error fetching related experiences:', error);
    return [];
  }
}

/**
 * Generate SEO metadata for category page
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const category = await getCategoryPage(site.id, slug);

  if (!category) {
    return {
      title: 'Category Not Found',
    };
  }

  const title = category.metaTitle || category.title;
  const description = category.metaDescription || category.content?.body.substring(0, 160);

  return {
    title: `${title} | ${site.name}`,
    description,
    openGraph: {
      title,
      description: description || undefined,
      type: 'website',
    },
    alternates: category.canonicalUrl
      ? {
          canonical: category.canonicalUrl,
        }
      : undefined,
    robots: {
      index: !category.noIndex,
      follow: !category.noIndex,
    },
  };
}

/**
 * Category landing page
 */
export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const category = await getCategoryPage(site.id, slug);

  if (!category) {
    notFound();
  }

  // Fetch related experiences from Holibob API
  const relatedExperiences = await getRelatedExperiences(site, category.holibobCategoryId);

  // Generate JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: category.title,
    description: category.metaDescription || undefined,
    ...((category.content?.structuredData as Record<string, unknown>) || {}),
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
        <div className="mx-auto max-w-7xl px-4 py-3">
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
            <a href="/categories" className="hover:text-gray-700">
              Categories
            </a>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-gray-900">{category.title}</span>
          </nav>
        </div>
      </div>

      {/* Category Page Content */}
      <CategoryPageTemplate
        category={category}
        relatedExperiences={relatedExperiences}
        siteName={site.name}
      />
    </>
  );
}

// Dynamic rendering - pages generated on-demand
// Static generation removed as it requires database access at build time
export const dynamic = 'force-dynamic';
