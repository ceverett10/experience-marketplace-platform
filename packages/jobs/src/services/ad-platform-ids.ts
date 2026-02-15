/**
 * Ad Platform ID Auto-Fetch & Propagation Service
 *
 * Fetches Meta Pixel IDs and Google Ads Conversion Action IDs from their
 * respective APIs, then propagates them to all active Site and MicrositeConfig
 * seoConfig JSON fields.
 *
 * Follows the pattern established by GA4_SETUP: fetch from API -> store in seoConfig.
 */

import { prisma } from '@experience-marketplace/database';
import { MetaAdsClient } from './social/meta-ads-client';
import { refreshTokenIfNeeded } from './social/token-refresh';
import { isGoogleAdsConfigured, listConversionActions } from './google-ads-client';

interface FetchedAdPlatformIds {
  metaPixelId: string | null;
  metaPixelName: string | null;
  googleAdsConversionActionId: string | null;
  googleAdsConversionActionName: string | null;
  googleAdsId: string | null;
}

interface PropagationResult {
  metaPixelId: string | null;
  googleAdsId: string | null;
  googleAdsConversionAction: string | null;
  sitesUpdated: number;
  sitesSkipped: number;
  micrositesUpdated: number;
  micrositesSkipped: number;
  errors: number;
}

/**
 * Fetch Meta Pixel ID from the ad account.
 * Picks the most recently active pixel (by last_fired_time), falling back to the first.
 */
async function fetchMetaPixelId(): Promise<{
  pixelId: string | null;
  pixelName: string | null;
}> {
  const adAccountId = process.env['META_AD_ACCOUNT_ID'];
  if (!adAccountId) {
    console.log('[AdPlatformIds] META_AD_ACCOUNT_ID not set, skipping Meta pixel fetch');
    return { pixelId: null, pixelName: null };
  }

  const account = await prisma.socialAccount.findFirst({
    where: { platform: 'FACEBOOK', isActive: true },
    select: {
      id: true,
      platform: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      accountId: true,
    },
  });

  if (!account?.accessToken) {
    console.log('[AdPlatformIds] No active Facebook social account, skipping Meta pixel fetch');
    return { pixelId: null, pixelName: null };
  }

  const { accessToken } = await refreshTokenIfNeeded(account as any);
  const client = new MetaAdsClient({ accessToken, adAccountId });
  const pixels = await client.getAdPixels();

  if (pixels.length === 0) {
    console.log('[AdPlatformIds] No pixels found in ad account');
    return { pixelId: null, pixelName: null };
  }

  // Prefer the most recently fired pixel
  const sorted = [...pixels].sort((a, b) => {
    if (a.lastFiredTime && b.lastFiredTime) {
      return new Date(b.lastFiredTime).getTime() - new Date(a.lastFiredTime).getTime();
    }
    if (a.lastFiredTime) return -1;
    if (b.lastFiredTime) return 1;
    return 0;
  });

  const chosen = sorted[0]!;
  console.log(`[AdPlatformIds] Selected Meta Pixel: ${chosen.id} ("${chosen.name}")`);
  return { pixelId: chosen.id, pixelName: chosen.name };
}

/**
 * Fetch Google Ads Conversion Action ID.
 * Picks the first UPLOAD_CLICKS or WEBPAGE type action, or falls back to first ENABLED action.
 */
async function fetchGoogleConversionActionId(): Promise<{
  conversionActionResourceName: string | null;
  conversionActionName: string | null;
  googleAdsId: string | null;
}> {
  if (!isGoogleAdsConfigured()) {
    console.log('[AdPlatformIds] Google Ads not configured, skipping conversion action fetch');
    return { conversionActionResourceName: null, conversionActionName: null, googleAdsId: null };
  }

  const actions = await listConversionActions();

  if (actions.length === 0) {
    console.log('[AdPlatformIds] No conversion actions found');
    return { conversionActionResourceName: null, conversionActionName: null, googleAdsId: null };
  }

  // Prefer UPLOAD_CLICKS or WEBPAGE types (most relevant for booking conversions)
  const preferred = actions.find(
    (a) => a.status === 'ENABLED' && (a.type === 'UPLOAD_CLICKS' || a.type === 'WEBPAGE')
  );
  const chosen = preferred || actions.find((a) => a.status === 'ENABLED') || actions[0]!;

  // Derive AW-XXXXXXXXX ID from the customer ID for gtag config
  const customerId = process.env['GOOGLE_ADS_CUSTOMER_ID']?.replace(/-/g, '');
  const googleAdsId = customerId ? `AW-${customerId}` : null;

  console.log(
    `[AdPlatformIds] Selected Google Ads conversion action: ${chosen.resourceName} ("${chosen.name}")`
  );
  return {
    conversionActionResourceName: chosen.resourceName,
    conversionActionName: chosen.name,
    googleAdsId,
  };
}

/**
 * Fetch all ad platform IDs (Meta Pixel + Google Ads Conversion Action).
 */
export async function fetchAdPlatformIds(): Promise<FetchedAdPlatformIds> {
  console.log('[AdPlatformIds] Fetching ad platform IDs...');

  const [meta, google] = await Promise.all([
    fetchMetaPixelId(),
    fetchGoogleConversionActionId(),
  ]);

  return {
    metaPixelId: meta.pixelId,
    metaPixelName: meta.pixelName,
    googleAdsConversionActionId: google.conversionActionResourceName,
    googleAdsConversionActionName: google.conversionActionName,
    googleAdsId: google.googleAdsId,
  };
}

/**
 * Propagate ad platform IDs to all active Sites and MicrositeConfigs.
 * Merges into existing seoConfig JSON, preserving all other fields.
 */
export async function propagateAdPlatformIds(
  ids: { metaPixelId: string | null; googleAdsId: string | null; googleAdsConversionAction?: string | null }
): Promise<PropagationResult> {
  console.log('[AdPlatformIds] Propagating to all active sites and microsites...');

  const result: PropagationResult = {
    metaPixelId: ids.metaPixelId,
    googleAdsId: ids.googleAdsId,
    googleAdsConversionAction: ids.googleAdsConversionAction ?? null,
    sitesUpdated: 0,
    sitesSkipped: 0,
    micrositesUpdated: 0,
    micrositesSkipped: 0,
    errors: 0,
  };

  // Build the fields to merge — only include non-null values
  const adFields: Record<string, string> = {};
  if (ids.metaPixelId) adFields['metaPixelId'] = ids.metaPixelId;
  if (ids.googleAdsId) adFields['googleAdsId'] = ids.googleAdsId;
  if (ids.googleAdsConversionAction) adFields['googleAdsConversionAction'] = ids.googleAdsConversionAction;

  // --- Propagate to Sites ---
  const sites = await prisma.site.findMany({
    where: { status: { in: ['ACTIVE', 'REVIEW'] } },
    select: { id: true, name: true, seoConfig: true },
  });

  for (const site of sites) {
    try {
      const currentConfig = (site.seoConfig as Record<string, unknown>) || {};
      const needsUpdate = Object.entries(adFields).some(
        ([key, value]) => currentConfig[key] !== value
      );

      if (!needsUpdate) {
        result.sitesSkipped++;
        continue;
      }

      await prisma.site.update({
        where: { id: site.id },
        data: { seoConfig: { ...currentConfig, ...adFields } as any },
      });

      result.sitesUpdated++;
    } catch (error) {
      console.error(`[AdPlatformIds] Failed to update site ${site.name}:`, error);
      result.errors++;
    }
  }

  // --- Propagate to Microsites ---
  const microsites = await prisma.micrositeConfig.findMany({
    where: { status: { in: ['ACTIVE', 'REVIEW', 'GENERATING'] } },
    select: { id: true, fullDomain: true, seoConfig: true },
  });

  // Batch microsites to avoid overwhelming the DB
  const BATCH_SIZE = 50;
  for (let i = 0; i < microsites.length; i += BATCH_SIZE) {
    const batch = microsites.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (ms) => {
        try {
          const currentConfig = (ms.seoConfig as Record<string, unknown>) || {};
          const needsUpdate = Object.entries(adFields).some(
            ([key, value]) => currentConfig[key] !== value
          );

          if (!needsUpdate) {
            result.micrositesSkipped++;
            return;
          }

          await prisma.micrositeConfig.update({
            where: { id: ms.id },
            data: { seoConfig: { ...currentConfig, ...adFields } as any },
          });

          result.micrositesUpdated++;
        } catch (error) {
          console.error(`[AdPlatformIds] Failed to update microsite ${ms.fullDomain}:`, error);
          result.errors++;
        }
      })
    );
  }

  console.log(
    `[AdPlatformIds] Propagation complete: ${result.sitesUpdated} sites, ${result.micrositesUpdated} microsites updated (${result.errors} errors)`
  );

  return result;
}

/**
 * Full fetch-and-propagate pipeline: fetch IDs from APIs, then propagate to all sites/microsites.
 */
export async function fetchAndPropagateAdPlatformIds(): Promise<
  PropagationResult & { fetchedIds: FetchedAdPlatformIds }
> {
  const fetchedIds = await fetchAdPlatformIds();

  // Only propagate if we got at least one ID
  if (!fetchedIds.metaPixelId && !fetchedIds.googleAdsId) {
    console.log('[AdPlatformIds] No IDs fetched, nothing to propagate');
    return {
      fetchedIds,
      metaPixelId: null,
      googleAdsId: null,
      googleAdsConversionAction: null,
      sitesUpdated: 0,
      sitesSkipped: 0,
      micrositesUpdated: 0,
      micrositesSkipped: 0,
      errors: 0,
    };
  }

  const propagationResult = await propagateAdPlatformIds({
    metaPixelId: fetchedIds.metaPixelId,
    googleAdsId: fetchedIds.googleAdsId,
    googleAdsConversionAction: fetchedIds.googleAdsConversionActionId,
  });

  return { fetchedIds, ...propagationResult };
}
