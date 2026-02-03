import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';

/**
 * llms.txt — Machine-readable site index for LLM consumption
 * Provides a clean markdown summary of the site's key content,
 * helping AI assistants understand and cite this site accurately.
 * See: https://llmstxt.org
 */
export async function GET() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const baseUrl = site.primaryDomain ? `https://${site.primaryDomain}` : `https://${hostname}`;

  // Fetch published pages grouped by type
  const pages = await prisma.page.findMany({
    where: {
      siteId: site.id,
      status: 'PUBLISHED',
      noIndex: false,
    },
    select: {
      slug: true,
      title: true,
      type: true,
      metaDescription: true,
    },
    orderBy: { priority: 'desc' },
  });

  const destinations = pages.filter((p) => p.type === 'LANDING');
  const categories = pages.filter((p) => p.type === 'CATEGORY');
  const experiences = pages.filter((p) => p.type === 'PRODUCT');
  const blogPosts = pages.filter((p) => p.type === 'BLOG');

  const brandName = site.brand?.name || site.name;
  const tagline = site.brand?.tagline || site.description || '';

  let output = `# ${brandName}\n\n`;

  if (tagline) {
    output += `> ${tagline}\n\n`;
  }

  output += `${brandName} is a curated travel experience marketplace. Browse and book experiences, tours, and activities across destinations worldwide.\n\n`;
  output += `- Website: ${baseUrl}\n`;
  output += `- Full content: ${baseUrl}/llms-full.txt\n`;
  output += `- Sitemap: ${baseUrl}/sitemap.xml\n`;
  output += `- RSS Feed: ${baseUrl}/feed.xml\n\n`;

  // Destinations
  if (destinations.length > 0) {
    output += `## Destinations\n\n`;
    for (const page of destinations) {
      output += `- [${page.title}](${baseUrl}/destinations/${page.slug})`;
      if (page.metaDescription) {
        output += `: ${page.metaDescription}`;
      }
      output += `\n`;
    }
    output += `\n`;
  }

  // Categories
  if (categories.length > 0) {
    output += `## Experience Categories\n\n`;
    for (const page of categories) {
      output += `- [${page.title}](${baseUrl}/categories/${page.slug})`;
      if (page.metaDescription) {
        output += `: ${page.metaDescription}`;
      }
      output += `\n`;
    }
    output += `\n`;
  }

  // Top experiences (limit to 50 to keep the index manageable)
  if (experiences.length > 0) {
    output += `## Featured Experiences\n\n`;
    for (const page of experiences.slice(0, 50)) {
      output += `- [${page.title}](${baseUrl}/experiences/${page.slug})`;
      if (page.metaDescription) {
        output += `: ${page.metaDescription}`;
      }
      output += `\n`;
    }
    output += `\n`;
  }

  // Blog posts
  if (blogPosts.length > 0) {
    output += `## Travel Guides & Blog\n\n`;
    for (const page of blogPosts) {
      output += `- [${page.title}](${baseUrl}/blog/${page.slug})`;
      if (page.metaDescription) {
        output += `: ${page.metaDescription}`;
      }
      output += `\n`;
    }
    output += `\n`;
  }

  // Static pages
  output += `## About\n\n`;
  output += `- [Home](${baseUrl}): Browse all experiences and destinations\n`;
  output += `- [All Experiences](${baseUrl}/experiences): Full catalogue of bookable experiences\n`;
  output += `- [All Destinations](${baseUrl}/destinations): Browse by destination\n`;
  output += `- [All Categories](${baseUrl}/categories): Browse by experience type\n`;
  output += `- [About Us](${baseUrl}/about): Learn more about ${brandName}\n`;
  output += `- [Contact](${baseUrl}/contact): Get in touch\n`;

  return new Response(output, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
