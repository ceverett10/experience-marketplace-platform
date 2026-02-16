import { prisma } from '@experience-marketplace/database';

/**
 * Select the best available image for a social post from existing assets.
 * Priority: blog content images > site hero image > brand OG image > brand logo
 * When pageId is omitted, falls back to site-level images.
 */
export async function selectImageForPost(siteId: string, pageId?: string): Promise<string | null> {
  // 1. Try to extract images from the blog post content (if pageId provided)
  if (pageId) {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: {
        content: {
          select: { body: true },
        },
      },
    });

    if (page?.content?.body) {
      const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
      const matches = [...page.content.body.matchAll(imageRegex)];
      for (const match of matches) {
        const url = match[1];
        // Prefer R2/CDN images over hotlinked ones
        if (
          url &&
          (url.includes('r2.dev') || url.includes('cloudflare') || url.includes('unsplash'))
        ) {
          return url;
        }
      }
      // Return first image if available
      if (matches.length > 0 && matches[0]?.[1]) {
        return matches[0][1];
      }
    }
  }

  // 2. Try site-level images
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      homepageConfig: true,
      brand: {
        select: {
          ogImageUrl: true,
          logoUrl: true,
        },
      },
    },
  });

  if (!site) return null;

  // 3. Try site hero image
  const homepageConfig = site.homepageConfig as Record<string, unknown> | null;
  const hero = homepageConfig?.['hero'] as Record<string, unknown> | undefined;
  if (hero?.['backgroundImage'] && typeof hero['backgroundImage'] === 'string') {
    return hero['backgroundImage'];
  }

  // 4. Try brand OG image
  if (site.brand?.ogImageUrl) {
    return site.brand.ogImageUrl;
  }

  // 5. Try brand logo as last resort
  if (site.brand?.logoUrl) {
    return site.brand.logoUrl;
  }

  return null;
}
