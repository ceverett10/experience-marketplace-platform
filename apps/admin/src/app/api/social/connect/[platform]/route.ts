import { NextResponse } from 'next/server';
import { createCipheriv, randomBytes } from 'crypto';
import { prisma } from '@experience-marketplace/database';

const ADMIN_BASE_URL = process.env['ADMIN_BASE_URL'] || 'https://holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com/admin';

function getCallbackUrl(platform: string): string {
  return `${ADMIN_BASE_URL}/api/social/callback/${platform}`;
}

function encryptToken(plaintext: string): string {
  const secret = process.env['SOCIAL_TOKEN_SECRET'];
  if (!secret || secret.length !== 64) {
    throw new Error('SOCIAL_TOKEN_SECRET must be a 64-character hex string');
  }
  const key = Buffer.from(secret, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * GET /api/social/connect/[platform]?siteId=xxx
 * Initiates OAuth flow by redirecting to the platform's authorization page.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('siteId');

  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  // Generate state parameter (siteId + CSRF token)
  const csrfToken = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ siteId, csrf: csrfToken })).toString('base64url');

  let authUrl: string;

  switch (platform.toLowerCase()) {
    case 'pinterest': {
      const appId = process.env['PINTEREST_APP_ID'];
      if (!appId) {
        return NextResponse.json({ error: 'Pinterest OAuth not configured' }, { status: 500 });
      }
      const callbackUrl = getCallbackUrl('pinterest');
      authUrl =
        `https://www.pinterest.com/oauth/?response_type=code` +
        `&client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
        `&scope=boards:read,pins:read,pins:write` +
        `&state=${state}`;
      break;
    }

    case 'facebook': {
      const appId = process.env['META_APP_ID'];
      if (!appId) {
        return NextResponse.json({ error: 'Facebook OAuth not configured' }, { status: 500 });
      }
      const callbackUrl = getCallbackUrl('facebook');
      authUrl =
        `https://www.facebook.com/v18.0/dialog/oauth?response_type=code` +
        `&client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
        `&scope=pages_manage_posts,pages_read_engagement` +
        `&state=${state}`;
      break;
    }

    case 'twitter': {
      // Twitter uses OAuth 1.0a - connect using pre-configured tokens from env vars
      const twitterAccessToken = process.env['TWITTER_ACCESS_TOKEN'];
      const twitterAccessSecret = process.env['TWITTER_ACCESS_SECRET'];
      if (!twitterAccessToken || !twitterAccessSecret) {
        return NextResponse.json(
          { error: 'Twitter OAuth 1.0a tokens not configured (TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET)' },
          { status: 500 }
        );
      }

      // Verify the tokens by fetching user info
      // (we'll set account name from env or a lookup later)
      await prisma.socialAccount.upsert({
        where: { siteId_platform: { siteId, platform: 'TWITTER' } },
        create: {
          siteId,
          platform: 'TWITTER',
          accountName: 'X / Twitter Account',
          accessToken: encryptToken(twitterAccessToken),
          refreshToken: encryptToken(twitterAccessSecret), // Store access secret in refreshToken field
          isActive: true,
        },
        update: {
          accessToken: encryptToken(twitterAccessToken),
          refreshToken: encryptToken(twitterAccessSecret),
          isActive: true,
        },
      });

      console.log(`[Social OAuth] Twitter account connected for site ${siteId} (via env tokens)`);
      return NextResponse.redirect(
        `${ADMIN_BASE_URL}/sites/${siteId}?tab=social&connected=twitter`
      );
    }

    default:
      return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 });
  }

  return NextResponse.redirect(authUrl);
}
