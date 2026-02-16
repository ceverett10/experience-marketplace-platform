import { prisma } from '@experience-marketplace/database';
import { encryptToken, decryptToken } from './token-encryption';

interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number; // seconds
}

/**
 * Refresh an OAuth token if it's within 24 hours of expiry.
 * Returns the account with updated tokens, or the original if no refresh needed.
 *
 * For shared accounts (same platform + accountId across multiple sites), this:
 * 1. Checks if a sibling account has fresher tokens before attempting refresh
 * 2. Propagates refreshed tokens to ALL sibling accounts after success
 * This handles platforms like Twitter where refresh tokens are single-use and
 * only one token set is valid per user-app combination.
 */
export async function refreshTokenIfNeeded(account: {
  id: string;
  platform: string;
  accountId?: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}): Promise<{ accessToken: string }> {
  if (!account.accessToken) {
    throw new Error(`No access token for social account ${account.id}`);
  }

  // If no expiry set or more than 24 hours away, no refresh needed
  if (!account.tokenExpiresAt) {
    return { accessToken: decryptToken(account.accessToken) };
  }

  const hoursUntilExpiry = (account.tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilExpiry > 24) {
    return { accessToken: decryptToken(account.accessToken) };
  }

  // Before refreshing, check if a sibling account (same platform + accountId) has fresher tokens.
  // This handles the case where another site already refreshed the shared token.
  if (account.accountId) {
    const siblingWithFresherToken = await prisma.socialAccount.findFirst({
      where: {
        platform: account.platform as any,
        accountId: account.accountId,
        id: { not: account.id },
        tokenExpiresAt: { gt: new Date() },
      },
      orderBy: { tokenExpiresAt: 'desc' },
      select: { accessToken: true, refreshToken: true, tokenExpiresAt: true },
    });

    if (siblingWithFresherToken?.accessToken && siblingWithFresherToken.tokenExpiresAt) {
      const siblingHoursLeft =
        (siblingWithFresherToken.tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
      if (siblingHoursLeft > hoursUntilExpiry) {
        console.log(
          `[Social] Borrowing fresher token from sibling account (${siblingHoursLeft.toFixed(1)}h remaining)`
        );
        // Copy sibling's tokens to this account
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: {
            accessToken: siblingWithFresherToken.accessToken,
            refreshToken: siblingWithFresherToken.refreshToken,
            tokenExpiresAt: siblingWithFresherToken.tokenExpiresAt,
            updatedAt: new Date(),
          },
        });
        return { accessToken: decryptToken(siblingWithFresherToken.accessToken) };
      }
    }
  }

  // Token needs refresh
  if (!account.refreshToken) {
    throw new Error(`Token expiring soon but no refresh token for account ${account.id}`);
  }

  console.log(
    `[Social] Refreshing ${account.platform} token for account ${account.id} (expires in ${hoursUntilExpiry.toFixed(1)}h)`
  );

  const decryptedRefreshToken = decryptToken(account.refreshToken);
  let result: TokenRefreshResult;

  switch (account.platform) {
    case 'PINTEREST':
      result = await refreshPinterestToken(decryptedRefreshToken);
      break;
    case 'FACEBOOK':
      result = await refreshFacebookToken(decryptToken(account.accessToken));
      break;
    case 'TWITTER':
      result = await refreshTwitterToken(decryptedRefreshToken);
      break;
    default:
      throw new Error(`Unknown platform: ${account.platform}`);
  }

  // Update tokens in DB
  const updateData: Record<string, unknown> = {
    accessToken: encryptToken(result.accessToken),
    updatedAt: new Date(),
  };

  if (result.refreshToken) {
    updateData['refreshToken'] = encryptToken(result.refreshToken);
  }

  if (result.expiresIn) {
    updateData['tokenExpiresAt'] = new Date(Date.now() + result.expiresIn * 1000);
  }

  // For Facebook: clear cached pageAccessToken from metadata since the
  // user token changed — the publisher will fetch a fresh one on next post.
  if (account.platform === 'FACEBOOK') {
    const currentAccount = await prisma.socialAccount.findUnique({
      where: { id: account.id },
      select: { metadata: true },
    });
    const meta = currentAccount?.metadata as Record<string, unknown> | null;
    if (meta?.['pageAccessToken']) {
      const { pageAccessToken: _, ...restMeta } = meta;
      updateData['metadata'] = restMeta;
    }
  }

  await prisma.socialAccount.update({
    where: { id: account.id },
    data: updateData,
  });

  // Propagate refreshed tokens to all sibling accounts sharing the same platform + accountId
  if (account.accountId) {
    const propagated = await prisma.socialAccount.updateMany({
      where: {
        platform: account.platform as any,
        accountId: account.accountId,
        id: { not: account.id },
      },
      data: updateData,
    });
    if (propagated.count > 0) {
      console.log(
        `[Social] Propagated refreshed ${account.platform} token to ${propagated.count} sibling account(s)`
      );
    }
  }

  return { accessToken: result.accessToken };
}

async function refreshPinterestToken(refreshToken: string): Promise<TokenRefreshResult> {
  const appId = process.env['PINTEREST_APP_ID'];
  const appSecret = process.env['PINTEREST_APP_SECRET'];
  if (!appId || !appSecret) throw new Error('Pinterest OAuth not configured');

  const response = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pinterest token refresh failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  };
}

async function refreshFacebookToken(accessToken: string): Promise<TokenRefreshResult> {
  const appId = process.env['META_APP_ID'];
  const appSecret = process.env['META_APP_SECRET'];
  if (!appId || !appSecret) throw new Error('Meta OAuth not configured');

  // Exchange short-lived for long-lived token
  const response = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${accessToken}`
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Facebook token refresh failed: ${error}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in?: number };
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 5184000, // 60 days default
  };
}

async function refreshTwitterToken(refreshToken: string): Promise<TokenRefreshResult> {
  const clientId = process.env['TWITTER_CLIENT_ID'];
  const clientSecret = process.env['TWITTER_CLIENT_SECRET'];
  if (!clientId) throw new Error('Twitter OAuth not configured (TWITTER_CLIENT_ID)');

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (clientSecret) {
    headers['Authorization'] =
      `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitter token refresh failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}
