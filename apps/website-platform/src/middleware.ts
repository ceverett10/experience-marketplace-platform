/**
 * Multi-tenant Middleware
 * Handles domain-based site identification and routing
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Cookie name for site configuration
const SITE_CONFIG_COOKIE = 'x-site-id';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? 'localhost';
  const response = NextResponse.next();

  // Extract site identifier from hostname
  const siteId = getSiteIdFromHostname(hostname);

  // Set site ID in cookie for server components to access
  response.cookies.set(SITE_CONFIG_COOKIE, siteId, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    path: '/',
  });

  // Add site ID to headers for API routes
  response.headers.set('x-site-id', siteId);

  return response;
}

/**
 * Extract site identifier from hostname
 * Supports:
 * - Custom domains (london-tours.com -> lookup by domain)
 * - Subdomains (london-tours.marketplace.com -> london-tours)
 * - Development (localhost -> default)
 */
function getSiteIdFromHostname(hostname: string): string {
  // Remove port and www prefix
  const cleanHostname = hostname.split(':')[0]?.replace(/^www\./, '') ?? hostname;

  // Development environments
  if (cleanHostname === 'localhost' || cleanHostname.includes('127.0.0.1')) {
    return 'default';
  }

  // Preview deployments
  if (cleanHostname.includes('.vercel.app') || cleanHostname.includes('.herokuapp.com')) {
    // Check for subdomain in preview URLs (e.g., london-tours--preview.vercel.app)
    const parts = cleanHostname.split('--');
    if (parts.length > 1 && parts[0]) {
      return parts[0];
    }
    return 'default';
  }

  // Subdomain-based routing (site-slug.marketplace.com)
  const baseDomains = [
    'experience-marketplace.com',
    'marketplace.holibob.com',
    // Add more base domains as needed
  ];

  for (const baseDomain of baseDomains) {
    if (cleanHostname.endsWith(`.${baseDomain}`)) {
      const subdomain = cleanHostname.replace(`.${baseDomain}`, '');
      return subdomain;
    }
  }

  // Custom domain - use the full hostname as identifier
  // The tenant.ts getSiteFromHostname will do the actual DB lookup
  return cleanHostname;
}

export const config = {
  matcher: [
    // Match all paths except static files and API routes that don't need tenant context
    '/((?!_next/static|_next/image|favicon.ico|api/health).*)',
  ],
};
