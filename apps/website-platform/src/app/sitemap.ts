import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';

/**
 * Generate dynamic sitemap for SEO
 * In production, this would query the database for all pages
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

  // In production, query database for:
  // 1. All experience/product pages
  // 2. All category pages
  // 3. All destination pages
  // 4. All blog posts
  // 5. All content pages

  // Mock experience pages for now
  const mockExperienceSlugs = [
    'london-eye-experience',
    'tower-of-london-tour',
    'thames-river-cruise',
    'stonehenge-day-trip',
    'harry-potter-studio-tour',
    'westminster-walking-tour',
    'british-museum-guided-tour',
    'cotswolds-village-tour',
  ];

  const experiencePages: MetadataRoute.Sitemap = mockExperienceSlugs.map((slug) => ({
    url: `${baseUrl}/experiences/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Mock category pages
  const categories = [
    'tours',
    'day-trips',
    'attractions',
    'food-drink',
    'adventure',
    'culture',
    'nature',
    'water',
  ];

  const categoryPages: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${baseUrl}/experiences?category=${category}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...experiencePages, ...categoryPages];
}
