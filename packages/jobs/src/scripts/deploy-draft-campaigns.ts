/**
 * Standalone script to deploy DRAFT campaigns to ad platforms.
 * Run as a detached Heroku one-off dyno, immune to main app deploys.
 *
 * Usage:
 *   heroku run:detached node packages/jobs/dist/scripts/deploy-draft-campaigns.js [--platform FACEBOOK|GOOGLE_SEARCH]
 *
 * Without --platform, deploys all platforms. With --platform, only deploys that platform.
 */
import { deployDraftCampaigns } from '../workers/ads';

async function main() {
  const platformArg = process.argv.find((a) => a === '--platform');
  const platformIndex = process.argv.indexOf('--platform');
  const platform =
    platformIndex >= 0
      ? (process.argv[platformIndex + 1] as
          | 'FACEBOOK'
          | 'GOOGLE_SEARCH'
          | 'GOOGLE_DISPLAY'
          | 'PINTEREST'
          | 'BING'
          | 'OUTBRAIN'
          | 'REDDIT')
      : undefined;

  console.log(
    `[Deploy Script] Starting deployment${platform ? ` for ${platform} only` : ' for all platforms'}...`
  );
  console.log('[Deploy Script] No BullMQ job — runs until complete or crashes.');

  const startTime = Date.now();

  try {
    const result = await deployDraftCampaigns(undefined, { platform });
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `[Deploy Script] Complete in ${elapsed}s: ` +
        `${result.deployed} deployed, ${result.failed} failed, ${result.skipped} skipped`
    );
  } catch (err) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(`[Deploy Script] Fatal error after ${elapsed}s:`, err);
    process.exit(1);
  }

  process.exit(0);
}

main();
