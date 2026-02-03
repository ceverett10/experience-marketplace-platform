#!/usr/bin/env npx ts-node
/**
 * Setup Google Analytics 4 for all active sites
 *
 * This script:
 * 1. Lists available GA4 accounts
 * 2. Creates GA4 properties for each active site
 * 3. Creates web data streams to generate measurement IDs
 * 4. Updates site seoConfig with the measurement IDs
 *
 * Prerequisites:
 * - GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY environment variables set
 * - Service account has Analytics Admin API access
 * - Service account is added to the GA4 account with Editor role
 *
 * Usage:
 *   npx ts-node scripts/setup-ga4.ts
 *   npx ts-node scripts/setup-ga4.ts --account=accounts/123456789
 *   npx ts-node scripts/setup-ga4.ts --list-accounts
 *   npx ts-node scripts/setup-ga4.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

// Initialize Prisma
const prisma = new PrismaClient();

// Import GA4 client
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

// Inline GA4 client to avoid module resolution issues in scripts
class GA4Client {
  private auth: GoogleAuth;
  private analyticsAdmin: ReturnType<typeof google.analyticsadmin>;

  constructor() {
    this.auth = new GoogleAuth({
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
      auth: this.auth,
    });
  }

  async listAccounts() {
    const response = await this.analyticsAdmin.accounts.list();
    return (response.data.accounts || []).map((account) => ({
      name: account.name || '',
      displayName: account.displayName || '',
    }));
  }

  async createProperty(params: {
    accountId: string;
    displayName: string;
    timeZone?: string;
    currencyCode?: string;
  }) {
    const response = await this.analyticsAdmin.properties.create({
      requestBody: {
        parent: params.accountId,
        displayName: params.displayName,
        timeZone: params.timeZone || 'Europe/London',
        currencyCode: params.currencyCode || 'GBP',
        industryCategory: 'TRAVEL',
      },
    });
    const propertyName = response.data.name || '';
    const propertyId = propertyName.split('/').pop() || '';
    return { name: propertyName, propertyId, displayName: response.data.displayName || '' };
  }

  async createWebDataStream(params: {
    propertyId: string;
    websiteUrl: string;
    displayName: string;
  }) {
    const response = await this.analyticsAdmin.properties.dataStreams.create({
      parent: `properties/${params.propertyId}`,
      requestBody: {
        type: 'WEB_DATA_STREAM',
        displayName: params.displayName,
        webStreamData: { defaultUri: params.websiteUrl },
      },
    });
    return {
      measurementId: response.data.webStreamData?.measurementId || '',
      streamId: (response.data.name || '').split('/').pop() || '',
    };
  }

  async setupSiteAnalytics(params: {
    accountId: string;
    siteName: string;
    websiteUrl: string;
    timeZone?: string;
    currencyCode?: string;
  }) {
    try {
      const property = await this.createProperty({
        accountId: params.accountId,
        displayName: params.siteName,
        timeZone: params.timeZone,
        currencyCode: params.currencyCode,
      });
      const dataStream = await this.createWebDataStream({
        propertyId: property.propertyId,
        websiteUrl: params.websiteUrl,
        displayName: `${params.siteName} - Web`,
      });
      return {
        success: true,
        propertyId: property.propertyId,
        measurementId: dataStream.measurementId,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const listAccountsOnly = args.includes('--list-accounts');
  const dryRun = args.includes('--dry-run');
  const accountArg = args.find((arg) => arg.startsWith('--account='));
  const accountId = accountArg?.split('=')[1];

  console.log('='.repeat(60));
  console.log('Google Analytics 4 Setup Script');
  console.log('='.repeat(60));

  // Check environment variables
  if (!process.env['GSC_CLIENT_EMAIL'] || !process.env['GSC_PRIVATE_KEY']) {
    console.error('\nError: GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY must be set');
    console.error('These credentials are reused for GA4 Admin API access');
    process.exit(1);
  }

  // Create GA4 client
  const ga4Client = new GA4Client();

  // Step 1: List accounts
  console.log('\n[Step 1] Checking GA4 accounts...');
  let accounts;
  try {
    accounts = await ga4Client.listAccounts();
    console.log(`Found ${accounts.length} GA4 account(s):`);
    accounts.forEach((acc) => {
      console.log(`  - ${acc.displayName} (${acc.name})`);
    });
  } catch (error: any) {
    console.error('\nError listing GA4 accounts:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Enable Google Analytics Admin API in your Google Cloud project');
    console.error('   https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com');
    console.error('2. Add the service account to your GA4 account with Editor role');
    console.error('   In GA4 Admin > Account Access Management > Add user');
    console.error(`   Email: ${process.env['GSC_CLIENT_EMAIL']}`);
    process.exit(1);
  }

  if (listAccountsOnly) {
    console.log('\n--list-accounts flag set, exiting.');
    process.exit(0);
  }

  if (accounts.length === 0) {
    console.error(
      '\nNo GA4 accounts found. Make sure the service account has access to at least one GA4 account.'
    );
    process.exit(1);
  }

  // Determine which account to use
  const targetAccountId = accountId || accounts[0]?.name;
  if (!targetAccountId) {
    console.error('\nNo GA4 account available. Please create one at https://analytics.google.com/');
    process.exit(1);
  }

  console.log(`\nUsing GA4 account: ${targetAccountId}`);

  // Step 2: Get active sites
  console.log('\n[Step 2] Fetching active sites from database...');
  const sites = await prisma.site.findMany({
    where: {
      status: { in: ['ACTIVE', 'REVIEW'] },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      primaryDomain: true,
      seoConfig: true,
    },
    orderBy: { name: 'asc' },
  });

  console.log(`Found ${sites.length} active site(s):`);
  sites.forEach((site) => {
    const seoConfig = site.seoConfig as { gaMeasurementId?: string } | null;
    const hasGA = !!seoConfig?.gaMeasurementId;
    console.log(
      `  - ${site.name} (${site.primaryDomain || site.slug}) ${hasGA ? '✓ GA configured' : '○ No GA'}`
    );
  });

  // Filter sites without GA
  const sitesWithoutGA = sites.filter((site) => {
    const seoConfig = site.seoConfig as { gaMeasurementId?: string } | null;
    return !seoConfig?.gaMeasurementId;
  });

  if (sitesWithoutGA.length === 0) {
    console.log('\nAll sites already have Google Analytics configured!');
    process.exit(0);
  }

  console.log(`\n${sitesWithoutGA.length} site(s) need GA setup.`);

  if (dryRun) {
    console.log('\n--dry-run flag set. Would create GA4 properties for:');
    sitesWithoutGA.forEach((site) => {
      const domain = site.primaryDomain || `${site.slug}.example.com`;
      console.log(`  - ${site.name} (https://${domain})`);
    });
    process.exit(0);
  }

  // Step 3: Create GA4 properties and data streams
  console.log('\n[Step 3] Creating GA4 properties and data streams...');

  const results: Array<{
    siteName: string;
    siteId: string;
    success: boolean;
    measurementId?: string;
    error?: string;
  }> = [];

  for (const site of sitesWithoutGA) {
    const domain = site.primaryDomain || `${site.slug}.herokuapp.com`;
    const websiteUrl = `https://${domain}`;

    console.log(`\nProcessing: ${site.name}`);
    console.log(`  Domain: ${domain}`);

    try {
      // Create GA4 property and data stream
      const result = await ga4Client.setupSiteAnalytics({
        accountId: targetAccountId,
        siteName: site.name,
        websiteUrl,
        timeZone: 'Europe/London',
        currencyCode: 'GBP',
      });

      if (result.success && result.measurementId) {
        console.log(`  ✓ Property created: ${result.propertyId}`);
        console.log(`  ✓ Measurement ID: ${result.measurementId}`);

        // Update site seoConfig
        const currentSeoConfig = (site.seoConfig as Record<string, unknown>) || {};
        const updatedSeoConfig = {
          ...currentSeoConfig,
          gaMeasurementId: result.measurementId,
        };

        await prisma.site.update({
          where: { id: site.id },
          data: { seoConfig: updatedSeoConfig as any },
        });

        console.log(`  ✓ Database updated`);

        results.push({
          siteName: site.name,
          siteId: site.id,
          success: true,
          measurementId: result.measurementId,
        });
      } else {
        console.log(`  ✗ Failed: ${result.error}`);
        results.push({
          siteName: site.name,
          siteId: site.id,
          success: false,
          error: result.error,
        });
      }
    } catch (error: any) {
      console.log(`  ✗ Error: ${error.message}`);
      results.push({
        siteName: site.name,
        siteId: site.id,
        success: false,
        error: error.message,
      });
    }

    // Small delay between API calls to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Step 4: Summary
  console.log('\n' + '='.repeat(60));
  console.log('Setup Complete');
  console.log('='.repeat(60));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`\nResults:`);
  console.log(`  ✓ Successful: ${successful.length}`);
  console.log(`  ✗ Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log('\nSuccessfully configured sites:');
    successful.forEach((r) => {
      console.log(`  - ${r.siteName}: ${r.measurementId}`);
    });
  }

  if (failed.length > 0) {
    console.log('\nFailed sites:');
    failed.forEach((r) => {
      console.log(`  - ${r.siteName}: ${r.error}`);
    });
  }

  console.log('\nGoogle Analytics is now tracking these sites!');
  console.log('View analytics at: https://analytics.google.com/');
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
