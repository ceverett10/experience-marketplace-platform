import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';
import { createCipheriv, randomBytes } from 'crypto';

const ADMIN_BASE_URL =
  process.env['ADMIN_BASE_URL'] ||
  'https://holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com/admin';

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
 * GET /api/social/callback/[platform]?code=xxx&state=xxx
 * Handles OAuth callback, exchanges code for tokens, stores encrypted in DB.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    const errorDescription = searchParams.get('error_description') || error;
    return NextResponse.redirect(
      `${ADMIN_BASE_URL}/sites?error=${encodeURIComponent(`OAuth failed: ${errorDescription}`)}`
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${ADMIN_BASE_URL}/sites?error=${encodeURIComponent('Missing authorization code')}`
    );
  }

  // Decode state to get siteId (and codeVerifier for Twitter PKCE)
  let siteId: string;
  let codeVerifier: string | undefined;
  try {
    const stateData = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
    siteId = stateData.siteId;
    codeVerifier = stateData.codeVerifier;
  } catch {
    return NextResponse.redirect(
      `${ADMIN_BASE_URL}/sites?error=${encodeURIComponent('Invalid state parameter')}`
    );
  }

  try {
    let tokenData: {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      accountId?: string;
      accountName?: string;
      accountUrl?: string;
      metadata?: Record<string, unknown>;
    };

    switch (platform.toLowerCase()) {
      case 'pinterest':
        tokenData = await exchangePinterestCode(code);
        break;
      case 'facebook':
        tokenData = await exchangeFacebookCode(code);
        break;
      case 'twitter':
        tokenData = await exchangeTwitterCode(code, codeVerifier);
        break;
      default:
        return NextResponse.redirect(
          `${ADMIN_BASE_URL}/sites/${siteId}?tab=social&error=Unknown+platform`
        );
    }

    // Upsert social account
    const platformEnum = platform.toUpperCase() as 'PINTEREST' | 'FACEBOOK' | 'TWITTER';
    await prisma.socialAccount.upsert({
      where: { siteId_platform: { siteId, platform: platformEnum } },
      create: {
        siteId,
        platform: platformEnum,
        accountId: tokenData.accountId,
        accountName: tokenData.accountName,
        accountUrl: tokenData.accountUrl,
        accessToken: encryptToken(tokenData.accessToken),
        refreshToken: tokenData.refreshToken ? encryptToken(tokenData.refreshToken) : null,
        tokenExpiresAt: tokenData.expiresIn
          ? new Date(Date.now() + tokenData.expiresIn * 1000)
          : null,
        metadata: tokenData.metadata ? JSON.parse(JSON.stringify(tokenData.metadata)) : undefined,
        isActive: true,
      },
      update: {
        accountId: tokenData.accountId,
        accountName: tokenData.accountName,
        accountUrl: tokenData.accountUrl,
        accessToken: encryptToken(tokenData.accessToken),
        refreshToken: tokenData.refreshToken ? encryptToken(tokenData.refreshToken) : null,
        tokenExpiresAt: tokenData.expiresIn
          ? new Date(Date.now() + tokenData.expiresIn * 1000)
          : null,
        metadata: tokenData.metadata ? JSON.parse(JSON.stringify(tokenData.metadata)) : undefined,
        isActive: true,
      },
    });

    console.log(`[Social OAuth] ${platform} account connected for site ${siteId}`);

    return NextResponse.redirect(
      `${ADMIN_BASE_URL}/sites/${siteId}?tab=social&connected=${platform}`
    );
  } catch (err) {
    console.error(`[Social OAuth] ${platform} callback error:`, err);
    return NextResponse.redirect(
      `${ADMIN_BASE_URL}/sites/${siteId}?tab=social&error=${encodeURIComponent(String(err))}`
    );
  }
}

async function exchangePinterestCode(code: string) {
  const appId = process.env['PINTEREST_APP_ID']!;
  const appSecret = process.env['PINTEREST_APP_SECRET']!;
  const callbackUrl = getCallbackUrl('pinterest');

  // Exchange code for token
  const tokenResponse = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Pinterest token exchange failed: ${await tokenResponse.text()}`);
  }

  const tokens = await tokenResponse.json();

  // Get user info
  const userResponse = await fetch('https://api.pinterest.com/v5/user_account', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const user = userResponse.ok ? await userResponse.json() : {};

  // Get first board for pinning
  const boardsResponse = await fetch('https://api.pinterest.com/v5/boards', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const boards = boardsResponse.ok ? await boardsResponse.json() : { items: [] };
  const firstBoard = boards.items?.[0];

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    accountId: user.username,
    accountName: user.username || 'Pinterest Account',
    accountUrl: user.website_url || `https://pinterest.com/${user.username}`,
    metadata: {
      boardId: firstBoard?.id,
      boardName: firstBoard?.name,
      boards: (boards.items || []).map((b: { id: string; name: string }) => ({
        id: b.id,
        name: b.name,
      })),
    },
  };
}

async function exchangeFacebookCode(code: string) {
  const appId = process.env['META_APP_ID']!;
  const appSecret = process.env['META_APP_SECRET']!;
  const callbackUrl = getCallbackUrl('facebook');

  // Exchange code for short-lived user token
  const tokenResponse = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}&redirect_uri=${encodeURIComponent(callbackUrl)}`
  );

  if (!tokenResponse.ok) {
    throw new Error(`Facebook token exchange failed: ${await tokenResponse.text()}`);
  }

  const shortLivedToken = await tokenResponse.json();

  // Exchange for long-lived token
  const longLivedResponse = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken.access_token}`
  );

  const longLivedToken = longLivedResponse.ok
    ? await longLivedResponse.json()
    : shortLivedToken;

  // Get managed pages
  const pagesResponse = await fetch(
    `https://graph.facebook.com/v18.0/me/accounts?access_token=${longLivedToken.access_token}`
  );
  const pagesData = pagesResponse.ok ? await pagesResponse.json() : { data: [] };
  const firstPage = pagesData.data?.[0];

  if (!firstPage) {
    throw new Error('No Facebook Pages found. Please create a Facebook Page first.');
  }

  // Use the Page Access Token (long-lived, doesn't expire)
  return {
    accessToken: firstPage.access_token,
    expiresIn: 5184000, // 60 days
    accountId: firstPage.id,
    accountName: firstPage.name,
    accountUrl: `https://facebook.com/${firstPage.id}`,
    metadata: {
      pageId: firstPage.id,
      pageName: firstPage.name,
      pages: (pagesData.data || []).map(
        (p: { id: string; name: string; category: string }) => ({
          id: p.id,
          name: p.name,
          category: p.category,
        })
      ),
    },
  };
}

async function exchangeTwitterCode(code: string, codeVerifier?: string) {
  const clientId = process.env['TWITTER_CLIENT_ID']!;
  const clientSecret = process.env['TWITTER_CLIENT_SECRET'];
  const callbackUrl = getCallbackUrl('twitter');

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // Use Basic auth if client secret available (confidential client)
  if (clientSecret) {
    headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
      client_id: clientId,
      code_verifier: codeVerifier || 'challenge',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Twitter token exchange failed: ${await tokenResponse.text()}`);
  }

  const tokens = await tokenResponse.json();

  // Get user info
  const userResponse = await fetch('https://api.twitter.com/2/users/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userData = userResponse.ok ? await userResponse.json() : { data: {} };
  const user = userData.data || {};

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    accountId: user.id,
    accountName: user.username ? `@${user.username}` : user.name || 'Twitter Account',
    accountUrl: user.username ? `https://twitter.com/${user.username}` : undefined,
  };
}
