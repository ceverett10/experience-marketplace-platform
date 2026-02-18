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

interface NonBlogCaptionRequest {
  siteId: string;
  platform: SocialPlatform;
  brandName: string;
  tagline?: string | null;
  seoConfig: Record<string, unknown> | null;
  primaryDomain?: string | null;
}

interface NonBlogCaptionResult {
  caption: string;
  hashtags: string[];
  pinTitle?: string;
  linkUrl?: string;
}

const PLATFORM_LIMITS: Record<SocialPlatform, { maxCaption: number; maxHashtags: number }> = {
  PINTEREST: { maxCaption: 500, maxHashtags: 5 },
  FACEBOOK: { maxCaption: 500, maxHashtags: 5 },
  TWITTER: { maxCaption: 240, maxHashtags: 3 }, // 280 - ~40 for link
};

/**
 * Generate a platform-specific social media caption from a blog post (blog_promo).
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
  const blogUrl = site.primaryDomain ? `https://${site.primaryDomain}/${page.slug}` : undefined;

  // Extract first ~500 chars of body for context
  const bodyExcerpt = page.content?.body
    ? page.content.body
        .replace(/#{1,6}\s/g, '') // Remove markdown headers
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links
        .replace(/[*_~`]/g, '') // Remove markdown formatting
        .substring(0, 500)
    : '';

  const limits = PLATFORM_LIMITS[platform];

  const prompt = buildBlogPromoPrompt({
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

  const text = await callClaude(prompt);
  return parseResponse(text, platform);
}

/**
 * Generate an engagement post — a question or poll prompt related to the site's niche.
 * No blog link required.
 */
export async function generateEngagementCaption(
  request: NonBlogCaptionRequest
): Promise<NonBlogCaptionResult> {
  const { platform, brandName, tagline, seoConfig } = request;
  const toneOfVoice = seoConfig?.['toneOfVoice'] as Record<string, unknown> | undefined;
  const niche =
    (seoConfig?.['niche'] as string) ||
    (seoConfig?.['primaryCategory'] as string) ||
    'travel experiences';
  const limits = PLATFORM_LIMITS[platform];

  const prompt = `You are a social media manager for "${brandName}"${tagline ? ` (${tagline})` : ''}, a travel experiences brand focused on ${niche}.
${(toneOfVoice?.['personality'] as string[] | undefined)?.length ? `Brand tone: ${(toneOfVoice?.['personality'] as string[]).join(', ')}.` : 'Tone: friendly, conversational, travel-enthusiast.'}

Create an ENGAGEMENT post for ${platform} that sparks conversation. This is NOT promoting a specific article — it's designed to get followers talking.

Ideas for engagement posts:
- Ask a travel-related question ("What's your dream destination?" / "Have you tried [niche activity]?")
- This-or-that choices ("Beach holiday or mountain adventure?")
- Fill in the blank ("The best part of travelling is ___")
- Share a fun travel fact and ask for reactions
- Ask followers to tag a friend they'd travel with

Rules:
- Caption must be under ${limits.maxCaption} characters
- Include exactly ${limits.maxHashtags} relevant hashtags specific to ${niche}
- Do NOT include any URLs
- Make it feel authentic and conversational, not corporate
- End with a question or prompt that invites replies

Format your response EXACTLY as:
CAPTION: [your caption here]
HASHTAGS: #tag1 #tag2 #tag3${platform === 'PINTEREST' ? '\nTITLE: [pin title here]' : ''}`;

  const text = await callClaude(prompt);
  const result = parseResponse(text, platform);
  return { ...result, linkUrl: undefined };
}

/**
 * Generate a travel tip post — a practical tip related to the site's niche.
 * Optionally links to a relevant blog post.
 */
export async function generateTravelTipCaption(
  request: NonBlogCaptionRequest
): Promise<NonBlogCaptionResult> {
  const { siteId, platform, brandName, tagline, seoConfig, primaryDomain } = request;
  const toneOfVoice = seoConfig?.['toneOfVoice'] as Record<string, unknown> | undefined;
  const niche =
    (seoConfig?.['niche'] as string) ||
    (seoConfig?.['primaryCategory'] as string) ||
    'travel experiences';
  const limits = PLATFORM_LIMITS[platform];

  // Find a recent blog post to optionally link
  const recentBlog = await prisma.page.findFirst({
    where: { siteId, type: 'BLOG', status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    select: { title: true, slug: true },
  });

  const blogUrl =
    recentBlog && primaryDomain ? `https://${primaryDomain}/${recentBlog.slug}` : undefined;

  const prompt = `You are a social media manager for "${brandName}"${tagline ? ` (${tagline})` : ''}, a travel experiences brand focused on ${niche}.
${(toneOfVoice?.['personality'] as string[] | undefined)?.length ? `Brand tone: ${(toneOfVoice?.['personality'] as string[]).join(', ')}.` : 'Tone: friendly, expert, helpful.'}

Create a TRAVEL TIP post for ${platform}. Share a practical, useful tip related to ${niche}.

Guidelines:
- Start with "Pro tip:" or a similar hook
- Share genuinely useful advice (booking tips, packing tips, best times to visit, money-saving tricks, insider knowledge)
- Keep it specific and actionable, not generic
- Make the reader feel like they're getting insider knowledge
${recentBlog ? `- You can reference this related article: "${recentBlog.title}"` : ''}

Rules:
- Caption must be under ${limits.maxCaption} characters
- Include exactly ${limits.maxHashtags} relevant hashtags specific to ${niche}
- Do NOT include any URLs in the caption (links are added separately)
- Sound like a knowledgeable friend, not a textbook

Format your response EXACTLY as:
CAPTION: [your caption here]
HASHTAGS: #tag1 #tag2 #tag3${platform === 'PINTEREST' ? '\nTITLE: [pin title here]' : ''}`;

  const text = await callClaude(prompt);
  const result = parseResponse(text, platform);
  return { ...result, linkUrl: blogUrl };
}

interface MicrositeBlogPromoRequest {
  siteId: string;
  platform: SocialPlatform;
  brandName: string;
  tagline?: string | null;
  seoConfig: Record<string, unknown> | null;
  micrositeName: string;
  blogTitle: string;
  blogSummary: string;
  bodyExcerpt: string;
  blogUrl: string;
}

/**
 * Generate a caption promoting a microsite's blog post from the main site's account.
 * Frames the content as a specialist recommendation from the network.
 */
export async function generateMicrositeBlogPromoCaption(
  request: MicrositeBlogPromoRequest
): Promise<NonBlogCaptionResult> {
  const {
    platform,
    brandName,
    tagline,
    seoConfig,
    micrositeName,
    blogTitle,
    blogSummary,
    bodyExcerpt,
    blogUrl,
  } = request;
  const toneOfVoice = seoConfig?.['toneOfVoice'] as Record<string, unknown> | undefined;
  const niche =
    (seoConfig?.['niche'] as string) ||
    (seoConfig?.['primaryCategory'] as string) ||
    'travel experiences';
  const limits = PLATFORM_LIMITS[platform];

  const platformInstructions: Record<SocialPlatform, string> = {
    PINTEREST: `Create a Pinterest pin description that inspires users to save and click through.
Include a clear call-to-action. Pinterest users love tips, lists, and aspirational content.
Also provide a short pin TITLE (max 100 chars) on its own line starting with "TITLE:".`,
    FACEBOOK: `Create a Facebook post that encourages engagement (likes, comments, shares).
Start with a hook question or interesting fact. Keep it conversational and warm.`,
    TWITTER: `Create a tweet that's engaging and concise. Must be under ${limits.maxCaption} characters.
Use a hook, interesting stat, or question. Be punchy and direct.
The link will be appended automatically - don't include it in the text.`,
  };

  const prompt = `You are a social media manager for "${brandName}"${tagline ? ` (${tagline})` : ''}, a travel experiences brand focused on ${niche}.
${(toneOfVoice?.['personality'] as string[] | undefined)?.length ? `Brand tone: ${(toneOfVoice?.['personality'] as string[]).join(', ')}.` : 'Tone: friendly, expert, travel-enthusiast.'}

Create a post for ${platform} promoting this article from ${micrositeName}, one of the specialist experience providers in your network:
- Title: "${blogTitle}"
- Summary: ${blogSummary}
- Content preview: ${bodyExcerpt}

${platformInstructions[platform]}

Guidelines:
- Present this as a curated recommendation — you're sharing great content from a specialist
- Focus on the value readers will get from the article
- Mention ${micrositeName} naturally (e.g., "The team at ${micrositeName} share their insider tips on..." or "Great guide from ${micrositeName}...")
- Make readers want to click through and read

Rules:
- Caption must be under ${limits.maxCaption} characters
- Include exactly ${limits.maxHashtags} relevant hashtags specific to the content
- Do NOT include any URLs in the caption (links are added separately)
- Sound like a genuine recommendation, not an ad

Format your response EXACTLY as:
CAPTION: [your caption here]
HASHTAGS: #tag1 #tag2 #tag3${platform === 'PINTEREST' ? '\nTITLE: [pin title here]' : ''}`;

  const text = await callClaude(prompt);
  const result = parseResponse(text, platform);
  return { ...result, linkUrl: blogUrl };
}

interface NetworkAmplificationRequest {
  siteId: string;
  platform: SocialPlatform;
  brandName: string;
  tagline?: string | null;
  seoConfig: Record<string, unknown> | null;
  networkBlogTitle: string;
  networkBlogSummary: string;
  networkSiteName: string;
  blogUrl: string;
}

/**
 * Generate a network amplification caption — promote a blog post from a different
 * microsite in the Experiencess network. Creates cross-promotion social signals.
 */
export async function generateNetworkAmplificationCaption(
  request: NetworkAmplificationRequest
): Promise<NonBlogCaptionResult> {
  const {
    platform,
    brandName,
    tagline,
    seoConfig,
    networkBlogTitle,
    networkBlogSummary,
    networkSiteName,
  } = request;
  const toneOfVoice = seoConfig?.['toneOfVoice'] as Record<string, unknown> | undefined;
  const niche =
    (seoConfig?.['niche'] as string) ||
    (seoConfig?.['primaryCategory'] as string) ||
    'travel experiences';
  const limits = PLATFORM_LIMITS[platform];

  const prompt = `You are a social media manager for "${brandName}"${tagline ? ` (${tagline})` : ''}, a travel experiences brand focused on ${niche}.
${(toneOfVoice?.['personality'] as string[] | undefined)?.length ? `Brand tone: ${(toneOfVoice?.['personality'] as string[]).join(', ')}.` : 'Tone: friendly, collaborative, community-oriented.'}

Create a NETWORK AMPLIFICATION post for ${platform}. You are promoting a blog article from "${networkSiteName}", a partner in your travel experiences network.

Article to promote:
- Title: "${networkBlogTitle}"
- Summary: ${networkBlogSummary || 'A great article from our network partner.'}

Guidelines:
- Frame this as a genuine recommendation from your brand ("Our friends at ${networkSiteName} have a great piece on...", "Loved this article from ${networkSiteName}...")
- Make it feel natural and collaborative, NOT like a paid promotion
- Highlight what readers will learn or discover
- Mention ${networkSiteName} by name as a fellow travel expert
- Keep the tone warm and community-focused

Rules:
- Caption must be under ${limits.maxCaption} characters
- Include exactly ${limits.maxHashtags} relevant hashtags (mix of niche-specific and travel)
- Do NOT include any URLs in the caption (links are added separately)
- Sound like a genuine recommendation, not corporate cross-promotion

Format your response EXACTLY as:
CAPTION: [your caption here]
HASHTAGS: #tag1 #tag2 #tag3${platform === 'PINTEREST' ? '\nTITLE: [pin title here]' : ''}`;

  const text = await callClaude(prompt);
  const result = parseResponse(text, platform);
  return { ...result, linkUrl: request.blogUrl };
}

/**
 * Call Claude Haiku API with a prompt.
 */
async function callClaude(prompt: string): Promise<string> {
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

  return data.content[0]?.text || '';
}

function buildBlogPromoPrompt(ctx: {
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

  const toneInstruction =
    ctx.tonePersonality.length > 0
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
