import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';
import { addJob } from '@experience-marketplace/jobs';

/**
 * GET /api/social/posts?siteId=xxx&status=xxx
 * List social posts across all or a specific site.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (siteId) where['siteId'] = siteId;
    if (status) where['status'] = status;

    const posts = await prisma.socialPost.findMany({
      where,
      select: {
        id: true,
        platform: true,
        caption: true,
        hashtags: true,
        status: true,
        platformUrl: true,
        publishedAt: true,
        errorMessage: true,
        createdAt: true,
        site: { select: { id: true, name: true } },
        page: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ success: true, posts });
  } catch (error) {
    console.error('[Social Posts API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

/**
 * POST /api/social/posts
 * Trigger post generation or retry a failed post.
 * Body: { siteId, platform } for new post, or { action: 'retry', socialPostId } for retry.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === 'retry' && body.socialPostId) {
      // Retry a failed post
      const post = await prisma.socialPost.findUnique({
        where: { id: body.socialPostId },
        select: { id: true, status: true },
      });

      if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      }

      // Reset status to scheduled
      await prisma.socialPost.update({
        where: { id: body.socialPostId },
        data: { status: 'SCHEDULED', errorMessage: null },
      });

      // Queue publish job
      await addJob(
        'SOCIAL_POST_PUBLISH' as any,
        { socialPostId: String(body.socialPostId) } as any
      );

      return NextResponse.json({
        success: true,
        message: 'Post retry queued',
      });
    }

    if (body.siteId && body.platform) {
      // Generate new post
      await addJob(
        'SOCIAL_POST_GENERATE' as any,
        {
          siteId: String(body.siteId),
          platform: String(body.platform),
          pageId: body.pageId ? String(body.pageId) : undefined,
        } as any
      );

      return NextResponse.json({
        success: true,
        message: `${body.platform} post generation triggered`,
      });
    }

    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  } catch (error) {
    console.error('[Social Posts API] Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
