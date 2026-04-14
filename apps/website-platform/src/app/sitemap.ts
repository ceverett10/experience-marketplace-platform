import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { isMicrosite } from '@/lib/microsite-experiences';

/**
 * Maximum URLs per sitemap file — Google limits sitemaps to 50,000 URLs.
 * We use 45,000 to leave headroom for edge cases.
 */
const MAX_URLS_PER_SITEMAP = 45_000;

/** Slugs excluded from sitemap (noindex pages with identical content across all sites) */
const EXCLUDED_SLUGS = ['privacy', 'terms', 'prize-draw-terms', 'unsubscribed'];

/** Check if a hostname is a non-production environment */
function isNonProductionHost(hostname: string): boolean {
  const clean = hostname.split(':')[0] ?? hostname;
  return (
    clean.includes('.herokuapp.com') ||
    clean.includes('.vercel.app') ||
    clean === 'localhost' ||
    clean.includes('127.0.0.1')
  );
}

/**
 * Build the where-clause for querying pages by site or microsite.
 */
function getPageWhereClause(
  isMicrositePage: boolean,
  micrositeId: string | undefined,
  siteId: string
) {
  return isMicrositePage && micrositeId ? { micrositeId } : { siteId };
}

/**
 * Generate sitemap buckets for pagination.
 * Next.js uses this to create a sitemap index at /sitemap.xml
 * and individual sitemaps at /sitemap/0.xml, /sitemap/1.xml, etc.
 *
 * This ensures we never exceed Google's 50,000 URL-per-sitemap limit,
 * which is critical for supplier microsites with large product catalogs.
 */
export async function generateSitemaps() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';

  if (isNonProductionHost(hostname)) {
    return [{ id: 0 }];
  }

  const site = await getSiteFromHostname(hostname);
  const isMicrositePage = isMicrosite(site.micrositeContext);

  const pageWhere = getPageWhereClause(
    isMicrositePage,
    site.micrositeContext?.micrositeId,
    site.id
  );

  // Count total URLs with cheap count() queries instead of fetching all records
  const [pageCount, productCount] = await Promise.all([
    prisma.page.count({
      where: {
        ...pageWhere,
        status: 'PUBLISHED',
        noIndex: false,
        slug: { notIn: EXCLUDED_SLUGS },
      },
    }),
    isMicrositePage && site.micrositeContext?.supplierId
      ? prisma.product.count({
          where: { supplierId: site.micrositeContext.supplierId },
        })
      : Promise.resolve(0),
  ]);

  const staticPageCount = isMicrositePage ? 5 : 7;
  const totalUrls = staticPageCount + pageCount + productCount;
  const numSitemaps = Math.max(1, Math.ceil(totalUrls / MAX_URLS_PER_SITEMAP));

  return Array.from({ length: numSitemaps }, (_, i) => ({ id: i }));
}

/**
 * Generate dynamic sitemap for SEO.
 * Includes static pages, database-generated content, and supplier products.
 * Microsite-aware: includes supplier products for operator microsites.
 *
 * Bucket 0 always contains static pages + all database pages.
 * Products are paginated across buckets when they exceed the per-sitemap limit.
 */
export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';

  if (isNonProductionHost(hostname)) {
    return [];
  }

  const site = await getSiteFromHostname(hostname);

  const baseUrl = site.primaryDomain ? `https://${site.primaryDomain}` : `https://${hostname}`;
  const isMicrositePage = isMicrosite(site.micrositeContext);

  const entries: MetadataRoute.Sitemap = [];

  // --- Static pages + database pages always go in bucket 0 ---
  if (id === 0) {
    // Static pages
    entries.push(
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
      }
    );

    // Destinations and categories are less relevant for single-operator microsites
    if (!isMicrositePage) {
      entries.push(
        {
          url: `${baseUrl}/destinations`,
          lastModified: new Date(),
          changeFrequency: 'weekly',
          priority: 0.8,
        },
        {
          url: `${baseUrl}/categories`,
          lastModified: new Date(),
          changeFrequency: 'weekly',
          priority: 0.8,
        }
      );
    }

    entries.push(
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
      }
    );

    // Database pages (blogs, destinations, categories, etc.)
    const pageWhere = getPageWhereClause(
      isMicrositePage,
      site.micrositeContext?.micrositeId,
      site.id
    );

    const dbPages = await prisma.page.findMany({
      where: {
        ...pageWhere,
        status: 'PUBLISHED',
        noIndex: false,
        slug: { notIn: EXCLUDED_SLUGS },
      },
      select: {
        slug: true,
        type: true,
        priority: true,
        updatedAt: true,
      },
    });

    const staticPaths = new Set(entries.map((p) => p.url));

    // Map database pages to sitemap entries
    // Note: BLOG slugs include 'blog/' prefix (e.g., 'blog/my-post')
    // and LANDING slugs include 'destinations/' prefix (e.g., 'destinations/little-italy')
    // so we use /${slug} directly for these types to avoid double-prefixing.
    for (const page of dbPages) {
      let urlPath: string;
      let changeFrequency:
        | 'always'
        | 'hourly'
        | 'daily'
        | 'weekly'
        | 'monthly'
        | 'yearly'
        | 'never' = 'weekly';

      switch (page.type) {
        case 'BLOG':
          urlPath = `/${page.slug}`;
          changeFrequency = 'monthly';
          break;
        case 'CATEGORY':
          urlPath = `/categories/${page.slug}`;
          changeFrequency = 'weekly';
          break;
        case 'LANDING':
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

      const fullUrl = `${baseUrl}${urlPath}`;
      if (!staticPaths.has(fullUrl)) {
        entries.push({
          url: fullUrl,
          lastModified: page.updatedAt,
          changeFrequency,
          priority: page.priority,
        });
      }
    }
  }

  // --- Products are paginated across all buckets ---
  if (isMicrositePage && site.micrositeContext?.supplierId) {
    let productSkip: number;
    let productTake: number;

    if (id === 0) {
      // Bucket 0: fill remaining capacity with products
      const remainingCapacity = MAX_URLS_PER_SITEMAP - entries.length;
      productSkip = 0;
      productTake = Math.max(0, remainingCapacity);
    } else {
      // Bucket 1+: calculate offset based on how many products fit in bucket 0.
      // Use count queries to stay consistent with generateSitemaps().
      const pageWhere = getPageWhereClause(
        isMicrositePage,
        site.micrositeContext?.micrositeId,
        site.id
      );
      const dbPageCount = await prisma.page.count({
        where: {
          ...pageWhere,
          status: 'PUBLISHED',
          noIndex: false,
          slug: { notIn: EXCLUDED_SLUGS },
        },
      });
      const staticCount = isMicrositePage ? 5 : 7;
      const bucket0ProductCapacity = MAX_URLS_PER_SITEMAP - staticCount - dbPageCount;

      productSkip = bucket0ProductCapacity + (id - 1) * MAX_URLS_PER_SITEMAP;
      productTake = MAX_URLS_PER_SITEMAP;
    }

    if (productTake > 0) {
      const products = await prisma.product.findMany({
        where: { supplierId: site.micrositeContext.supplierId },
        select: {
          holibobProductId: true,
          updatedAt: true,
          rating: true,
        },
        orderBy: { rating: 'desc' },
        skip: productSkip,
        take: productTake,
      });

      for (const product of products) {
        entries.push({
          url: `${baseUrl}/experiences/${product.holibobProductId}`,
          lastModified: product.updatedAt,
          changeFrequency: 'weekly',
          priority: product.rating ? Math.min(0.8, 0.6 + product.rating * 0.04) : 0.6,
        });
      }
    }
  }

  return entries;
}
