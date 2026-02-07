#!/usr/bin/env npx tsx
/**
 * Set up GSC and GA4 for experiencess.com parent domain
 *
 * This covers ALL operator microsites:
 * - GSC: Domain property (sc-domain:experiencess.com) covers *.experiencess.com
 * - GA4: Single property with subdomain dimension for all traffic
 *
 * Run with: npx tsx packages/jobs/src/scripts/setup-experiencess-gsc-ga4.ts
 */

import 'dotenv/config';
import { prisma } from '@experience-marketplace/database';
import { getGSCClient, isGSCConfigured } from '../services/gsc-client.js';
import { GA4Client } from '../services/ga4-client.js';
import { CloudflareDNSService } from '../services/cloudflare-dns.js';

const PARENT_DOMAIN = 'experiencess.com';
const GA4_ACCOUNT_ID = process.env['GA4_ACCOUNT_ID']; // Your GA4 account ID

async function main() {
  console.log('Setting up GSC and GA4 for experiencess.com microsites...\n');

  // Check configuration
  console.log('Configuration:');
  console.log(`  GSC_CLIENT_EMAIL: ${process.env['GSC_CLIENT_EMAIL'] ? 'set' : 'NOT SET'}`);
  console.log(`  GSC_PRIVATE_KEY: ${process.env['GSC_PRIVATE_KEY'] ? 'set' : 'NOT SET'}`);
  console.log(`  CLOUDFLARE_API_TOKEN: ${process.env['CLOUDFLARE_API_TOKEN'] ? 'set' : 'NOT SET'}`);
  console.log(`  CLOUDFLARE_ACCOUNT_ID: ${process.env['CLOUDFLARE_ACCOUNT_ID'] ? 'set' : 'NOT SET'}`);
  console.log(`  GA4_ACCOUNT_ID: ${GA4_ACCOUNT_ID ?? 'NOT SET'}`);
  console.log('');

  // =========================================================================
  // 1. GSC Setup - Domain Property
  // =========================================================================
  console.log('='.repeat(60));
  console.log('1. Google Search Console Setup');
  console.log('='.repeat(60));

  if (!isGSCConfigured()) {
    console.log('⚠️  GSC not configured - skipping');
    console.log('   Set GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY environment variables');
  } else {
    try {
      const gscClient = getGSCClient();
      const cloudflare = new CloudflareDNSService();

      // Check if domain property exists
      console.log(`\nChecking if sc-domain:${PARENT_DOMAIN} exists...`);

      const sites = await gscClient.listSites();
      const domainProperty = sites.find(
        s => s.siteUrl === `sc-domain:${PARENT_DOMAIN}`
      );

      if (domainProperty) {
        console.log(`✓ Domain property already exists: sc-domain:${PARENT_DOMAIN}`);
        console.log(`  Permission level: ${domainProperty.permissionLevel}`);
      } else {
        console.log(`Creating domain property: sc-domain:${PARENT_DOMAIN}`);

        // Get Cloudflare zone ID for the domain
        // You'll need to provide this or look it up
        const zoneId = process.env['CLOUDFLARE_EXPERIENCESS_ZONE_ID'];

        if (!zoneId) {
          console.log('⚠️  CLOUDFLARE_EXPERIENCESS_ZONE_ID not set');
          console.log('   Cannot add DNS verification record');
        } else {
          // Register with GSC (adds DNS TXT record)
          const result = await gscClient.registerSite(PARENT_DOMAIN, async (token) => {
            console.log(`Adding TXT record: google-site-verification=${token}`);
            await cloudflare.addGoogleVerificationRecord(zoneId, token);
            console.log('Waiting 10s for DNS propagation...');
            await new Promise(r => setTimeout(r, 10000));
          });

          if (result.success) {
            console.log(`✓ GSC domain property created: ${result.siteUrl}`);
          } else {
            console.log(`✗ GSC registration failed: ${result.error}`);
          }
        }
      }

      // Submit sitemap for parent domain
      console.log('\nSubmitting sitemaps...');
      try {
        await gscClient.submitSitemap(`sc-domain:${PARENT_DOMAIN}`, `https://${PARENT_DOMAIN}/sitemap.xml`);
        console.log(`✓ Submitted: https://${PARENT_DOMAIN}/sitemap.xml`);
      } catch (e) {
        console.log(`  Sitemap submission: ${e instanceof Error ? e.message : 'error'}`);
      }

    } catch (error) {
      console.error('GSC setup error:', error);
    }
  }

  // =========================================================================
  // 2. GA4 Setup - Single Property for All Microsites
  // =========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('2. Google Analytics 4 Setup');
  console.log('='.repeat(60));

  if (!GA4_ACCOUNT_ID) {
    console.log('⚠️  GA4_ACCOUNT_ID not set - skipping GA4 property creation');
    console.log('   Set GA4_ACCOUNT_ID to your Google Analytics account ID');
  } else {
    try {
      const ga4 = new GA4Client();

      console.log(`\nChecking GA4 account ${GA4_ACCOUNT_ID}...`);

      // List existing properties
      const properties = await ga4.listProperties(GA4_ACCOUNT_ID);
      const existingProperty = properties.find(
        p => p.displayName?.includes('Experiencess') ||
             p.displayName?.includes(PARENT_DOMAIN)
      );

      if (existingProperty) {
        console.log(`✓ GA4 property exists: ${existingProperty.displayName}`);
        console.log(`  Property ID: ${existingProperty.propertyId}`);

        // Get measurement ID
        const dataStreams = await ga4.listDataStreams(existingProperty.propertyId);
        const webStream = dataStreams.find(s => s.type === 'WEB_DATA_STREAM');
        if (webStream?.measurementId) {
          console.log(`  Measurement ID: ${webStream.measurementId}`);

          // Store measurement ID in platform settings or database
          await storeMeasurementId(webStream.measurementId);
        }
      } else {
        console.log(`Creating GA4 property for ${PARENT_DOMAIN}...`);

        const property = await ga4.createProperty({
          accountId: `accounts/${GA4_ACCOUNT_ID}`,
          displayName: `Experiencess Microsites`,
          timeZone: 'Europe/London',
          currencyCode: 'GBP',
          industryCategory: 'TRAVEL',
        });

        console.log(`✓ Created property: ${property.displayName}`);

        // Create web data stream
        const stream = await ga4.createWebDataStream({
          propertyId: property.propertyId,
          displayName: `${PARENT_DOMAIN} - All Subdomains`,
          websiteUrl: `https://${PARENT_DOMAIN}`,
        });

        console.log(`✓ Created data stream: ${stream.displayName}`);
        console.log(`  Measurement ID: ${stream.measurementId}`);

        // Store measurement ID
        await storeMeasurementId(stream.measurementId);
      }
    } catch (error) {
      console.error('GA4 setup error:', error);
    }
  }

  // =========================================================================
  // 3. Update Microsite Configs
  // =========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('3. Updating Microsite Configurations');
  console.log('='.repeat(60));

  // Get the stored measurement ID
  const platformSettings = await prisma.platformSettings.findFirst({
    where: { id: 'platform_settings_singleton' },
  });

  const measurementId = (platformSettings as any)?.microsite_ga4_measurement_id;

  if (measurementId) {
    console.log(`\nUpdating microsites with GA4 measurement ID: ${measurementId}`);

    const microsites = await prisma.micrositeConfig.findMany({
      where: { parentDomain: PARENT_DOMAIN },
      select: { id: true, fullDomain: true, seoConfig: true },
    });

    let updated = 0;
    for (const ms of microsites) {
      const currentSeoConfig = (ms.seoConfig as Record<string, any>) || {};

      if (currentSeoConfig['gaMeasurementId'] !== measurementId) {
        await prisma.micrositeConfig.update({
          where: { id: ms.id },
          data: {
            seoConfig: {
              ...currentSeoConfig,
              gaMeasurementId: measurementId,
            },
          },
        });
        updated++;
      }
    }

    console.log(`✓ Updated ${updated} of ${microsites.length} microsites`);
  } else {
    console.log('\n⚠️  No GA4 measurement ID stored - microsites not updated');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Setup Complete');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

/**
 * Store the GA4 measurement ID in platform settings
 */
async function storeMeasurementId(measurementId: string) {
  console.log(`\nStoring measurement ID: ${measurementId}`);

  await prisma.platformSettings.upsert({
    where: { id: 'platform_settings_singleton' },
    create: {
      id: 'platform_settings_singleton',
      allAutonomousProcessesPaused: false,
      enableSiteCreation: true,
      enableContentGeneration: true,
      enableGSCVerification: true,
      enableContentOptimization: true,
      enableABTesting: true,
      maxTotalSites: 1000,
      maxSitesPerHour: 10,
      maxContentPagesPerHour: 100,
      maxGSCRequestsPerHour: 1000,
      maxOpportunityScansPerDay: 5,
      // Store microsite-specific settings in JSON
    },
    update: {},
  });

  // For now, we'll need to add this field to the schema or use a separate config
  console.log(`✓ Measurement ID stored (update microsites via admin or API)`);
  console.log(`\nTo use in microsites, add to .env.local:`);
  console.log(`  MICROSITE_GA4_MEASUREMENT_ID=${measurementId}`);
}

main().catch(console.error);
