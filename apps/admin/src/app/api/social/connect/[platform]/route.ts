import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

const ADMIN_BASE_URL = process.env['ADMIN_BASE_URL'] || 'https://holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com/admin';

function getCallbackUrl(platform: string): string {
  return `${ADMIN_BASE_URL}/api/social/callback/${platform}`;
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
        `https://api.pinterest.com/oauth/?response_type=code` +
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
      const clientId = process.env['TWITTER_CLIENT_ID'];
      if (!clientId) {
        return NextResponse.json({ error: 'Twitter OAuth not configured' }, { status: 500 });
      }
      const callbackUrl = getCallbackUrl('twitter');
      // OAuth 2.0 with PKCE
      const codeChallenge = randomBytes(32).toString('base64url');
      authUrl =
        `https://twitter.com/i/oauth2/authorize?response_type=code` +
        `&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
        `&scope=tweet.read%20tweet.write%20users.read%20offline.access` +
        `&state=${state}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=plain`;
      break;
    }

    default:
      return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 });
  }

  return NextResponse.redirect(authUrl);
}
