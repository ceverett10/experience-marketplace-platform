#!/usr/bin/env npx ts-node
/**
 * Cleanup duplicate GA4 properties
 *
 * During site creation, GA4 properties may have been created multiple times
 * (e.g. job retries after partial failures). This script:
 *
 * 1. Lists ALL GA4 properties in the account
 * 2. Cross-references with site names in the database
 * 3. Groups properties by display name to find duplicates
 * 4. Only targets duplicates whose name matches a site — leaves unrelated properties alone
 * 5. With --delete flag, soft-deletes the duplicates (moved to GA4 trash, recoverable for 35 days)
 *
 * SAFE: Properties that don't match any site name are left untouched (they may belong to other projects).
 *
 * Usage:
 *   npx ts-node scripts/cleanup-ga4-properties.ts                     # Audit only (dry run)
 *   npx ts-node scripts/cleanup-ga4-properties.ts --delete            # Delete duplicate properties
 *   npx ts-node scripts/cleanup-ga4-properties.ts --account=accounts/123456789  # Specify account
 *   npx ts-node scripts/cleanup-ga4-properties.ts --list-accounts     # List available accounts
 */

import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const prisma = new PrismaClient();

class GA4AdminClient {
  private analyticsAdmin: ReturnType<typeof google.analyticsadmin>;

  constructor() {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env['GSC_CLIENT_EMAIL'],
        private_key: process.env['GSC_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/analytics.edit',
        'https://www.googleapis.com/auth/analytics.readonly',
      ],
    });

    this.analyticsAdmin = google.analyticsadmin({
      version: 'v1beta',
      auth,
    });
  }

  async listAccounts() {
    const response = await this.analyticsAdmin.accounts.list();
    return (response.data.accounts || []).map((account) => ({
      name: account.name || '',
      displayName: account.displayName || '',
    }));
  }

  async listProperties(accountId: string) {
    const allProperties: Array<{
      name: string;
      propertyId: string;
      displayName: string;
      createTime?: string;
      websiteUrl?: string;
      measurementId?: string;
    }> = [];

    // GA4 Admin API may paginate — fetch all pages
    let pageToken: string | undefined;
    do {
      const response = await this.analyticsAdmin.properties.list({
        filter: `parent:${accountId}`,
        pageToken,
        pageSize: 200,
      });

      for (const property of response.data.properties || []) {
        const propertyName = property.name || '';
        const propertyId = propertyName.split('/').pop() || '';

        allProperties.push({
          name: propertyName,
          propertyId,
          displayName: property.displayName || '',
          createTime: property.createTime || undefined,
        });
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return allProperties;
  }

  async listDataStreams(propertyId: string) {
    try {
      const response = await this.analyticsAdmin.properties.dataStreams.list({
        parent: `properties/${propertyId}`,
      });

      return (response.data.dataStreams || []).map((stream) => ({
        displayName: stream.displayName || '',
        measurementId: stream.webStreamData?.measurementId || '',
        websiteUrl: stream.webStreamData?.defaultUri || '',
        type: stream.type || '',
      }));
    } catch {
      return [];
    }
  }

  /**
   * Soft-delete a GA4 property.
   * The property is moved to trash and can be recovered within 35 days.
   * After 35 days it is permanently deleted.
   */
  async deleteProperty(propertyId: string): Promise<boolean> {
    try {
      await this.analyticsAdmin.properties.delete({
        name: `properties/${propertyId}`,
      });
      return true;
    } catch (error: any) {
      console.error(`  Failed to delete property ${propertyId}: ${error.message}`);
      return false;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const listAccountsOnly = args.includes('--list-accounts');
  const shouldDelete = args.includes('--delete');
  const accountArg = args.find((arg) => arg.startsWith('--account='));
  const accountId = accountArg?.split('=')[1];

  console.log('='.repeat(60));
  console.log('GA4 Property Cleanup Tool');
  console.log('='.repeat(60));

  if (!process.env['GSC_CLIENT_EMAIL'] || !process.env['GSC_PRIVATE_KEY']) {
    console.error('\nError: GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY must be set');
    process.exit(1);
  }

  const client = new GA4AdminClient();

  // List accounts
  console.log('\n[1/4] Checking GA4 accounts...');
  let accounts;
  try {
    accounts = await client.listAccounts();
    accounts.forEach((acc) => console.log(`  - ${acc.displayName} (${acc.name})`));
  } catch (error: any) {
    console.error('\nError listing GA4 accounts:', error.message);
    console.error('Make sure the service account has access to your GA4 account.');
    process.exit(1);
  }

  if (listAccountsOnly) {
    process.exit(0);
  }

  const targetAccountId = accountId || accounts[0]?.name;
  if (!targetAccountId) {
    console.error('\nNo GA4 account found.');
    process.exit(1);
  }
  console.log(`\n  Using account: ${targetAccountId}`);

  // List all properties in the account
  console.log('\n[2/4] Fetching all GA4 properties from account...');
  const properties = await client.listProperties(targetAccountId);
  console.log(`  Found ${properties.length} GA4 properties`);

  // Enrich properties with data stream info (measurement IDs, website URLs)
  console.log('\n  Fetching data streams for each property...');
  const enrichedProperties = [];
  for (const prop of properties) {
    const streams = await client.listDataStreams(prop.propertyId);
    const webStream = streams.find((s) => s.type === 'WEB_DATA_STREAM') || streams[0];
    enrichedProperties.push({
      ...prop,
      measurementId: webStream?.measurementId || '',
      websiteUrl: webStream?.websiteUrl || '',
    });
    // Small delay to avoid rate-limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Get all property IDs and measurement IDs referenced in the database
  console.log('\n[3/4] Cross-referencing with database...');
  const sites = await prisma.site.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      primaryDomain: true,
      seoConfig: true,
    },
    orderBy: { name: 'asc' },
  });

  // Build lookup maps from the database
  const usedPropertyIds = new Set<string>();
  const usedMeasurementIds = new Set<string>();
  const siteNames = new Set<string>();
  const siteByPropertyId = new Map<string, { name: string; status: string }>();
  const siteByMeasurementId = new Map<string, { name: string; status: string }>();

  for (const site of sites) {
    siteNames.add(site.name);
    const seoConfig = site.seoConfig as Record<string, unknown> | null;
    if (seoConfig?.['ga4PropertyId']) {
      const propId = String(seoConfig['ga4PropertyId']);
      usedPropertyIds.add(propId);
      siteByPropertyId.set(propId, { name: site.name, status: site.status });
    }
    if (seoConfig?.['gaMeasurementId']) {
      const measId = String(seoConfig['gaMeasurementId']);
      usedMeasurementIds.add(measId);
      siteByMeasurementId.set(measId, { name: site.name, status: site.status });
    }
  }

  // Group GA4 properties by display name to find duplicates
  const propertiesByName = new Map<string, typeof enrichedProperties>();
  for (const prop of enrichedProperties) {
    const group = propertiesByName.get(prop.displayName) || [];
    group.push(prop);
    propertiesByName.set(prop.displayName, group);
  }

  // Classify properties into three categories:
  // 1. KEEP: referenced in the database (active)
  // 2. DUPLICATE: same name as a site, but NOT the one referenced in the DB
  // 3. UNRELATED: name doesn't match any site — belongs to another project, leave alone
  const kept: typeof enrichedProperties = [];
  const duplicates: typeof enrichedProperties = [];
  const unrelated: typeof enrichedProperties = [];

  for (const [displayName, group] of propertiesByName) {
    // Check if this property name matches any site in our database
    const matchesSite = siteNames.has(displayName);

    if (!matchesSite) {
      // Not one of our sites — leave it alone
      unrelated.push(...group);
      continue;
    }

    if (group.length === 1) {
      // Only one property with this name — it's the active one
      kept.push(group[0]!);
      continue;
    }

    // Multiple properties with the same site name — find the active one, mark the rest as duplicates
    // The "active" one is the one whose propertyId or measurementId is stored in the database
    let activeFound = false;
    for (const prop of group) {
      const isActive =
        usedPropertyIds.has(prop.propertyId) ||
        (prop.measurementId && usedMeasurementIds.has(prop.measurementId));

      if (isActive && !activeFound) {
        kept.push(prop);
        activeFound = true;
      } else {
        duplicates.push(prop);
      }
    }

    // If none matched the DB, keep the newest one (highest propertyId = most recent)
    if (!activeFound) {
      const sorted = [...group].sort((a, b) => Number(b.propertyId) - Number(a.propertyId));
      kept.push(sorted[0]!);
      // Remove the one we just kept from duplicates
      const keptId = sorted[0]!.propertyId;
      const idx = duplicates.findIndex((d) => d.propertyId === keptId);
      if (idx >= 0) duplicates.splice(idx, 1);
    }
  }

  // Report
  console.log('\n[4/4] Results');
  console.log('='.repeat(60));

  console.log(`\nACTIVE — kept (${kept.length} properties):`);
  for (const prop of kept) {
    const site = siteByPropertyId.get(prop.propertyId) ||
      siteByMeasurementId.get(prop.measurementId) || { name: prop.displayName, status: '?' };
    console.log(
      `  [KEEP] ${prop.displayName} (${prop.propertyId}) -> ${site.name} [${site.status}]`
    );
    if (prop.measurementId) console.log(`         Measurement ID: ${prop.measurementId}`);
    if (prop.websiteUrl) console.log(`         URL: ${prop.websiteUrl}`);
  }

  console.log(`\nUNRELATED — not our project (${unrelated.length} properties):`);
  if (unrelated.length === 0) {
    console.log('  None');
  } else {
    for (const prop of unrelated) {
      console.log(`  [SKIP] ${prop.displayName} (${prop.propertyId})`);
    }
  }

  console.log(`\nDUPLICATES — safe to delete (${duplicates.length} properties):`);
  if (duplicates.length === 0) {
    console.log('  None — no duplicate properties found!');
  } else {
    for (const prop of duplicates) {
      console.log(`  [DELETE] ${prop.displayName} (${prop.propertyId})`);
      if (prop.measurementId) console.log(`           Measurement ID: ${prop.measurementId}`);
      if (prop.websiteUrl) console.log(`           URL: ${prop.websiteUrl}`);
      if (prop.createTime) console.log(`           Created: ${prop.createTime}`);
    }
  }

  console.log(
    `\nSummary: ${kept.length} active, ${duplicates.length} duplicates, ${unrelated.length} unrelated, ${enrichedProperties.length} total`
  );

  // Delete duplicate properties if requested
  if (duplicates.length > 0 && shouldDelete) {
    console.log(`\nDeleting ${duplicates.length} duplicate properties...`);
    console.log('(Properties are soft-deleted and can be recovered in GA4 trash for 35 days)\n');

    let deleted = 0;
    let failed = 0;

    for (const prop of duplicates) {
      process.stdout.write(`  Deleting ${prop.displayName} (${prop.propertyId})... `);
      const success = await client.deleteProperty(prop.propertyId);
      if (success) {
        console.log('done');
        deleted++;
      } else {
        failed++;
      }
      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`\nDeletion complete: ${deleted} deleted, ${failed} failed`);
  } else if (duplicates.length > 0 && !shouldDelete) {
    console.log('\nTo delete duplicates, re-run with --delete flag:');
    console.log('  npx ts-node scripts/cleanup-ga4-properties.ts --delete');
    console.log('\nDeleted properties go to GA4 trash and can be recovered within 35 days.');
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
