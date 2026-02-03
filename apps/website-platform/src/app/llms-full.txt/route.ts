import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';

/**
 * llms-full.txt — Full site content in markdown for LLM consumption
 * Provides complete page content in a single request, reducing the need
 * for AI crawlers to visit and parse individual HTML pages.
 * See: https://llmstxt.org
 */
export async function GET() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const baseUrl = site.primaryDomain ? `https://${site.primaryDomain}` : `https://${hostname}`;

  // Fetch all published pages with their content
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
      content: {
        select: {
          body: true,
        },
      },
    },
    orderBy: { priority: 'desc' },
  });

  const brandName = site.brand?.name || site.name;
  const tagline = site.brand?.tagline || site.description || '';

  let output = `# ${brandName}\n\n`;

  if (tagline) {
    output += `> ${tagline}\n\n`;
  }

  output += `${brandName} is a curated travel experience marketplace. Browse and book experiences, tours, and activities across destinations worldwide.\n\n`;
  output += `Website: ${baseUrl}\n\n`;
  output += `---\n\n`;

  // Helper to get the URL path for a page
  const getPageUrl = (page: { type: string; slug: string }): string => {
    switch (page.type) {
      case 'BLOG':
        return `${baseUrl}/blog/${page.slug}`;
      case 'CATEGORY':
        return `${baseUrl}/categories/${page.slug}`;
      case 'LANDING':
        return `${baseUrl}/destinations/${page.slug}`;
      case 'PRODUCT':
        return `${baseUrl}/experiences/${page.slug}`;
      default:
        return `${baseUrl}/${page.slug}`;
    }
  };

  // Helper to get a section label
  const getTypeLabel = (type: string): string => {
    switch (type) {
      case 'BLOG':
        return 'Blog Post';
      case 'CATEGORY':
        return 'Experience Category';
      case 'LANDING':
        return 'Destination Guide';
      case 'PRODUCT':
        return 'Experience';
      default:
        return 'Page';
    }
  };

  // Group pages by type for organized output
  const typeOrder = ['LANDING', 'CATEGORY', 'PRODUCT', 'BLOG'];
  const sectionTitles: Record<string, string> = {
    LANDING: 'Destination Guides',
    CATEGORY: 'Experience Categories',
    PRODUCT: 'Experiences',
    BLOG: 'Travel Guides & Blog',
  };

  for (const type of typeOrder) {
    const typedPages = pages.filter((p) => p.type === type);
    if (typedPages.length === 0) continue;

    output += `# ${sectionTitles[type] || type}\n\n`;

    for (const page of typedPages) {
      const url = getPageUrl(page);
      output += `## ${page.title}\n\n`;
      output += `- Type: ${getTypeLabel(page.type)}\n`;
      output += `- URL: ${url}\n`;
      if (page.metaDescription) {
        output += `- Summary: ${page.metaDescription}\n`;
      }
      output += `\n`;

      if (page.content?.body) {
        output += `${page.content.body}\n\n`;
      }

      output += `---\n\n`;
    }
  }

  return new Response(output, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
