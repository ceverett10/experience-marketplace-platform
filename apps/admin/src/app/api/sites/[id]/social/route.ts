import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';

/**
 * GET /api/sites/[id]/social
 * Returns social accounts and recent posts for a site.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const site = await prisma.site.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const accounts = await prisma.socialAccount.findMany({
      where: { siteId: id },
      select: {
        id: true,
        platform: true,
        accountId: true,
        accountName: true,
        accountUrl: true,
        isActive: true,
        lastPostedAt: true,
        tokenExpiresAt: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const recentPosts = await prisma.socialPost.findMany({
      where: { siteId: id },
      select: {
        id: true,
        platform: true,
        caption: true,
        hashtags: true,
        mediaUrls: true,
        linkUrl: true,
        status: true,
        platformUrl: true,
        publishedAt: true,
        scheduledFor: true,
        errorMessage: true,
        retryCount: true,
        createdAt: true,
        page: {
          select: { id: true, title: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Add token status to accounts (expired, expiring soon, valid)
    const accountsWithStatus = accounts.map((account) => {
      let tokenStatus: 'valid' | 'expiring_soon' | 'expired' | 'unknown' = 'unknown';
      if (account.tokenExpiresAt) {
        const hoursLeft =
          (account.tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursLeft <= 0) tokenStatus = 'expired';
        else if (hoursLeft <= 48) tokenStatus = 'expiring_soon';
        else tokenStatus = 'valid';
      } else {
        tokenStatus = 'valid'; // No expiry means long-lived token
      }

      return {
        ...account,
        tokenStatus,
      };
    });

    return NextResponse.json({
      success: true,
      accounts: accountsWithStatus,
      recentPosts,
    });
  } catch (error) {
    console.error('[Social API] Error fetching social data:', error);
    return NextResponse.json({ error: 'Failed to fetch social data' }, { status: 500 });
  }
}

/**
 * DELETE /api/sites/[id]/social?accountId=xxx
 * Disconnects a social account.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const account = await prisma.socialAccount.findFirst({
      where: { id: accountId, siteId: id },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await prisma.socialAccount.delete({
      where: { id: accountId },
    });

    console.log(`[Social] Disconnected ${account.platform} account for site ${id}`);

    return NextResponse.json({
      success: true,
      message: `${account.platform} account disconnected`,
    });
  } catch (error) {
    console.error('[Social API] Error disconnecting account:', error);
    return NextResponse.json({ error: 'Failed to disconnect account' }, { status: 500 });
  }
}
