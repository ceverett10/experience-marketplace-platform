interface FacebookPostInput {
  accessToken: string;
  pageId: string;
  message: string;
  linkUrl?: string;
  imageUrl?: string;
}

interface FacebookPostResult {
  platformPostId: string;
  platformUrl: string;
}

/**
 * Get a Page Access Token from a User Access Token.
 * The Page Access Token is required for publishing to a Facebook Page.
 * Returns null if the user doesn't have manage_pages permission for this page.
 */
export async function getPageAccessToken(
  userAccessToken: string,
  pageId: string
): Promise<string | null> {
  // Request the page's access_token field using the user token
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${pageId}?fields=access_token&access_token=${userAccessToken}`
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[Facebook] Failed to get page access token for page ${pageId}:`, error);
    return null;
  }

  const data = (await response.json()) as { access_token?: string };
  return data.access_token || null;
}

/**
 * Post to a Facebook Page via the Graph API.
 * Requires a Page Access Token (not a User Access Token).
 * Docs: https://developers.facebook.com/docs/pages-api/posts
 */
export async function createFacebookPost(input: FacebookPostInput): Promise<FacebookPostResult> {
  const { accessToken, pageId, message, linkUrl, imageUrl } = input;

  let endpoint: string;
  let body: Record<string, string>;

  if (imageUrl && !linkUrl) {
    // Photo post
    endpoint = `https://graph.facebook.com/v18.0/${pageId}/photos`;
    body = {
      url: imageUrl,
      message,
      access_token: accessToken,
    };
  } else {
    // Link post (with optional image as part of link preview)
    endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;
    body = {
      message,
      access_token: accessToken,
    };
    if (linkUrl) {
      body['link'] = linkUrl;
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Facebook API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as { id?: string; post_id?: string };
  const postId = data.id || data.post_id || '';

  return {
    platformPostId: postId,
    platformUrl: `https://www.facebook.com/${postId}`,
  };
}
