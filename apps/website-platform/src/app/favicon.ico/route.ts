import { headers } from 'next/headers';

import { getSiteFromHostname } from '@/lib/tenant';

/**
 * Dynamic favicon route handler.
 * Serves the per-tenant SVG favicon at a crawlable URL so Google can index it.
 * Decodes the base64 data URI stored in brand.faviconUrl and returns the raw SVG.
 */
export async function GET() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';

  try {
    const site = await getSiteFromHostname(hostname);
    const faviconUrl = site.brand?.faviconUrl;

    if (faviconUrl?.startsWith('data:image/svg+xml;base64,')) {
      const base64 = faviconUrl.replace('data:image/svg+xml;base64,', '');
      const svg = Buffer.from(base64, 'base64');

      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      });
    }

    // No favicon configured — return 404
    return new Response(null, { status: 404 });
  } catch {
    return new Response(null, { status: 404 });
  }
}
