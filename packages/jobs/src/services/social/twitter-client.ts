import { createHmac, randomBytes } from 'crypto';

interface TwitterPostInput {
  accessToken: string; // OAuth 1.0a access token
  accessSecret: string; // OAuth 1.0a access token secret
  text: string;
  imageUrl?: string;
}

interface TwitterPostResult {
  platformPostId: string;
  platformUrl: string;
}

/**
 * Generate OAuth 1.0a Authorization header for Twitter API requests.
 * Uses HMAC-SHA1 signature method.
 */
function generateOAuth1Header(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessSecret: string
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  // Combine OAuth params and request params for signature base
  const allParams: Record<string, string> = { ...oauthParams, ...params };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map((k) => `${encodeRFC3986(k)}=${encodeRFC3986(allParams[k]!)}`)
    .join('&');

  // Build signature base string
  const signatureBase = [
    method.toUpperCase(),
    encodeRFC3986(url),
    encodeRFC3986(paramString),
  ].join('&');

  // Sign with HMAC-SHA1
  const signingKey = `${encodeRFC3986(consumerSecret)}&${encodeRFC3986(accessSecret)}`;
  const signature = createHmac('sha1', signingKey)
    .update(signatureBase)
    .digest('base64');

  oauthParams['oauth_signature'] = signature;

  // Build Authorization header
  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${encodeRFC3986(k)}="${encodeRFC3986(oauthParams[k]!)}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}

/**
 * RFC 3986 percent-encoding (required by OAuth 1.0a spec).
 */
function encodeRFC3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Post a tweet via the X/Twitter API v2 using OAuth 1.0a.
 * Docs: https://developer.x.com/en/docs/x-api/tweets/manage-tweets/api-reference/post-tweets
 */
export async function createTweet(input: TwitterPostInput): Promise<TwitterPostResult> {
  const { accessToken, accessSecret, text, imageUrl } = input;

  const consumerKey = process.env['TWITTER_CONSUMER_KEY'];
  const consumerSecret = process.env['TWITTER_CONSUMER_SECRET'];
  if (!consumerKey || !consumerSecret) {
    throw new Error('TWITTER_CONSUMER_KEY and TWITTER_CONSUMER_SECRET must be set');
  }

  // Enforce 280 char limit
  const truncatedText = text.length > 280 ? text.substring(0, 277) + '...' : text;

  let mediaId: string | undefined;

  // Upload media if image provided
  if (imageUrl) {
    try {
      mediaId = await uploadTwitterMedia(
        consumerKey, consumerSecret, accessToken, accessSecret, imageUrl
      );
    } catch (err) {
      console.warn('[Twitter] Media upload failed, posting without image:', err);
    }
  }

  const tweetBody: Record<string, unknown> = {
    text: truncatedText,
  };

  if (mediaId) {
    tweetBody['media'] = { media_ids: [mediaId] };
  }

  const tweetUrl = 'https://api.twitter.com/2/tweets';
  // OAuth 1.0a for JSON body requests: params for signature are only OAuth params (no body params)
  const authHeader = generateOAuth1Header(
    'POST', tweetUrl, {},
    consumerKey, consumerSecret, accessToken, accessSecret
  );

  const response = await fetch(tweetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(tweetBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitter API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as { data?: { id: string } };
  const tweetId = data.data?.id || '';

  return {
    platformPostId: tweetId,
    platformUrl: `https://twitter.com/i/web/status/${tweetId}`,
  };
}

/**
 * Upload an image to Twitter for use in a tweet.
 * Uses the v1.1 media upload endpoint with OAuth 1.0a (still required for v2 tweets).
 */
async function uploadTwitterMedia(
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessSecret: string,
  imageUrl: string
): Promise<string> {
  // Download the image first
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString('base64');

  // Twitter media upload (simple upload for images < 5MB)
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
  const uploadParams: Record<string, string> = {
    media_data: base64Image,
    media_category: 'tweet_image',
  };

  const authHeader = generateOAuth1Header(
    'POST', uploadUrl, uploadParams,
    consumerKey, consumerSecret, accessToken, accessSecret
  );

  const formData = new URLSearchParams(uploadParams);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Twitter media upload failed: ${error}`);
  }

  const uploadData = (await uploadResponse.json()) as { media_id_string: string };
  return uploadData.media_id_string;
}
