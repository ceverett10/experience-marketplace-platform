import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import type {
  JobResult,
  SocialDailyPostingPayload,
  SocialPostGeneratePayload,
  SocialPostPublishPayload,
} from '../types';
import { addJob } from '../queues';
import {
  generateCaption,
  generateEngagementCaption,
  generateTravelTipCaption,
  generateNetworkAmplificationCaption,
  generateMicrositeBlogPromoCaption,
} from '../services/social/caption-generator';
import { selectImageForPost } from '../services/social/image-selector';
import { refreshTokenIfNeeded } from '../services/social/token-refresh';
import {
  createPinterestPin,
  findOrCreatePinterestBoard,
} from '../services/social/pinterest-client';
import { createFacebookPost, getPageAccessToken } from '../services/social/facebook-client';
import { createTweet } from '../services/social/twitter-client';
import { canExecuteAutonomousOperation } from '../services/pause-control';

type SocialPlatform = 'PINTEREST' | 'FACEBOOK' | 'TWITTER';
type ContentType =
  | 'blog_promo'
  | 'engagement'
  | 'travel_tip'
  | 'network_amplification'
  | 'microsite_blog_promo';

const MAX_POSTS_PER_DAY = 7; // Per platform account per day
const PEAK_START_HOUR = 9; // 9 AM local
const PEAK_END_HOUR = 19; // 7 PM local
const JITTER_MINUTES = 15;

/**
 * SOCIAL_DAILY_POSTING - Smart staggered fan-out job
 * Runs at 5 AM UTC. Groups sites by shared platform account, caps at 7 posts/day,
 * distributes posting times across each site's local peak hours (9 AM – 7 PM).
 */
export async function handleSocialDailyPosting(
  job: Job<SocialDailyPostingPayload>
): Promise<JobResult> {
  const { siteId } = job.data;

  console.log('[Social] Starting smart daily social posting');

  // Find sites with active social accounts
  const whereClause: Record<string, unknown> = {
    status: 'ACTIVE',
    socialAccounts: { some: { isActive: true } },
  };

  if (siteId) {
    whereClause['id'] = siteId;
  }

  const sites = await prisma.site.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      timezone: true,
      autonomousProcessesPaused: true,
      socialAccounts: {
        where: { isActive: true },
        select: {
          id: true,
          platform: true,
          accountId: true,
          lastPostedAt: true,
        },
      },
    },
  });

  // Group by shared platform account (same accountId + platform)
  // This handles multiple sites sharing the same Facebook Page or X account
  const accountGroups = new Map<
    string,
    Array<{
      siteId: string;
      siteName: string;
      timezone: string;
      accountDbId: string;
      platform: SocialPlatform;
      lastPostedAt: Date | null;
    }>
  >();

  for (const site of sites) {
    if (site.autonomousProcessesPaused) {
      console.log(`[Social] Skipping ${site.name} (autonomous processes paused)`);
      continue;
    }

    for (const account of site.socialAccounts) {
      const groupKey = `${account.platform}:${account.accountId}`;
      if (!accountGroups.has(groupKey)) {
        accountGroups.set(groupKey, []);
      }
      accountGroups.get(groupKey)!.push({
        siteId: site.id,
        siteName: site.name,
        timezone: site.timezone,
        accountDbId: account.id,
        platform: account.platform as SocialPlatform,
        lastPostedAt: account.lastPostedAt,
      });
    }
  }

  let totalQueued = 0;
  let totalDeferred = 0;
  const scheduledDetails: Array<{
    site: string;
    platform: string;
    delayMin: number;
    contentType: string;
  }> = [];

  for (const [groupKey, groupSites] of accountGroups) {
    // Sort by lastPostedAt ASC — sites that haven't posted recently go first
    groupSites.sort((a, b) => {
      const aTime = a.lastPostedAt?.getTime() ?? 0;
      const bTime = b.lastPostedAt?.getTime() ?? 0;
      return aTime - bTime;
    });

    // Select top N sites for today (cap at MAX_POSTS_PER_DAY)
    const todaySites = groupSites.slice(0, MAX_POSTS_PER_DAY);
    const deferredSites = groupSites.slice(MAX_POSTS_PER_DAY);

    if (deferredSites.length > 0) {
      console.log(
        `[Social] ${groupKey}: Deferring ${deferredSites.length} sites to tomorrow: ${deferredSites.map((s) => s.siteName).join(', ')}`
      );
      totalDeferred += deferredSites.length;
    }

    // Determine content type rotation for each site
    const contentTypes = await getContentTypeRotation(todaySites.map((s) => s.siteId));

    // Calculate posting times across the day
    const postingSlots = calculatePostingSlots(todaySites.length);

    for (let i = 0; i < todaySites.length; i++) {
      const site = todaySites[i]!;
      const contentType = contentTypes.get(site.siteId) || 'blog_promo';

      // Calculate delay from now to the posting time in the site's timezone
      const delayMs = calculateDelayForSlot(postingSlots[i]!, site.timezone);

      if (delayMs < 0) {
        // Slot is in the past — post with minimal delay
        console.log(`[Social] ${site.siteName}/${site.platform}: Slot in past, using 1-min delay`);
      }

      const actualDelay = Math.max(60 * 1000, delayMs); // Minimum 1 minute

      try {
        await addJob(
          'SOCIAL_POST_GENERATE',
          {
            siteId: site.siteId,
            platform: site.platform,
            contentType,
          } as SocialPostGeneratePayload,
          { priority: 5, attempts: 2, delay: actualDelay }
        );
        totalQueued++;
        const delayMin = Math.round(actualDelay / 60000);
        scheduledDetails.push({
          site: site.siteName,
          platform: site.platform,
          delayMin,
          contentType,
        });
        console.log(
          `[Social] Scheduled ${site.siteName}/${site.platform} — ${contentType} in ${delayMin} min`
        );
      } catch (err) {
        console.warn(`[Social] Failed to queue post for ${site.siteName}/${site.platform}:`, err);
      }
    }
  }

  // --- Microsite blog promo: 2 posts per account group per day ---
  const MICROSITE_POSTS_PER_DAY = 2;
  let micrositeQueued = 0;

  for (const [groupKey, groupSites] of accountGroups) {
    // Use the first non-paused site in the group as the posting site
    const postingSite = groupSites.find((s) => {
      const original = sites.find((site) => site.id === s.siteId);
      return original && !original.autonomousProcessesPaused;
    });

    if (!postingSite) continue;

    // Schedule 2 microsite blog promo posts at different times during peak hours
    const micrositeSlots = calculatePostingSlots(MICROSITE_POSTS_PER_DAY + 2).slice(
      1,
      MICROSITE_POSTS_PER_DAY + 1
    ); // Pick middle slots to avoid overlap with main posts

    for (let i = 0; i < micrositeSlots.length; i++) {
      const delayMs = calculateDelayForSlot(micrositeSlots[i]!, postingSite.timezone);
      const actualDelay = Math.max(60 * 1000, delayMs);

      try {
        await addJob(
          'SOCIAL_POST_GENERATE',
          {
            siteId: postingSite.siteId,
            platform: postingSite.platform,
            contentType: 'microsite_blog_promo' as const,
          } as SocialPostGeneratePayload,
          { priority: 5, attempts: 2, delay: actualDelay }
        );
        micrositeQueued++;
        const delayMin = Math.round(actualDelay / 60000);
        scheduledDetails.push({
          site: postingSite.siteName,
          platform: postingSite.platform,
          delayMin,
          contentType: 'microsite_blog_promo',
        });
        console.log(
          `[Social] Scheduled ${postingSite.siteName}/${postingSite.platform} — microsite_blog_promo in ${delayMin} min`
        );
      } catch (err) {
        console.warn(
          `[Social] Failed to queue microsite blog promo for ${postingSite.siteName}/${postingSite.platform}:`,
          err
        );
      }
    }
  }

  console.log(
    `[Social] Daily posting: scheduled ${totalQueued} site posts + ${micrositeQueued} microsite promos across ${accountGroups.size} account groups (${totalDeferred} sites deferred)`
  );

  return {
    success: true,
    message: `Scheduled ${totalQueued} site posts + ${micrositeQueued} microsite promos (${totalDeferred} deferred)`,
    data: {
      queued: totalQueued,
      micrositeQueued,
      deferred: totalDeferred,
      schedule: scheduledDetails,
    },
    timestamp: new Date(),
  };
}

/**
 * Determine content type for each site based on recent post history.
 * Cycles through: blog_promo → engagement → travel_tip
 */
async function getContentTypeRotation(siteIds: string[]): Promise<Map<string, ContentType>> {
  const rotation: Map<string, ContentType> = new Map();
  const contentCycle: ContentType[] = [
    'blog_promo',
    'engagement',
    'travel_tip',
    'network_amplification',
  ];

  for (const siteId of siteIds) {
    // Count recent posts by content type (last 7 days)
    const recentPosts = await prisma.socialPost.findMany({
      where: {
        siteId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        status: { in: ['PUBLISHED', 'SCHEDULED', 'PUBLISHING'] },
      },
      select: { generationData: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Count by content type
    const counts: Record<ContentType, number> = {
      blog_promo: 0,
      engagement: 0,
      travel_tip: 0,
      network_amplification: 0,
      microsite_blog_promo: 0,
    };
    for (const post of recentPosts) {
      const data = post.generationData as Record<string, unknown> | null;
      const ct = (data?.['contentType'] as ContentType) || 'blog_promo';
      if (ct in counts) counts[ct]++;
    }

    // Pick the content type with the fewest recent posts
    let minCount = Infinity;
    let chosen: ContentType = 'blog_promo';
    for (const ct of contentCycle) {
      if (counts[ct] < minCount) {
        minCount = counts[ct];
        chosen = ct;
      }
    }

    rotation.set(siteId, chosen);
  }

  return rotation;
}

/**
 * Calculate evenly-spaced posting slots within the peak window (9 AM – 7 PM).
 * Returns hours (decimal) within the peak window.
 * Example: 5 posts → [9.0, 11.0, 13.0, 15.0, 17.0]
 */
function calculatePostingSlots(count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [13]; // Noon-ish for single post

  const windowHours = PEAK_END_HOUR - PEAK_START_HOUR; // 10 hours
  const slots: number[] = [];

  for (let i = 0; i < count; i++) {
    const baseHour = PEAK_START_HOUR + (i * windowHours) / count;
    // Add jitter: ±JITTER_MINUTES
    const jitter = ((Math.random() * 2 - 1) * JITTER_MINUTES) / 60;
    slots.push(Math.max(PEAK_START_HOUR, Math.min(PEAK_END_HOUR - 0.5, baseHour + jitter)));
  }

  return slots;
}

/**
 * Calculate delay in ms from now to a target local hour in the given timezone.
 */
function calculateDelayForSlot(targetLocalHour: number, timezone: string): number {
  const now = new Date();

  // Get the current time in the target timezone
  const localTimeStr = now.toLocaleString('en-US', { timeZone: timezone, hour12: false });
  const localDate = new Date(localTimeStr);
  const currentLocalHour = localDate.getHours() + localDate.getMinutes() / 60;

  // Calculate hours until target
  let hoursUntil = targetLocalHour - currentLocalHour;
  if (hoursUntil < -1) {
    // Target is tomorrow — shouldn't happen since we run at 5 AM UTC
    hoursUntil += 24;
  }

  return Math.round(hoursUntil * 60 * 60 * 1000);
}

/**
 * SOCIAL_POST_GENERATE - Content creation
 * Selects a blog post to promote (or generates engagement/tip content),
 * generates caption and selects image.
 */
export async function handleSocialPostGenerate(
  job: Job<SocialPostGeneratePayload>
): Promise<JobResult> {
  const { siteId, platform, pageId, contentType = 'blog_promo' } = job.data;

  console.log(`[Social] Generating ${platform} ${contentType} post for site ${siteId}`);

  // Check pause control
  const canExecute = await canExecuteAutonomousOperation({ siteId });
  if (!canExecute.allowed) {
    return {
      success: false,
      message: 'Autonomous operations paused for this site',
      timestamp: new Date(),
    };
  }

  // Get the social account
  const account = await prisma.socialAccount.findUnique({
    where: { siteId_platform: { siteId, platform: platform as SocialPlatform } },
  });

  if (!account || !account.isActive) {
    return {
      success: false,
      message: `No active ${platform} account for site ${siteId}`,
      timestamp: new Date(),
    };
  }

  // For engagement and travel_tip content types, we don't need a blog post
  if (contentType === 'engagement' || contentType === 'travel_tip') {
    return await generateNonBlogPost(siteId, platform as SocialPlatform, account.id, contentType);
  }

  // Network amplification: promote a blog from a DIFFERENT related microsite
  if (contentType === 'network_amplification') {
    return await generateNetworkAmplificationPost(siteId, platform as SocialPlatform, account.id);
  }

  // Microsite blog promo: promote a blog post from an active microsite
  if (contentType === 'microsite_blog_promo') {
    return await generateMicrositeBlogPromoPost(siteId, platform as SocialPlatform, account.id);
  }

  // blog_promo: Select a blog post to promote
  let selectedPageId = pageId;

  if (!selectedPageId) {
    // Find most recent published blog post that hasn't been posted to this platform
    const recentBlog = await prisma.page.findFirst({
      where: {
        siteId,
        type: 'BLOG',
        status: 'PUBLISHED',
        socialPosts: {
          none: { platform: platform as SocialPlatform },
        },
      },
      orderBy: { publishedAt: 'desc' },
      select: { id: true },
    });

    if (!recentBlog) {
      // Fallback: find least recently promoted blog post
      const leastPromoted = await prisma.page.findFirst({
        where: {
          siteId,
          type: 'BLOG',
          status: 'PUBLISHED',
        },
        orderBy: {
          socialPosts: { _count: 'asc' },
        },
        select: { id: true },
      });

      selectedPageId = leastPromoted?.id;
    } else {
      selectedPageId = recentBlog.id;
    }
  }

  if (!selectedPageId) {
    // No blog posts — fallback to engagement content
    console.log(`[Social] No blog posts for site ${siteId}, falling back to engagement content`);
    return await generateNonBlogPost(siteId, platform as SocialPlatform, account.id, 'engagement');
  }

  // Generate caption
  const captionResult = await generateCaption({
    siteId,
    pageId: selectedPageId,
    platform: platform as SocialPlatform,
  });

  // Select image
  const imageUrl = await selectImageForPost(siteId, selectedPageId);

  // Get blog URL
  const page = await prisma.page.findUnique({
    where: { id: selectedPageId },
    select: {
      slug: true,
      site: { select: { primaryDomain: true } },
    },
  });

  const blogUrl = page?.site?.primaryDomain
    ? `https://${page.site.primaryDomain}/${page.slug}`
    : undefined;

  // Build full caption (append link for Twitter)
  let fullCaption = captionResult.caption;
  if (platform === 'TWITTER' && blogUrl) {
    const maxTextLen = 280 - blogUrl.length - 1;
    if (fullCaption.length > maxTextLen) {
      fullCaption = fullCaption.substring(0, maxTextLen - 3) + '...';
    }
    fullCaption = `${fullCaption} ${blogUrl}`;
  }

  // Create SocialPost record
  const socialPost = await prisma.socialPost.create({
    data: {
      siteId,
      accountId: account.id,
      pageId: selectedPageId,
      platform: platform as SocialPlatform,
      caption: fullCaption,
      hashtags: captionResult.hashtags,
      mediaUrls: imageUrl ? [imageUrl] : [],
      linkUrl: blogUrl,
      status: 'SCHEDULED',
      scheduledFor: new Date(Date.now() + 60 * 1000), // 1-min delay
      generationData: {
        model: 'claude-haiku-4-5-20251001',
        pinTitle: captionResult.pinTitle,
        rawCaption: captionResult.caption,
        contentType: 'blog_promo',
      },
    },
  });

  // Queue publish job with 1-minute delay
  await addJob('SOCIAL_POST_PUBLISH', { socialPostId: socialPost.id } as SocialPostPublishPayload, {
    delay: 60 * 1000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
  });

  console.log(
    `[Social] Generated ${platform} blog_promo post ${socialPost.id} for "${page?.slug}"`
  );

  return {
    success: true,
    message: `Generated ${platform} blog_promo post, scheduled for publishing`,
    data: {
      socialPostId: socialPost.id,
      platform,
      contentType: 'blog_promo',
      pageId: selectedPageId,
      captionLength: fullCaption.length,
      hasImage: !!imageUrl,
    },
    timestamp: new Date(),
  };
}

/**
 * Generate engagement or travel_tip posts (no blog link required).
 */
async function generateNonBlogPost(
  siteId: string,
  platform: SocialPlatform,
  accountId: string,
  contentType: 'engagement' | 'travel_tip'
): Promise<JobResult> {
  // Get site info for caption generation
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      name: true,
      primaryDomain: true,
      seoConfig: true,
      brand: { select: { name: true, tagline: true } },
    },
  });

  if (!site) {
    return { success: false, message: `Site ${siteId} not found`, timestamp: new Date() };
  }

  // Generate caption based on content type
  const captionFn =
    contentType === 'engagement' ? generateEngagementCaption : generateTravelTipCaption;
  const captionResult = await captionFn({
    siteId,
    platform,
    brandName: site.brand?.name || site.name,
    tagline: site.brand?.tagline,
    seoConfig: site.seoConfig as Record<string, unknown> | null,
    primaryDomain: site.primaryDomain,
  });

  let fullCaption = captionResult.caption;

  // For travel_tip on Twitter, append link if we have one
  if (platform === 'TWITTER' && captionResult.linkUrl) {
    const maxTextLen = 280 - captionResult.linkUrl.length - 1;
    if (fullCaption.length > maxTextLen) {
      fullCaption = fullCaption.substring(0, maxTextLen - 3) + '...';
    }
    fullCaption = `${fullCaption} ${captionResult.linkUrl}`;
  }

  // Select a generic site image
  const imageUrl = await selectImageForPost(siteId);

  const socialPost = await prisma.socialPost.create({
    data: {
      siteId,
      accountId,
      platform,
      caption: fullCaption,
      hashtags: captionResult.hashtags,
      mediaUrls: imageUrl ? [imageUrl] : [],
      linkUrl: captionResult.linkUrl,
      status: 'SCHEDULED',
      scheduledFor: new Date(Date.now() + 60 * 1000),
      generationData: {
        model: 'claude-haiku-4-5-20251001',
        contentType,
        pinTitle: captionResult.pinTitle,
        rawCaption: captionResult.caption,
      },
    },
  });

  await addJob('SOCIAL_POST_PUBLISH', { socialPostId: socialPost.id } as SocialPostPublishPayload, {
    delay: 60 * 1000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
  });

  console.log(
    `[Social] Generated ${platform} ${contentType} post ${socialPost.id} for site ${siteId}`
  );

  return {
    success: true,
    message: `Generated ${platform} ${contentType} post, scheduled for publishing`,
    data: {
      socialPostId: socialPost.id,
      platform,
      contentType,
      captionLength: fullCaption.length,
      hasImage: !!imageUrl,
    },
    timestamp: new Date(),
  };
}

/**
 * Generate a network amplification post — promote a blog from a DIFFERENT related microsite.
 * This drives cross-site referral traffic and creates social signals for the network.
 */
async function generateNetworkAmplificationPost(
  siteId: string,
  platform: SocialPlatform,
  accountId: string
): Promise<JobResult> {
  // Get site info to extract keywords for matching
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      name: true,
      primaryDomain: true,
      seoConfig: true,
      brand: { select: { name: true, tagline: true } },
    },
  });

  if (!site) {
    return { success: false, message: `Site ${siteId} not found`, timestamp: new Date() };
  }

  const seoConfig = site.seoConfig as Record<string, unknown> | null;
  const keywords = (seoConfig?.['keywords'] as string[]) || [];
  const niche =
    (seoConfig?.['niche'] as string) || (seoConfig?.['primaryCategory'] as string) || '';

  // Find active microsites with published blogs
  // Use keyword/niche matching in blog titles for relevance
  const searchTerms = [...keywords.slice(0, 3), niche].filter(Boolean);

  if (searchTerms.length === 0) {
    console.log(
      `[Social] Site ${siteId} has no keywords for network matching, falling back to engagement`
    );
    return await generateNonBlogPost(siteId, platform, accountId, 'engagement');
  }

  // Find recent blog posts from active microsites that match our keywords
  const keywordConditions = searchTerms.map((term) => ({
    title: { contains: term, mode: 'insensitive' as const },
  }));

  const networkBlog = await prisma.page.findFirst({
    where: {
      micrositeId: { not: null },
      type: 'BLOG',
      status: 'PUBLISHED',
      contentId: { not: null },
      OR: keywordConditions,
      microsite: {
        status: 'ACTIVE',
        cachedProductCount: { gt: 0 },
      },
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      slug: true,
      metaDescription: true,
      micrositeId: true,
      microsite: {
        select: {
          fullDomain: true,
          siteName: true,
          id: true,
        },
      },
    },
  });

  if (!networkBlog?.microsite) {
    console.log(`[Social] No matching network blogs for ${siteId}, falling back to engagement`);
    return await generateNonBlogPost(siteId, platform, accountId, 'engagement');
  }

  const targetDomain = networkBlog.microsite.fullDomain;
  const targetSiteName = networkBlog.microsite.siteName;
  const blogUrl = `https://${targetDomain}/${networkBlog.slug}`;

  // Generate caption promoting the network blog
  const captionResult = await generateNetworkAmplificationCaption({
    siteId,
    platform,
    brandName: site.brand?.name || site.name,
    tagline: site.brand?.tagline,
    seoConfig: site.seoConfig as Record<string, unknown> | null,
    networkBlogTitle: networkBlog.title,
    networkBlogSummary: networkBlog.metaDescription || '',
    networkSiteName: targetSiteName,
    blogUrl,
  });

  let fullCaption = captionResult.caption;

  // For Twitter, append link
  if (platform === 'TWITTER' && blogUrl) {
    const maxTextLen = 280 - blogUrl.length - 1;
    if (fullCaption.length > maxTextLen) {
      fullCaption = fullCaption.substring(0, maxTextLen - 3) + '...';
    }
    fullCaption = `${fullCaption} ${blogUrl}`;
  }

  // Select an image from the source site (our site, not the target)
  const imageUrl = await selectImageForPost(siteId);

  const socialPost = await prisma.socialPost.create({
    data: {
      siteId,
      accountId,
      platform,
      caption: fullCaption,
      hashtags: captionResult.hashtags,
      mediaUrls: imageUrl ? [imageUrl] : [],
      linkUrl: blogUrl,
      status: 'SCHEDULED',
      scheduledFor: new Date(Date.now() + 60 * 1000),
      generationData: {
        model: 'claude-haiku-4-5-20251001',
        contentType: 'network_amplification',
        networkSiteId: networkBlog.microsite.id,
        networkSiteName: targetSiteName,
        networkBlogTitle: networkBlog.title,
        pinTitle: captionResult.pinTitle,
        rawCaption: captionResult.caption,
      },
    },
  });

  await addJob('SOCIAL_POST_PUBLISH', { socialPostId: socialPost.id } as SocialPostPublishPayload, {
    delay: 60 * 1000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
  });

  console.log(
    `[Social] Generated ${platform} network_amplification post ${socialPost.id}: promoting "${networkBlog.title}" from ${targetSiteName}`
  );

  return {
    success: true,
    message: `Generated ${platform} network amplification post, promoting ${targetSiteName}`,
    data: {
      socialPostId: socialPost.id,
      platform,
      contentType: 'network_amplification',
      networkSiteName: targetSiteName,
      networkBlogTitle: networkBlog.title,
      captionLength: fullCaption.length,
      hasImage: !!imageUrl,
    },
    timestamp: new Date(),
  };
}

/**
 * Generate a microsite blog promo post — promote a blog from an active microsite.
 * Selects microsites that haven't been promoted recently and posts via the main site's account.
 */
async function generateMicrositeBlogPromoPost(
  siteId: string,
  platform: SocialPlatform,
  accountId: string
): Promise<JobResult> {
  // Get posting site info for brand voice
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      name: true,
      primaryDomain: true,
      seoConfig: true,
      brand: { select: { name: true, tagline: true } },
    },
  });

  if (!site) {
    return { success: false, message: `Site ${siteId} not found`, timestamp: new Date() };
  }

  // Find a published blog from an active microsite that hasn't been promoted recently
  // Prefer blogs not yet posted to this platform, then least promoted
  const micrositeBlog = await prisma.page.findFirst({
    where: {
      micrositeId: { not: null },
      type: 'BLOG',
      status: 'PUBLISHED',
      contentId: { not: null },
      microsite: {
        status: 'ACTIVE',
        cachedProductCount: { gt: 0 },
      },
      // Prefer blogs not yet promoted via social
      socialPosts: {
        none: {
          platform,
          generationData: { path: ['contentType'], equals: 'microsite_blog_promo' },
        },
      },
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      slug: true,
      metaDescription: true,
      micrositeId: true,
      content: { select: { body: true } },
      microsite: {
        select: {
          fullDomain: true,
          siteName: true,
          id: true,
        },
      },
    },
  });

  // Fallback: least promoted microsite blog
  const selectedBlog =
    micrositeBlog ||
    (await prisma.page.findFirst({
      where: {
        micrositeId: { not: null },
        type: 'BLOG',
        status: 'PUBLISHED',
        contentId: { not: null },
        microsite: {
          status: 'ACTIVE',
          cachedProductCount: { gt: 0 },
        },
      },
      orderBy: [{ socialPosts: { _count: 'asc' } }, { publishedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        slug: true,
        metaDescription: true,
        micrositeId: true,
        content: { select: { body: true } },
        microsite: {
          select: {
            fullDomain: true,
            siteName: true,
            id: true,
          },
        },
      },
    }));

  if (!selectedBlog?.microsite) {
    console.log(`[Social] No microsite blogs available, falling back to engagement`);
    return await generateNonBlogPost(siteId, platform, accountId, 'engagement');
  }

  const targetDomain = selectedBlog.microsite.fullDomain;
  const targetSiteName = selectedBlog.microsite.siteName;
  const blogUrl = `https://${targetDomain}/${selectedBlog.slug}`;

  // Extract body excerpt for caption generation
  const bodyExcerpt = selectedBlog.content?.body
    ? selectedBlog.content.body
        .replace(/#{1,6}\s/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_~`]/g, '')
        .substring(0, 500)
    : '';

  // Generate caption
  const captionResult = await generateMicrositeBlogPromoCaption({
    siteId,
    platform,
    brandName: site.brand?.name || site.name,
    tagline: site.brand?.tagline,
    seoConfig: site.seoConfig as Record<string, unknown> | null,
    micrositeName: targetSiteName,
    blogTitle: selectedBlog.title,
    blogSummary: selectedBlog.metaDescription || '',
    bodyExcerpt,
    blogUrl,
  });

  let fullCaption = captionResult.caption;

  // For Twitter, append link
  if (platform === 'TWITTER' && blogUrl) {
    const maxTextLen = 280 - blogUrl.length - 1;
    if (fullCaption.length > maxTextLen) {
      fullCaption = fullCaption.substring(0, maxTextLen - 3) + '...';
    }
    fullCaption = `${fullCaption} ${blogUrl}`;
  }

  // Select image from the microsite's blog or the posting site
  const imageUrl = await selectImageForPost(siteId, selectedBlog.id);

  const socialPost = await prisma.socialPost.create({
    data: {
      siteId,
      accountId,
      pageId: selectedBlog.id,
      platform,
      caption: fullCaption,
      hashtags: captionResult.hashtags,
      mediaUrls: imageUrl ? [imageUrl] : [],
      linkUrl: blogUrl,
      status: 'SCHEDULED',
      scheduledFor: new Date(Date.now() + 60 * 1000),
      generationData: {
        model: 'claude-haiku-4-5-20251001',
        contentType: 'microsite_blog_promo',
        micrositeId: selectedBlog.microsite.id,
        micrositeName: targetSiteName,
        micrositeBlogTitle: selectedBlog.title,
        pinTitle: captionResult.pinTitle,
        rawCaption: captionResult.caption,
      },
    },
  });

  await addJob('SOCIAL_POST_PUBLISH', { socialPostId: socialPost.id } as SocialPostPublishPayload, {
    delay: 60 * 1000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
  });

  console.log(
    `[Social] Generated ${platform} microsite_blog_promo post ${socialPost.id}: promoting "${selectedBlog.title}" from ${targetSiteName}`
  );

  return {
    success: true,
    message: `Generated ${platform} microsite blog promo, promoting ${targetSiteName}`,
    data: {
      socialPostId: socialPost.id,
      platform,
      contentType: 'microsite_blog_promo',
      micrositeName: targetSiteName,
      micrositeBlogTitle: selectedBlog.title,
      captionLength: fullCaption.length,
      hasImage: !!imageUrl,
    },
    timestamp: new Date(),
  };
}

/**
 * SOCIAL_POST_PUBLISH - Actual posting to platform
 * Refreshes token, calls platform API, updates post status.
 */
export async function handleSocialPostPublish(
  job: Job<SocialPostPublishPayload>
): Promise<JobResult> {
  const { socialPostId } = job.data;

  const post = await prisma.socialPost.findUnique({
    where: { id: socialPostId },
    include: {
      account: true,
      site: { select: { name: true } },
    },
  });

  if (!post) {
    return {
      success: false,
      message: `Social post ${socialPostId} not found`,
      timestamp: new Date(),
    };
  }

  if (post.status === 'PUBLISHED') {
    return {
      success: true,
      message: 'Post already published',
      timestamp: new Date(),
    };
  }

  if (post.status === 'CANCELLED') {
    return {
      success: false,
      message: 'Post was cancelled',
      timestamp: new Date(),
    };
  }

  // Update status to publishing
  await prisma.socialPost.update({
    where: { id: socialPostId },
    data: { status: 'PUBLISHING' },
  });

  try {
    // Refresh token if needed
    const { accessToken } = await refreshTokenIfNeeded(post.account);

    let result: { platformPostId: string; platformUrl: string };
    const imageUrl = post.mediaUrls[0];
    const metadata = post.account.metadata as Record<string, unknown> | null;
    const generationData = post.generationData as Record<string, unknown> | null;

    switch (post.platform) {
      case 'PINTEREST': {
        // Ensure we have a board for this site. If the stored boardId doesn't match
        // the site name (e.g., shared account across multiple sites), find or create one.
        let boardId = (metadata?.['boardId'] as string) || '';
        const boardName = (metadata?.['boardName'] as string) || '';
        const siteName = post.site?.name || '';

        if (siteName && boardName && boardName.toLowerCase() !== siteName.toLowerCase()) {
          // Board doesn't match site — find or create the correct one
          console.log(
            `[Social] Pinterest board "${boardName}" doesn't match site "${siteName}", finding/creating correct board`
          );
          const board = await findOrCreatePinterestBoard(accessToken, siteName);
          if (board) {
            boardId = board.id;
            // Update the account metadata so future posts use the correct board
            const updatedMeta = { ...(metadata || {}), boardId: board.id, boardName: board.name };
            await prisma.socialAccount.update({
              where: { id: post.account.id },
              data: { metadata: updatedMeta },
            });
          }
        }

        if (!boardId) {
          // No board at all — try to create one matching the site name
          const board = await findOrCreatePinterestBoard(accessToken, siteName || 'Experiences');
          if (board) {
            boardId = board.id;
            const updatedMeta = { ...(metadata || {}), boardId: board.id, boardName: board.name };
            await prisma.socialAccount.update({
              where: { id: post.account.id },
              data: { metadata: updatedMeta },
            });
          } else {
            throw new Error('No Pinterest board configured and could not create one.');
          }
        }

        result = await createPinterestPin({
          accessToken,
          boardId,
          title: (generationData?.['pinTitle'] as string) || post.caption.substring(0, 100),
          description: post.caption,
          imageUrl: imageUrl || '',
          linkUrl: post.linkUrl || undefined,
        });
        break;
      }

      case 'FACEBOOK': {
        const pageId = (metadata?.['pageId'] as string) || post.account.accountId || '';
        if (!pageId) {
          throw new Error('No Facebook Page ID configured.');
        }

        // Facebook Page posting requires a Page Access Token (not User Access Token).
        // Check metadata cache first, then fetch from Graph API and cache it.
        let pageAccessToken = (metadata?.['pageAccessToken'] as string) || '';
        if (!pageAccessToken) {
          const fetched = await getPageAccessToken(accessToken, pageId);
          if (!fetched) {
            throw new Error(
              `Could not obtain Page Access Token for page ${pageId}. ` +
                'Ensure the user has granted pages_manage_posts permission.'
            );
          }
          pageAccessToken = fetched;
          // Cache the page access token in account metadata for future use
          await prisma.socialAccount.update({
            where: { id: post.account.id },
            data: {
              metadata: { ...(metadata || {}), pageAccessToken: fetched },
            },
          });
        }

        result = await createFacebookPost({
          accessToken: pageAccessToken,
          pageId,
          message:
            post.hashtags.length > 0
              ? `${post.caption}\n\n${post.hashtags.map((h) => `#${h}`).join(' ')}`
              : post.caption,
          linkUrl: post.linkUrl || undefined,
          imageUrl,
        });
        break;
      }

      case 'TWITTER': {
        result = await createTweet({
          accessToken,
          text:
            post.hashtags.length > 0
              ? `${post.caption}\n\n${post.hashtags.map((h) => `#${h}`).join(' ')}`
              : post.caption,
          imageUrl,
        });
        break;
      }

      default:
        throw new Error(`Unknown platform: ${post.platform}`);
    }

    // Success - update post
    await prisma.socialPost.update({
      where: { id: socialPostId },
      data: {
        status: 'PUBLISHED',
        platformPostId: result.platformPostId,
        platformUrl: result.platformUrl,
        publishedAt: new Date(),
      },
    });

    // Update account's lastPostedAt
    await prisma.socialAccount.update({
      where: { id: post.accountId },
      data: { lastPostedAt: new Date() },
    });

    console.log(`[Social] Published ${post.platform} post: ${result.platformUrl}`);

    return {
      success: true,
      message: `Published to ${post.platform}`,
      data: {
        platformPostId: result.platformPostId,
        platformUrl: result.platformUrl,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update post with error
    await prisma.socialPost.update({
      where: { id: socialPostId },
      data: {
        status: 'FAILED',
        errorMessage,
        retryCount: { increment: 1 },
      },
    });

    console.error(
      `[Social] Failed to publish ${post.platform} post ${socialPostId}:`,
      errorMessage
    );

    return {
      success: false,
      message: `Failed to publish: ${errorMessage}`,
      error: errorMessage,
      retryable: true,
      timestamp: new Date(),
    };
  }
}
