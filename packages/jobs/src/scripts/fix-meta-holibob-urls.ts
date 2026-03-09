/**
 * Fix Meta ads that have holibob.com as their landing URL.
 *
 * The consolidated campaign migration scripts (migrate-meta-consolidated.js,
 * move-ads-to-consolidated.js) used `holibob.com` as a fallback when
 * bestSource.targetUrl was null. This means live Meta ads are sending traffic
 * to a 404 page on holibob.com.
 *
 * This script:
 * 1. Finds all Meta child ad sets with holibob.com in their targetUrl
 * 2. Reconstructs the correct URL from site domain + landingPagePath
 * 3. Updates the live Meta ad creative via the API
 * 4. Updates the DB record
 *
 * Usage:
 *   npx tsx src/scripts/fix-meta-holibob-urls.ts           # dry run
 *   npx tsx src/scripts/fix-meta-holibob-urls.ts --apply    # actually fix
 */

import { prisma } from '@experience-marketplace/database';
import { MetaAdsClient } from '../services/social/meta-ads-client';
import { refreshTokenIfNeeded } from '../services/social/token-refresh';

const DRY_RUN = !process.argv.includes('--apply');

async function getMetaClient(): Promise<MetaAdsClient> {
  const adAccountId = process.env['META_AD_ACCOUNT_ID'];
  if (!adAccountId) throw new Error('META_AD_ACCOUNT_ID not set');

  const accounts = await prisma.socialAccount.findMany({
    where: { platform: 'FACEBOOK', isActive: true },
    select: {
      id: true,
      platform: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      accountId: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Prefer encrypted tokens (contain ':')
  const sorted = [...accounts].sort((a, b) => {
    const aEnc = a.accessToken?.includes(':') ? 0 : 1;
    const bEnc = b.accessToken?.includes(':') ? 0 : 1;
    return aEnc - bEnc;
  });

  for (const account of sorted) {
    if (!account.accessToken) continue;
    try {
      const { accessToken } = await refreshTokenIfNeeded(account);
      const client = new MetaAdsClient({ accessToken, adAccountId });
      await client.verifyAccess();
      console.info(`Using Meta token from account ${account.id}`);
      return client;
    } catch (error) {
      console.warn(
        `Skipping account ${account.id}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  throw new Error('No usable Meta access token found');
}

async function main() {
  console.info(`\n=== Fix Meta holibob.com URLs ${DRY_RUN ? '(DRY RUN)' : '(APPLYING)'} ===\n`);

  const pageId = process.env['META_PAGE_ID'];
  if (!pageId) throw new Error('META_PAGE_ID not set');

  // Find ALL deployed Meta campaigns (child ad sets + standalone) and check
  // if their targetUrl matches the current site/microsite domain.
  // This catches both holibob.com fallbacks AND stale -1 suffix subdomains.
  const allMeta = await prisma.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      platformCampaignId: { not: null },
      NOT: { targetUrl: '' },
    },
    select: {
      id: true,
      name: true,
      targetUrl: true,
      landingPagePath: true,
      landingPageType: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      platformCampaignId: true,
      platformAdSetId: true,
      platformAdId: true,
      parentCampaignId: true,
      proposalData: true,
      siteId: true,
      micrositeId: true,
      site: {
        select: { name: true, primaryDomain: true },
      },
      microsite: {
        select: { subdomain: true, fullDomain: true },
      },
    },
  });

  // Filter to only campaigns whose targetUrl domain doesn't match current site domain
  const affected = allMeta.filter((c) => {
    const currentDomain = c.microsite?.fullDomain || c.site?.primaryDomain;
    if (!currentDomain || !c.targetUrl) return false;

    try {
      const urlDomain = new URL(c.targetUrl).hostname;
      return urlDomain !== currentDomain;
    } catch {
      return true; // Malformed URL — needs fixing
    }
  });

  console.info(`Scanned ${allMeta.length} deployed Meta campaigns`);
  console.info(`Found ${affected.length} with mismatched/stale URLs\n`);

  if (affected.length === 0) {
    console.info('Nothing to fix!');
    return;
  }

  const metaClient = DRY_RUN ? null : await getMetaClient();

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const campaign of affected) {
    // Determine correct domain
    const domain = campaign.microsite?.fullDomain || campaign.site?.primaryDomain;

    if (!domain) {
      console.warn(`SKIP "${campaign.name}" (${campaign.id}): no site domain found`);
      skipped++;
      continue;
    }

    // Build correct URL by swapping the domain on the existing targetUrl.
    // This preserves query params like ?q=limassol and path segments.
    let oldUrl: URL;
    try {
      oldUrl = new URL(campaign.targetUrl);
    } catch {
      console.warn(`SKIP "${campaign.name}": malformed targetUrl "${campaign.targetUrl}"`);
      skipped++;
      continue;
    }

    const url = new URL(`https://${domain}${oldUrl.pathname}`);
    // Preserve original query params (e.g. ?q=limassol)
    oldUrl.searchParams.forEach((value, key) => {
      if (!key.startsWith('utm_')) url.searchParams.set(key, value);
    });
    // Set/override UTM params from campaign record
    if (campaign.utmSource) url.searchParams.set('utm_source', campaign.utmSource);
    if (campaign.utmMedium) url.searchParams.set('utm_medium', campaign.utmMedium);
    if (campaign.utmCampaign) url.searchParams.set('utm_campaign', campaign.utmCampaign);
    const finalUrl = url.toString();
    // For DB update, store URL without UTM params
    const correctUrlForDb = `https://${domain}${oldUrl.pathname}${
      oldUrl.search
        ? '?' +
          [...oldUrl.searchParams]
            .filter(([k]) => !k.startsWith('utm_'))
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('&')
        : ''
    }`;

    // Get creative data from proposalData
    const proposalData = campaign.proposalData as Record<string, unknown> | null;
    const creative = proposalData?.['generatedCreative'] as Record<string, unknown> | null;

    const headline = (creative?.['headline'] as string) || campaign.name;
    const body = (creative?.['body'] as string) || '';
    const imageUrl = (creative?.['imageUrl'] as string) || '';
    const callToAction = (creative?.['callToAction'] as string) || 'LEARN_MORE';

    let oldDomain = '???';
    try {
      oldDomain = new URL(campaign.targetUrl!).hostname;
    } catch {
      /* ignore */
    }
    const reason = oldDomain.includes('holibob.com')
      ? 'holibob.com fallback'
      : `stale domain (${oldDomain} → ${domain})`;

    console.info(
      `${DRY_RUN ? '[DRY]' : '[FIX]'} "${campaign.name}"` +
        `\n  Reason: ${reason}` +
        `\n  Old: ${campaign.targetUrl}` +
        `\n  New: ${finalUrl}` +
        `\n  Path: ${campaign.landingPagePath || '(none)'}` +
        `\n  Creative: headline="${headline.substring(0, 50)}", hasImage=${!!imageUrl}\n`
    );

    if (DRY_RUN) {
      fixed++;
      continue;
    }

    try {
      // For child ad sets, use platformAdId directly (getAdsForCampaign would
      // return ALL ads under the parent campaign, not just this child's ad).
      // For standalone campaigns, query the campaign for its ads.
      let adIds: string[];
      if (campaign.platformAdId) {
        adIds = [campaign.platformAdId];
      } else {
        const ads = await metaClient!.getAdsForCampaign(campaign.platformCampaignId!);
        adIds = ads.map((a) => a.id);
      }

      if (adIds.length === 0) {
        console.warn(`  No ads found for campaign ${campaign.platformCampaignId}`);
        skipped++;
        continue;
      }

      let adUpdated = false;
      for (const adId of adIds) {
        const success = await metaClient!.updateAdCreative(adId, {
          pageId,
          linkUrl: finalUrl,
          headline,
          body,
          imageUrl,
          callToAction,
        });
        if (success) {
          console.info(`  Updated Meta ad ${adId}`);
          adUpdated = true;
        } else {
          console.error(`  Failed to update Meta ad ${adId}`);
        }
      }

      if (!adUpdated) {
        failed++;
        continue;
      }

      // Update DB record (without UTM params — those are added at deploy time)
      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: {
          targetUrl: correctUrlForDb || `https://${domain}${oldUrl.pathname}`,
        },
      });

      fixed++;
    } catch (err) {
      console.error(
        `  Error fixing "${campaign.name}": ${err instanceof Error ? err.message : err}`
      );
      failed++;
    }
  }

  console.info(`\n=== Summary ===`);
  console.info(`Fixed: ${fixed}`);
  console.info(`Skipped: ${skipped}`);
  console.info(`Failed: ${failed}`);
  console.info(`Total: ${affected.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
