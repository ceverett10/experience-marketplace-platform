import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';

  // Block indexing for non-production hostnames (Heroku, Vercel, localhost).
  // Google discovers .herokuapp.com via CNAME chains and Certificate Transparency
  // logs — if we serve a permissive robots.txt it will index the raw app URL.
  const cleanHostname = hostname.split(':')[0] ?? hostname;
  if (
    cleanHostname.includes('.herokuapp.com') ||
    cleanHostname.includes('.vercel.app') ||
    cleanHostname === 'localhost' ||
    cleanHostname.includes('127.0.0.1')
  ) {
    return {
      rules: [{ userAgent: '*', disallow: ['/'] }],
    };
  }

  const site = await getSiteFromHostname(hostname);

  const baseUrl = site.primaryDomain ? `https://${site.primaryDomain}` : `https://${hostname}`;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/_next/', '/private/', '/checkout/', '/booking/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/api/', '/admin/'],
      },
      // Allow AI search/assistant bots — these serve your content in AI-generated answers
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
        disallow: ['/api/', '/admin/', '/checkout/', '/booking/'],
      },
      {
        userAgent: 'OAI-SearchBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/checkout/', '/booking/'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/checkout/', '/booking/'],
      },
      {
        userAgent: 'Claude-User',
        allow: '/',
        disallow: ['/api/', '/admin/', '/checkout/', '/booking/'],
      },
      {
        userAgent: 'Claude-SearchBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/checkout/', '/booking/'],
      },
      // Block AI training/scraping bots — protect content from being used as training data
      {
        userAgent: 'GPTBot',
        disallow: ['/'],
      },
      {
        userAgent: 'ClaudeBot',
        disallow: ['/'],
      },
      {
        userAgent: 'anthropic-ai',
        disallow: ['/'],
      },
      {
        userAgent: 'Google-Extended',
        disallow: ['/'],
      },
      {
        userAgent: 'CCBot',
        disallow: ['/'],
      },
      {
        userAgent: 'Meta-ExternalAgent',
        disallow: ['/'],
      },
      {
        userAgent: 'Bytespider',
        disallow: ['/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
