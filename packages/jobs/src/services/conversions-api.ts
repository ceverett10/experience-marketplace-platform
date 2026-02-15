/**
 * Server-Side Conversions API (CAPI) for Meta and Google Ads
 *
 * Uploads conversion events server-to-server, bypassing browser-side pixel
 * limitations (ad blockers, ITP). This significantly improves attribution
 * accuracy and enables better ad platform optimization.
 *
 * Meta: POST /{pixel_id}/events via Conversions API
 * Google: Upload offline click conversions via REST API
 */

import { createHash } from 'crypto';
import { prisma } from '@experience-marketplace/database';

// Cached ad platform IDs from database (fetched once, used for all conversions)
let cachedDbAdIds: {
  metaPixelId: string | null;
  googleAdsConversionAction: string | null;
  fetchedAt: number;
} | null = null;
const DB_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Look up ad platform IDs from any active site's seoConfig.
 * Used as fallback when env vars aren't set.
 */
async function getAdIdsFromDb(): Promise<{
  metaPixelId: string | null;
  googleAdsConversionAction: string | null;
}> {
  if (cachedDbAdIds && Date.now() - cachedDbAdIds.fetchedAt < DB_CACHE_TTL_MS) {
    return cachedDbAdIds;
  }

  try {
    const site = await prisma.site.findFirst({
      where: { status: 'ACTIVE' },
      select: { seoConfig: true },
    });

    const config = site?.seoConfig as Record<string, unknown> | null;
    cachedDbAdIds = {
      metaPixelId: (config?.['metaPixelId'] as string) || null,
      googleAdsConversionAction: (config?.['googleAdsConversionAction'] as string) || null,
      fetchedAt: Date.now(),
    };
    return cachedDbAdIds;
  } catch {
    return { metaPixelId: null, googleAdsConversionAction: null };
  }
}

// Rate limiters — conservative to stay within platform limits
const metaRequestTimestamps: number[] = [];
const META_RATE_LIMIT = 3; // requests per minute

const googleRequestTimestamps: number[] = [];
const GOOGLE_RATE_LIMIT = 5; // requests per minute

async function waitForMetaRateLimit(): Promise<void> {
  const now = Date.now();
  while (metaRequestTimestamps.length > 0 && metaRequestTimestamps[0]! < now - 60_000) {
    metaRequestTimestamps.shift();
  }
  if (metaRequestTimestamps.length >= META_RATE_LIMIT) {
    const waitMs = metaRequestTimestamps[0]! + 60_000 - now;
    await new Promise((r) => setTimeout(r, waitMs));
  }
  metaRequestTimestamps.push(Date.now());
}

async function waitForGoogleRateLimit(): Promise<void> {
  const now = Date.now();
  while (googleRequestTimestamps.length > 0 && googleRequestTimestamps[0]! < now - 60_000) {
    googleRequestTimestamps.shift();
  }
  if (googleRequestTimestamps.length >= GOOGLE_RATE_LIMIT) {
    const waitMs = googleRequestTimestamps[0]! + 60_000 - now;
    await new Promise((r) => setTimeout(r, waitMs));
  }
  googleRequestTimestamps.push(Date.now());
}

/** SHA-256 hash for PII normalization (required by Meta CAPI) */
function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

// ─── Meta Conversions API ──────────────────────────────────────────────────

interface MetaConversionEvent {
  bookingId: string;
  fbclid?: string;
  email?: string;
  value: number;
  currency: string;
  eventTime: Date;
  sourceUrl?: string;
}

/**
 * Upload a Purchase conversion event to Meta Conversions API.
 * Requires META_PIXEL_ID and a valid access token from SocialAccount.
 */
export async function uploadMetaConversion(
  event: MetaConversionEvent,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  let pixelId = process.env['META_PIXEL_ID'];
  if (!pixelId) {
    const dbIds = await getAdIdsFromDb();
    pixelId = dbIds.metaPixelId ?? undefined;
  }
  if (!pixelId) {
    return { success: false, error: 'META_PIXEL_ID not configured (env var or seoConfig)' };
  }

  await waitForMetaRateLimit();

  const userData: Record<string, string> = {};
  if (event.email) {
    userData['em'] = sha256(event.email);
  }
  if (event.fbclid) {
    userData['fbc'] = `fb.1.${event.eventTime.getTime()}.${event.fbclid}`;
  }

  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(event.eventTime.getTime() / 1000),
        event_id: event.bookingId, // Deduplication with client-side pixel
        action_source: 'website',
        event_source_url: event.sourceUrl,
        user_data: userData,
        custom_data: {
          value: event.value,
          currency: event.currency,
          content_ids: [event.bookingId],
          content_type: 'product',
        },
      },
    ],
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CAPI] Meta conversion upload failed (${response.status}):`, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = (await response.json()) as { events_received?: number };
    console.log(
      `[CAPI] Meta conversion uploaded: booking=${event.bookingId}, ` +
        `value=${event.currency} ${event.value}, events_received=${result.events_received}`
    );
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[CAPI] Meta conversion upload error:', msg);
    return { success: false, error: msg };
  }
}

// ─── Google Ads Offline Conversions ────────────────────────────────────────

interface GoogleConversionEvent {
  bookingId: string;
  gclid: string;
  value: number;
  currency: string;
  conversionTime: Date;
  conversionAction?: string; // e.g., 'customers/123/conversionActions/456'
}

/** Get Google Ads API configuration from environment variables */
function getGoogleConfig() {
  const developerToken = process.env['GOOGLE_ADS_DEVELOPER_TOKEN'];
  const clientId = process.env['GOOGLE_ADS_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_ADS_CLIENT_SECRET'];
  const refreshToken = process.env['GOOGLE_ADS_REFRESH_TOKEN'];
  const customerId = process.env['GOOGLE_ADS_CUSTOMER_ID'];

  if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
    return null;
  }
  return { developerToken, clientId, clientSecret, refreshToken, customerId };
}

let cachedGoogleAccessToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAccessToken(config: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  if (cachedGoogleAccessToken && Date.now() < cachedGoogleAccessToken.expiresAt - 60_000) {
    return cachedGoogleAccessToken.token;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedGoogleAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedGoogleAccessToken.token;
}

/**
 * Upload an offline click conversion to Google Ads.
 * Uses the gclid captured at click time to attribute the conversion.
 */
export async function uploadGoogleConversion(
  event: GoogleConversionEvent
): Promise<{ success: boolean; error?: string }> {
  const config = getGoogleConfig();
  if (!config) {
    return { success: false, error: 'Google Ads not configured' };
  }

  let conversionAction = event.conversionAction || process.env['GOOGLE_ADS_CONVERSION_ACTION'];
  if (!conversionAction) {
    const dbIds = await getAdIdsFromDb();
    conversionAction = dbIds.googleAdsConversionAction ?? undefined;
  }
  conversionAction = conversionAction || `customers/${config.customerId}/conversionActions/1`;

  await waitForGoogleRateLimit();

  try {
    const accessToken = await getGoogleAccessToken(config);

    // Format conversion time as required by Google Ads API
    const conversionDateTime = event.conversionTime
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '+00:00');

    const payload = {
      conversions: [
        {
          gclid: event.gclid,
          conversionAction,
          conversionDateTime,
          conversionValue: event.value,
          currencyCode: event.currency,
          orderId: event.bookingId,
        },
      ],
      partialFailure: true,
    };

    const response = await fetch(
      `https://googleads.googleapis.com/v19/customers/${config.customerId}:uploadClickConversions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': config.developerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CAPI] Google conversion upload failed (${response.status}):`, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = (await response.json()) as { partialFailureError?: unknown };
    const hasPartialErrors = result.partialFailureError;
    if (hasPartialErrors) {
      console.warn('[CAPI] Google conversion partial failure:', JSON.stringify(hasPartialErrors));
      return { success: false, error: `Partial failure: ${JSON.stringify(hasPartialErrors)}` };
    }

    console.log(
      `[CAPI] Google conversion uploaded: booking=${event.bookingId}, gclid=${event.gclid}, ` +
        `value=${event.currency} ${event.value}`
    );
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[CAPI] Google conversion upload error:', msg);
    return { success: false, error: msg };
  }
}
