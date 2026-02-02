import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET() {
  const headersList = await headers();
  // On Heroku/Cloudflare, use x-forwarded-host to get the actual external domain
  const xForwardedHost = headersList.get('x-forwarded-host');
  const hostHeader = headersList.get('host');
  const hostname = xForwardedHost ?? hostHeader ?? 'unknown';

  // Clean hostname like tenant.ts does
  const cleanHostname = hostname.split(':')[0]?.replace(/^www\./, '') ?? hostname;

  // Collect all relevant headers for debugging
  const allHeaders: Record<string, string | null> = {};
  const headerNames = ['host', 'x-forwarded-host', 'x-forwarded-for', 'x-original-host', 'cf-connecting-ip', 'x-real-ip', 'forwarded', 'x-forwarded-proto'];
  for (const name of headerNames) {
    allHeaders[name] = headersList.get(name);
  }

  const result: Record<string, unknown> = {
    allHeaders,
    resolvedHostname: hostname,
    cleanHostname,
    timestamp: new Date().toISOString(),
  };

  // Check if it matches preview/dev patterns
  if (
    cleanHostname === 'localhost' ||
    cleanHostname.includes('127.0.0.1') ||
    cleanHostname.includes('.vercel.app') ||
    cleanHostname.includes('.herokuapp.com')
  ) {
    result['matchedPattern'] = 'development/preview';
    result['wouldReturnDefault'] = true;
    return NextResponse.json(result);
  }

  result['matchedPattern'] = 'custom domain';
  result['attemptingDbLookup'] = true;

  try {
    const { prisma } = await import('@experience-marketplace/database');
    result['prismaImported'] = true;

    // Try to find the domain - use same pattern as tenant.ts
    const domain = await prisma.domain.findUnique({
      where: { domain: cleanHostname },
      include: {
        site: {
          include: {
            brand: true,
          },
        },
      },
    });

    if (domain) {
      result['domainFound'] = true;
      result['domainData'] = {
        id: domain.id,
        domain: domain.domain,
        siteId: domain.siteId,
      };
      if (domain.site) {
        result['site'] = {
          id: domain.site.id,
          name: domain.site.name,
          slug: domain.site.slug,
          status: domain.site.status,
        };
      }
    } else {
      result['domainFound'] = false;

      // Try slug-based fallback
      const subdomain = cleanHostname.split('.')[0];
      result['fallbackSubdomain'] = subdomain;

      if (subdomain) {
        const site = await prisma.site.findUnique({
          where: { slug: subdomain },
          include: { brand: true },
        });

        if (site) {
          result['fallbackSiteFound'] = true;
          result['site'] = {
            id: site.id,
            name: site.name,
            slug: site.slug,
            status: site.status,
          };
        } else {
          result['fallbackSiteFound'] = false;
        }
      }
    }
  } catch (error) {
    result['error'] = error instanceof Error ? error.message : String(error);
    result['errorStack'] = error instanceof Error ? error.stack : undefined;
  }

  return NextResponse.json(result);
}
