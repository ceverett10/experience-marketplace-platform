/**
 * Multi-tenant Middleware
 * Handles domain-based site identification and routing
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Cookie name for site configuration
const SITE_CONFIG_COOKIE = 'x-site-id';

// AI referral source domains — used to track traffic from LLM-powered search
const AI_REFERRAL_SOURCES: Record<string, string> = {
  'chat.openai.com': 'chatgpt',
  'chatgpt.com': 'chatgpt',
  'perplexity.ai': 'perplexity',
  'claude.ai': 'claude',
  'gemini.google.com': 'gemini',
  'copilot.microsoft.com': 'copilot',
  'bing.com/chat': 'copilot',
  'you.com': 'you',
  'phind.com': 'phind',
};

export function middleware(request: NextRequest) {
  // On Heroku/Cloudflare, use x-forwarded-host to get the actual external domain
  const hostname =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost';
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

  // Track AI referral sources — set a cookie when traffic comes from an LLM platform
  // so GA4 and analytics can attribute the session to an AI source
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererHost = new URL(referer).hostname;
      for (const [domain, source] of Object.entries(AI_REFERRAL_SOURCES)) {
        if (refererHost === domain || refererHost.endsWith(`.${domain}`)) {
          response.cookies.set('ai_referral_source', source, {
            httpOnly: false, // Readable by client-side analytics (GA4)
            secure: process.env['NODE_ENV'] === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 30, // 30-minute attribution window
          });
          response.headers.set('x-ai-referral', source);
          break;
        }
      }
    } catch {
      // Invalid referer URL — ignore
    }
  }

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
