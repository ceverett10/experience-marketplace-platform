/**
 * Standalone script to deploy all DRAFT campaigns to ad platforms.
 * Run as a detached Heroku one-off dyno, immune to main app deploys.
 *
 * Usage:
 *   heroku run:detached node packages/jobs/dist/scripts/deploy-draft-campaigns.js
 */
import { deployDraftCampaigns } from '../workers/ads';

async function main() {
  console.log('[Deploy Script] Starting standalone campaign deployment...');
  console.log('[Deploy Script] This script deploys all DRAFT campaigns directly.');
  console.log('[Deploy Script] No BullMQ job — runs until complete or crashes.');

  const startTime = Date.now();

  try {
    const result = await deployDraftCampaigns();
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
