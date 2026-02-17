interface PinterestPostInput {
  accessToken: string;
  boardId: string;
  title: string;
  description: string;
  imageUrl: string;
  linkUrl?: string;
}

interface PinterestPostResult {
  platformPostId: string;
  platformUrl: string;
}

// Use sandbox API while app is in Trial mode; switch to production once approved
const PINTEREST_API_BASE =
  process.env['PINTEREST_USE_SANDBOX'] === 'true'
    ? 'https://api-sandbox.pinterest.com'
    : 'https://api.pinterest.com';

/**
 * Create a pin on Pinterest via the v5 API.
 * Docs: https://developers.pinterest.com/docs/api/v5/pins-create
 */
export async function createPinterestPin(input: PinterestPostInput): Promise<PinterestPostResult> {
  const { accessToken, boardId, title, description, imageUrl, linkUrl } = input;

  const body: Record<string, unknown> = {
    board_id: boardId,
    title: title.substring(0, 100),
    description: description.substring(0, 500),
    media_source: {
      source_type: 'image_url',
      url: imageUrl,
    },
  };

  if (linkUrl) {
    body['link'] = linkUrl;
  }

  const response = await fetch(`${PINTEREST_API_BASE}/v5/pins`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pinterest API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as { id: string };

  return {
    platformPostId: data.id,
    platformUrl: `https://www.pinterest.com/pin/${data.id}/`,
  };
}

/**
 * Find or create a Pinterest board by name.
 * Returns the board ID if found/created, or null on failure.
 */
export async function findOrCreatePinterestBoard(
  accessToken: string,
  boardName: string
): Promise<{ id: string; name: string } | null> {
  // List existing boards
  const listResponse = await fetch(`${PINTEREST_API_BASE}/v5/boards`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (listResponse.ok) {
    const data = (await listResponse.json()) as { items?: { id: string; name: string }[] };
    const existing = data.items?.find(
      (b) => b.name.toLowerCase() === boardName.toLowerCase()
    );
    if (existing) return existing;
  }

  // Create new board
  const createResponse = await fetch(`${PINTEREST_API_BASE}/v5/boards`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name: boardName,
      description: `Curated experiences and travel inspiration from ${boardName}`,
      privacy: 'PUBLIC',
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error(`[Pinterest] Failed to create board "${boardName}": ${error}`);
    return null;
  }

  const board = (await createResponse.json()) as { id: string; name: string };
  console.log(`[Pinterest] Created board "${board.name}" (${board.id})`);
  return board;
}
