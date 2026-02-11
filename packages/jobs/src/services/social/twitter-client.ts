interface TwitterPostInput {
  accessToken: string;
  text: string;
  imageUrl?: string;
}

interface TwitterPostResult {
  platformPostId: string;
  platformUrl: string;
}

/**
 * Post a tweet via the X/Twitter API v2.
 * Docs: https://developer.x.com/en/docs/x-api/tweets/manage-tweets/api-reference/post-tweets
 */
export async function createTweet(input: TwitterPostInput): Promise<TwitterPostResult> {
  const { accessToken, text, imageUrl } = input;

  // Enforce 280 char limit
  const truncatedText = text.length > 280 ? text.substring(0, 277) + '...' : text;

  let mediaId: string | undefined;

  // Upload media if image provided
  if (imageUrl) {
    try {
      mediaId = await uploadTwitterMedia(accessToken, imageUrl);
    } catch (err) {
      console.warn('[Twitter] Media upload failed, posting without image:', err);
    }
  }

  const body: Record<string, unknown> = {
    text: truncatedText,
  };

  if (mediaId) {
    body['media'] = { media_ids: [mediaId] };
  }

  const response = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
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
 * Uses the v1.1 media upload endpoint (still required for v2 tweets).
 */
async function uploadTwitterMedia(accessToken: string, imageUrl: string): Promise<string> {
  // Download the image first
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString('base64');
  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

  // Twitter media upload (simple upload for images < 5MB)
  const formData = new URLSearchParams({
    media_data: base64Image,
    media_category: 'tweet_image',
  });

  const uploadResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
