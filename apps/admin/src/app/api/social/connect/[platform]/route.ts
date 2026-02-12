import { NextResponse } from 'next/server';
import { createCipheriv, createHash, randomBytes } from 'crypto';

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
        `&scope=boards:read,boards:write,pins:read,pins:write,ads:read` +
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
        `&scope=pages_manage_posts,pages_read_engagement,ads_read` +
        `&state=${state}`;
      break;
    }

    case 'twitter': {
      // Twitter OAuth 2.0 with PKCE
      const clientId = process.env['TWITTER_CLIENT_ID'];
      if (!clientId) {
        return NextResponse.json({ error: 'Twitter OAuth not configured' }, { status: 500 });
      }

      // PKCE: generate code_verifier and code_challenge (S256)
      const codeVerifier = randomBytes(32).toString('base64url');
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

      // Include code_verifier in state so callback can use it
      const twitterState = Buffer.from(
        JSON.stringify({ siteId, csrf: csrfToken, codeVerifier })
      ).toString('base64url');

      const callbackUrl = getCallbackUrl('twitter');
      authUrl =
        `https://twitter.com/i/oauth2/authorize?response_type=code` +
        `&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
        `&scope=${encodeURIComponent('tweet.read tweet.write users.read offline.access')}` +
        `&state=${twitterState}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256`;
      break;
    }

    default:
      return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 });
  }

  return NextResponse.redirect(authUrl);
}
