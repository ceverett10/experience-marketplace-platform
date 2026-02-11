import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import type {
  JobResult,
  SocialDailyPostingPayload,
  SocialPostGeneratePayload,
  SocialPostPublishPayload,
} from '../types';
import { addJob } from '../queues';
import { generateCaption } from '../services/social/caption-generator';
import { selectImageForPost } from '../services/social/image-selector';
import { refreshTokenIfNeeded } from '../services/social/token-refresh';
import { decryptToken } from '../services/social/token-encryption';
import { createPinterestPin } from '../services/social/pinterest-client';
import { createFacebookPost } from '../services/social/facebook-client';
import { createTweet } from '../services/social/twitter-client';
import { canExecuteAutonomousOperation } from '../services/pause-control';

type SocialPlatform = 'PINTEREST' | 'FACEBOOK' | 'TWITTER';

/**
 * SOCIAL_DAILY_POSTING - Fan-out job
 * Finds all sites with active social accounts and queues individual post generation jobs.
 */
export async function handleSocialDailyPosting(
  job: Job<SocialDailyPostingPayload>
): Promise<JobResult> {
  const { siteId } = job.data;

  console.log('[Social] Starting daily social posting');

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
      autonomousProcessesPaused: true,
      socialAccounts: {
        where: { isActive: true },
        select: { platform: true },
      },
    },
  });

  let queued = 0;
  let skipped = 0;

  for (const site of sites) {
    // Respect site-level pause
    if (site.autonomousProcessesPaused) {
      console.log(`[Social] Skipping ${site.name} (autonomous processes paused)`);
      skipped++;
      continue;
    }

    for (const account of site.socialAccounts) {
      try {
        await addJob(
          'SOCIAL_POST_GENERATE',
          { siteId: site.id, platform: account.platform } as SocialPostGeneratePayload,
          { priority: 5, attempts: 2 }
        );
        queued++;
      } catch (err) {
        console.warn(`[Social] Failed to queue post for ${site.name}/${account.platform}:`, err);
      }
    }
  }

  console.log(
    `[Social] Daily posting: queued ${queued} posts across ${sites.length} sites (${skipped} skipped)`
  );

  return {
    success: true,
    message: `Queued ${queued} social posts for ${sites.length - skipped} sites`,
    data: { queued, sites: sites.length, skipped },
    timestamp: new Date(),
  };
}

/**
 * SOCIAL_POST_GENERATE - Content creation
 * Selects a blog post to promote, generates caption and selects image.
 */
export async function handleSocialPostGenerate(
  job: Job<SocialPostGeneratePayload>
): Promise<JobResult> {
  const { siteId, platform, pageId } = job.data;

  console.log(`[Social] Generating ${platform} post for site ${siteId}`);

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

  // Select a blog post to promote
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
    return {
      success: false,
      message: `No published blog posts found for site ${siteId}`,
      timestamp: new Date(),
    };
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
    // Append link to tweet text
    const maxTextLen = 280 - blogUrl.length - 1; // -1 for space
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
      scheduledFor: new Date(Date.now() + 5 * 60 * 1000), // 5 min delay
      generationData: {
        model: 'claude-haiku-4-5-20251001',
        pinTitle: captionResult.pinTitle,
        rawCaption: captionResult.caption,
      },
    },
  });

  // Queue publish job with 5-minute delay
  await addJob(
    'SOCIAL_POST_PUBLISH',
    { socialPostId: socialPost.id } as SocialPostPublishPayload,
    { delay: 5 * 60 * 1000, attempts: 3, backoff: { type: 'exponential', delay: 60000 } }
  );

  console.log(`[Social] Generated ${platform} post ${socialPost.id} for blog "${page?.slug}"`);

  return {
    success: true,
    message: `Generated ${platform} post, scheduled for publishing`,
    data: {
      socialPostId: socialPost.id,
      platform,
      pageId: selectedPageId,
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
        const boardId = (metadata?.['boardId'] as string) || '';
        if (!boardId) {
          throw new Error('No Pinterest board configured. Please set a board in account settings.');
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
        result = await createFacebookPost({
          accessToken,
          pageId,
          message: post.hashtags.length > 0
            ? `${post.caption}\n\n${post.hashtags.map((h) => `#${h}`).join(' ')}`
            : post.caption,
          linkUrl: post.linkUrl || undefined,
          imageUrl,
        });
        break;
      }

      case 'TWITTER': {
        // Twitter uses OAuth 1.0a - accessSecret is stored in refreshToken field
        const accessSecret = post.account.refreshToken
          ? decryptToken(post.account.refreshToken)
          : process.env['TWITTER_ACCESS_SECRET'] || '';
        result = await createTweet({
          accessToken,
          accessSecret,
          text: post.hashtags.length > 0
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

    console.log(
      `[Social] Published ${post.platform} post: ${result.platformUrl}`
    );

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

    console.error(`[Social] Failed to publish ${post.platform} post ${socialPostId}:`, errorMessage);

    return {
      success: false,
      message: `Failed to publish: ${errorMessage}`,
      error: errorMessage,
      retryable: true,
      timestamp: new Date(),
    };
  }
}
