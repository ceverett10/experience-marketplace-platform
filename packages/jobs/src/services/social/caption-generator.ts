import { prisma } from '@experience-marketplace/database';
import { circuitBreakers } from '../../errors/circuit-breaker';

type SocialPlatform = 'PINTEREST' | 'FACEBOOK' | 'TWITTER';

interface CaptionRequest {
  siteId: string;
  pageId: string;
  platform: SocialPlatform;
}

interface CaptionResult {
  caption: string;
  hashtags: string[];
  pinTitle?: string; // Pinterest only
}

const PLATFORM_LIMITS: Record<SocialPlatform, { maxCaption: number; maxHashtags: number }> = {
  PINTEREST: { maxCaption: 500, maxHashtags: 5 },
  FACEBOOK: { maxCaption: 500, maxHashtags: 5 },
  TWITTER: { maxCaption: 240, maxHashtags: 3 }, // 280 - ~40 for link
};

/**
 * Generate a platform-specific social media caption from a blog post.
 * Uses Claude Haiku for fast, cheap generation.
 */
export async function generateCaption(request: CaptionRequest): Promise<CaptionResult> {
  const { siteId, pageId, platform } = request;

  // Fetch page + content + brand info
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      title: true,
      metaDescription: true,
      slug: true,
      content: {
        select: {
          body: true,
        },
      },
      site: {
        select: {
          name: true,
          primaryDomain: true,
          seoConfig: true,
          brand: {
            select: {
              name: true,
              tagline: true,
            },
          },
        },
      },
    },
  });

  if (!page) {
    throw new Error(`Page ${pageId} not found`);
  }

  const site = page.site;
  if (!site) {
    throw new Error(`Page ${pageId} has no associated site`);
  }

  const seoConfig = site.seoConfig as Record<string, unknown> | null;
  const toneOfVoice = seoConfig?.['toneOfVoice'] as Record<string, unknown> | undefined;
  const blogUrl = site.primaryDomain
    ? `https://${site.primaryDomain}/${page.slug}`
    : undefined;

  // Extract first ~500 chars of body for context
  const bodyExcerpt = page.content?.body
    ? page.content.body
        .replace(/#{1,6}\s/g, '') // Remove markdown headers
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links
        .replace(/[*_~`]/g, '') // Remove markdown formatting
        .substring(0, 500)
    : '';

  const limits = PLATFORM_LIMITS[platform];

  const prompt = buildPrompt({
    platform,
    brandName: site.brand?.name || site.name,
    tagline: site.brand?.tagline,
    tonePersonality: (toneOfVoice?.['personality'] as string[]) || [],
    blogTitle: page.title,
    blogSummary: page.metaDescription || '',
    bodyExcerpt,
    blogUrl,
    maxCaption: limits.maxCaption,
    maxHashtags: limits.maxHashtags,
  });

  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const breaker = circuitBreakers.getBreaker('anthropic-api', {
    failureThreshold: 3,
    timeout: 30000,
  });

  const response = await breaker.execute(async () => {
    return await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${JSON.stringify(errorData)}`);
  }

  const data = (await response.json()) as {
    content: Array<{ text: string }>;
  };

  const text = data.content[0]?.text || '';
  return parseResponse(text, platform);
}

function buildPrompt(ctx: {
  platform: SocialPlatform;
  brandName: string;
  tagline?: string | null;
  tonePersonality: string[];
  blogTitle: string;
  blogSummary: string;
  bodyExcerpt: string;
  blogUrl?: string;
  maxCaption: number;
  maxHashtags: number;
}): string {
  const platformInstructions: Record<SocialPlatform, string> = {
    PINTEREST: `Create a Pinterest pin description that inspires users to save and click through.
Include a clear call-to-action. Pinterest users love tips, lists, and aspirational content.
Also provide a short pin TITLE (max 100 chars) on its own line starting with "TITLE:".`,

    FACEBOOK: `Create a Facebook post that encourages engagement (likes, comments, shares).
Start with a hook question or interesting fact. Keep it conversational and warm.
Include a clear call-to-action to read the full article.`,

    TWITTER: `Create a tweet that's engaging and concise. Must be under ${ctx.maxCaption} characters (excluding link).
Use a hook, interesting stat, or question. Be punchy and direct.
The link will be appended automatically - don't include it in the text.`,
  };

  const toneInstruction = ctx.tonePersonality.length > 0
    ? `Brand tone: ${ctx.tonePersonality.join(', ')}.`
    : 'Tone: friendly, professional, travel-enthusiast.';

  return `You are a social media manager for "${ctx.brandName}"${ctx.tagline ? ` (${ctx.tagline})` : ''}, a travel experiences brand.
${toneInstruction}

Create a ${ctx.platform} post promoting this blog article:
- Title: "${ctx.blogTitle}"
- Summary: ${ctx.blogSummary}
- Content preview: ${ctx.bodyExcerpt}

${platformInstructions[ctx.platform]}

Rules:
- Caption must be under ${ctx.maxCaption} characters
- Include exactly ${ctx.maxHashtags} relevant travel/experience hashtags
- Do NOT include the URL in the caption (it will be added separately)
- Do NOT use generic hashtags like #travel - be specific to the content

Format your response EXACTLY as:
CAPTION: [your caption here]
HASHTAGS: #tag1 #tag2 #tag3${ctx.platform === 'PINTEREST' ? '\nTITLE: [pin title here]' : ''}`;
}

function parseResponse(text: string, platform: SocialPlatform): CaptionResult {
  const captionMatch = text.match(/CAPTION:\s*(.+?)(?=\nHASHTAGS:|\n\n|$)/s);
  const hashtagsMatch = text.match(/HASHTAGS:\s*(.+?)(?=\nTITLE:|\n\n|$)/s);
  const titleMatch = text.match(/TITLE:\s*(.+?)(?=\n|$)/);

  const caption = captionMatch?.[1]?.trim() || text.trim();
  const hashtagsRaw = hashtagsMatch?.[1]?.trim() || '';
  const hashtags = hashtagsRaw
    .split(/\s+/)
    .filter((tag) => tag.startsWith('#'))
    .map((tag) => tag.replace(/^#/, ''));

  const result: CaptionResult = { caption, hashtags };

  if (platform === 'PINTEREST' && titleMatch?.[1]) {
    result.pinTitle = titleMatch[1].trim().substring(0, 100);
  }

  return result;
}
