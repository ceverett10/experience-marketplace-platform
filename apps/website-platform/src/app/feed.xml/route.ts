import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';

/**
 * RSS Feed for Blog Posts
 * Generates an RSS 2.0 compliant feed for SEO and syndication
 */
export async function GET() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const baseUrl = site.primaryDomain ? `https://${site.primaryDomain}` : `https://${hostname}`;

  // Fetch published blog posts
  const posts = await prisma.page.findMany({
    where: {
      siteId: site.id,
      type: 'BLOG',
      status: 'PUBLISHED',
    },
    include: {
      content: {
        select: {
          body: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50, // Limit to 50 most recent posts
  });

  // Generate RSS feed
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(site.name)} - Travel Blog</title>
    <description>${escapeXml(site.description || `Travel guides and tips from ${site.name}`)}</description>
    <link>${baseUrl}/blog</link>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Experience Marketplace Platform</generator>
    <image>
      <url>${site.brand?.logoUrl ? `${baseUrl}${site.brand.logoUrl}` : `${baseUrl}/favicon.ico`}</url>
      <title>${escapeXml(site.name)}</title>
      <link>${baseUrl}</link>
    </image>
${posts
  .map(
    (post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${baseUrl}/blog/${post.slug}</link>
      <guid isPermaLink="true">${baseUrl}/blog/${post.slug}</guid>
      <description>${escapeXml(post.metaDescription || generateExcerpt(post.content?.body || ''))}</description>
      <pubDate>${new Date(post.createdAt).toUTCString()}</pubDate>
      ${post.content?.body ? `<content:encoded><![CDATA[${convertMarkdownToHtml(post.content.body)}]]></content:encoded>` : ''}
    </item>`
  )
  .join('\n')}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate excerpt from markdown content
 */
function generateExcerpt(body: string, maxLength: number = 200): string {
  const plainText = body
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  if (plainText.length <= maxLength) return plainText;
  return plainText.substring(0, maxLength).trim() + '...';
}

/**
 * Basic markdown to HTML conversion for RSS content
 */
function convertMarkdownToHtml(markdown: string): string {
  let html = markdown
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    // Lists
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p>')
    // Line breaks
    .replace(/\n/g, '<br />');

  // Wrap in paragraphs if there's content
  if (html.trim()) {
    html = '<p>' + html + '</p>';
  }

  return html;
}
