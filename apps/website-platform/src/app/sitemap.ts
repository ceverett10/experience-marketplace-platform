import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { isMicrosite } from '@/lib/microsite-experiences';

/**
 * Generate dynamic sitemap for SEO
 * Includes all static pages and database-generated content
 * Microsite-aware: includes supplier products for operator microsites
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const baseUrl = site.primaryDomain ? `https://${site.primaryDomain}` : `https://${hostname}`;
  const isMicrositePage = isMicrosite(site.micrositeContext);

  // Static pages - adjust for microsites
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/experiences`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    // Destinations and categories are less relevant for single-operator microsites
    ...(isMicrositePage
      ? []
      : [
          {
            url: `${baseUrl}/destinations`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
          },
          {
            url: `${baseUrl}/categories`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
          },
        ]),
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // Slugs to exclude from sitemap (noindex pages with identical content across all sites)
  const excludedSlugs = new Set(['privacy', 'terms', 'prize-draw-terms', 'unsubscribed']);

  // Query database for all published pages for this site
  const dbPages = await prisma.page.findMany({
    where: {
      siteId: site.id,
      status: 'PUBLISHED',
      noIndex: false, // Exclude pages marked as noIndex
      slug: { notIn: [...excludedSlugs] },
    },
    select: {
      slug: true,
      type: true,
      priority: true,
      updatedAt: true,
    },
  });

  // Collect static page paths for deduplication
  const staticPaths = new Set(staticPages.map((p) => p.url));

  // Map database pages to sitemap entries
  // Note: BLOG slugs include 'blog/' prefix (e.g., 'blog/my-post')
  // and LANDING slugs include 'destinations/' prefix (e.g., 'destinations/little-italy')
  // so we use /${slug} directly for these types to avoid double-prefixing.
  const databasePages: MetadataRoute.Sitemap = dbPages
    .map((page) => {
      let urlPath: string;
      let changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' =
        'weekly';

      switch (page.type) {
        case 'BLOG':
          // Slug already has 'blog/' prefix (e.g., 'blog/my-post')
          urlPath = `/${page.slug}`;
          changeFrequency = 'monthly';
          break;
        case 'CATEGORY':
          urlPath = `/categories/${page.slug}`;
          changeFrequency = 'weekly';
          break;
        case 'LANDING':
          // Slug already has 'destinations/' prefix (e.g., 'destinations/little-italy')
          urlPath = `/${page.slug}`;
          changeFrequency = 'weekly';
          break;
        case 'PRODUCT':
          urlPath = `/experiences/${page.slug}`;
          changeFrequency = 'weekly';
          break;
        default:
          urlPath = `/${page.slug}`;
          changeFrequency = 'monthly';
      }

      return {
        url: `${baseUrl}${urlPath}`,
        lastModified: page.updatedAt,
        changeFrequency,
        priority: page.priority,
      };
    })
    .filter((entry) => !staticPaths.has(entry.url));

  // For microsites, also include all supplier products as experience pages
  let productPages: MetadataRoute.Sitemap = [];
  if (isMicrositePage && site.micrositeContext?.supplierId) {
    const products = await prisma.product.findMany({
      where: { supplierId: site.micrositeContext.supplierId },
      select: {
        holibobProductId: true,
        updatedAt: true,
        rating: true,
      },
      orderBy: { rating: 'desc' },
    });

    productPages = products.map((product) => ({
      url: `${baseUrl}/experiences/${product.holibobProductId}`,
      lastModified: product.updatedAt,
      changeFrequency: 'weekly' as const,
      // Higher priority for highly-rated products
      priority: product.rating ? Math.min(0.8, 0.6 + product.rating * 0.04) : 0.6,
    }));
  }

  return [...staticPages, ...databasePages, ...productPages];
}
