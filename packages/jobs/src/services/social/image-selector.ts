import { prisma } from '@experience-marketplace/database';

/**
 * Select the best available image for a social post from existing assets.
 * Priority: blog content images > site hero image > brand OG image > brand logo
 */
export async function selectImageForPost(
  siteId: string,
  pageId: string
): Promise<string | null> {
  // 1. Try to extract images from the blog post content
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      content: {
        select: { body: true },
      },
      site: {
        select: {
          homepageConfig: true,
          brand: {
            select: {
              ogImageUrl: true,
              logoUrl: true,
            },
          },
        },
      },
    },
  });

  if (!page) return null;

  // Extract image URLs from markdown content
  if (page.content?.body) {
    const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
    const matches = [...page.content.body.matchAll(imageRegex)];
    for (const match of matches) {
      const url = match[1];
      // Prefer R2/CDN images over hotlinked ones
      if (url && (url.includes('r2.dev') || url.includes('cloudflare') || url.includes('unsplash'))) {
        return url;
      }
    }
    // Return first image if available
    if (matches.length > 0 && matches[0]?.[1]) {
      return matches[0][1];
    }
  }

  // 2. Try site hero image
  const homepageConfig = page.site?.homepageConfig as Record<string, unknown> | null;
  const hero = homepageConfig?.['hero'] as Record<string, unknown> | undefined;
  if (hero?.['backgroundImage'] && typeof hero['backgroundImage'] === 'string') {
    return hero['backgroundImage'];
  }

  // 3. Try brand OG image
  if (page.site?.brand?.ogImageUrl) {
    return page.site.brand.ogImageUrl;
  }

  // 4. Try brand logo as last resort
  if (page.site?.brand?.logoUrl) {
    return page.site.brand.logoUrl;
  }

  return null;
}
