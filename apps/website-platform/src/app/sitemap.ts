import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';

/**
 * Generate dynamic sitemap for SEO
 * Includes all static pages and database-generated content
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const baseUrl = site.primaryDomain ? `https://${site.primaryDomain}` : `https://${hostname}`;

  // Static pages
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
    },
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

  // Query database for all published pages for this site
  const dbPages = await prisma.page.findMany({
    where: {
      siteId: site.id,
      status: 'PUBLISHED',
      noIndex: false, // Exclude pages marked as noIndex
    },
    select: {
      slug: true,
      type: true,
      priority: true,
      updatedAt: true,
    },
  });

  // Map database pages to sitemap entries
  const databasePages: MetadataRoute.Sitemap = dbPages.map((page) => {
    let urlPath: string;
    let changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' =
      'weekly';

    // Determine URL path based on page type
    switch (page.type) {
      case 'BLOG':
        urlPath = `/blog/${page.slug}`;
        changeFrequency = 'monthly';
        break;
      case 'CATEGORY':
        urlPath = `/categories/${page.slug}`;
        changeFrequency = 'weekly';
        break;
      case 'LANDING':
        urlPath = `/destinations/${page.slug}`;
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
  });

  return [...staticPages, ...databasePages];
}
