/**
 * Build Meta Custom Audiences from Booking Data
 *
 * Creates a "Past Bookers" custom audience from confirmed bookings,
 * uploads SHA-256 hashed emails, and generates lookalike audiences.
 *
 * Designed to run weekly via scheduler or one-time via CLI.
 *
 * Flags:
 *   --dry-run   Show what would be created without making API calls (default)
 *   --apply     Actually create audiences and upload data
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/build-meta-audiences.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/build-meta-audiences.ts --apply
 */

import { createHash } from 'crypto';
import { prisma } from '@experience-marketplace/database';
import { MetaAdsClient } from '../services/social/meta-ads-client';
import { refreshTokenIfNeeded } from '../services/social/token-refresh';

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');

/** SHA-256 hash an email (lowercase, trimmed) as required by Meta */
function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/** Lookalike configs: country × ratio */
const LOOKALIKE_CONFIGS = [
  { country: 'GB', ratio: 0.01, label: '1% GB' },
  { country: 'GB', ratio: 0.02, label: '2% GB' },
  { country: 'GB', ratio: 0.05, label: '5% GB' },
  { country: 'US', ratio: 0.01, label: '1% US' },
  { country: 'US', ratio: 0.02, label: '2% US' },
  { country: 'US', ratio: 0.05, label: '5% US' },
];

async function main(): Promise<void> {
  console.info('=== Build Meta Custom Audiences ===');
  console.info(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  console.info();

  // Get Meta ads configuration
  const adAccountId = process.env['META_AD_ACCOUNT_ID'];
  if (!adAccountId) {
    console.error('META_AD_ACCOUNT_ID not configured');
    process.exit(1);
  }

  const account = await prisma.socialAccount.findFirst({
    where: { platform: 'FACEBOOK', isActive: true },
    select: {
      id: true,
      platform: true,
      accountId: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
    },
  });

  if (!account?.accessToken) {
    console.error('No active Facebook social account found');
    process.exit(1);
  }

  const { accessToken } = await refreshTokenIfNeeded(account);
  const metaClient = new MetaAdsClient({ accessToken, adAccountId });

  // Query confirmed/completed bookings with email addresses
  console.info('Querying bookings with customer emails...');
  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ['CONFIRMED', 'COMPLETED'] },
      customerEmail: { not: null },
    },
    select: {
      customerEmail: true,
    },
    distinct: ['customerEmail'],
  });

  // Deduplicate and hash emails
  const uniqueEmails = new Set<string>();
  for (const booking of bookings) {
    if (booking.customerEmail) {
      uniqueEmails.add(booking.customerEmail.toLowerCase().trim());
    }
  }

  const hashedEmails = [...uniqueEmails].map(hashEmail);

  console.info(
    `Found ${uniqueEmails.size} unique customer emails from ${bookings.length} bookings`
  );
  console.info(`Hashed ${hashedEmails.length} emails for upload`);
  console.info();

  if (hashedEmails.length < 100) {
    console.warn(
      'Warning: Meta requires ~100 matched users for a custom audience to be usable. ' +
        `Currently have ${hashedEmails.length} emails — audience may not be targetable yet.`
    );
    console.info();
  }

  if (DRY_RUN) {
    console.info('=== DRY RUN SUMMARY ===');
    console.info(`Would create "Past Bookers" custom audience with ${hashedEmails.length} users`);
    console.info('Would create lookalike audiences:');
    for (const config of LOOKALIKE_CONFIGS) {
      console.info(`  - ${config.label} Lookalike (${config.ratio * 100}% in ${config.country})`);
    }
    console.info();
    console.info('DRY RUN — no changes made. Run with --apply to create audiences.');
    return;
  }

  // Create or find the "Past Bookers" custom audience
  console.info('Creating "Past Bookers" custom audience...');
  const audience = await metaClient.createCustomAudience({
    name: 'Past Bookers - All Confirmed',
    description: 'Customers who have made confirmed or completed bookings',
  });

  if (!audience) {
    console.error('Failed to create custom audience');
    process.exit(1);
  }

  console.info(`Custom audience created: ${audience.audienceId}`);

  // Upload hashed emails
  console.info(`Uploading ${hashedEmails.length} hashed emails...`);
  const uploadResult = await metaClient.addUsersToCustomAudience(audience.audienceId, hashedEmails);

  console.info(
    `Upload complete: ${uploadResult.numReceived} received, ${uploadResult.numInvalidEntries} invalid`
  );
  console.info();

  // Create lookalike audiences
  console.info('Creating lookalike audiences...');
  const lookalikes: Array<{ label: string; audienceId: string }> = [];

  for (const config of LOOKALIKE_CONFIGS) {
    const lookalike = await metaClient.createLookalikeAudience({
      name: `Past Bookers - ${config.label} Lookalike`,
      sourceAudienceId: audience.audienceId,
      country: config.country,
      ratio: config.ratio,
    });

    if (lookalike) {
      lookalikes.push({ label: config.label, audienceId: lookalike.audienceId });
      console.info(`  Created ${config.label} lookalike: ${lookalike.audienceId}`);
    } else {
      console.error(`  Failed to create ${config.label} lookalike`);
    }
  }

  // Summary
  console.info();
  console.info('=== SUMMARY ===');
  console.info(`Past Bookers audience: ${audience.audienceId}`);
  console.info(`Emails uploaded: ${uploadResult.numReceived}`);
  console.info(`Lookalikes created: ${lookalikes.length}/${LOOKALIKE_CONFIGS.length}`);
  console.info();
  console.info('Set these env vars to use audiences in ad deployment:');
  console.info(`  META_PAST_BOOKERS_AUDIENCE_ID=${audience.audienceId}`);
  for (const la of lookalikes) {
    const envKey = `META_LOOKALIKE_${la.label.replace(/[% ]/g, '_').toUpperCase()}_ID`;
    console.info(`  ${envKey}=${la.audienceId}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
