#!/usr/bin/env npx ts-node
/**
 * Setup script for experiencess.com microsite domain
 * Configures Cloudflare wildcard DNS and SSL for the microsite parent domain
 *
 * Usage:
 *   npx ts-node scripts/setup-experiencess-domain.ts
 *
 * Prerequisites:
 *   - CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL
 *   - CLOUDFLARE_ACCOUNT_ID
 *   - Domain experiencess.com must be added to Cloudflare
 *   - HEROKU_APP_NAME (the app hosting the website-platform)
 */

import * as dotenv from 'dotenv';
// Load .env first, then .env.local to override
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

// Import the Cloudflare DNS service
async function main() {
  console.log('='.repeat(60));
  console.log('Experiencess.com Domain Setup');
  console.log('='.repeat(60));

  // Dynamic import to avoid issues with module resolution
  const { CloudflareDNSService } = await import(
    '../packages/jobs/src/services/cloudflare-dns'
  );

  const DOMAIN = 'experiencess.com';
  const HEROKU_APP = process.env['HEROKU_APP_NAME'];

  if (!HEROKU_APP) {
    console.error('Error: HEROKU_APP_NAME environment variable is required');
    process.exit(1);
  }

  const herokuDomain = `${HEROKU_APP}.herokuapp.com`;
  console.log(`\nTarget: ${herokuDomain}`);

  try {
    const cf = new CloudflareDNSService();

    // Step 1: Get the zone for experiencess.com
    console.log(`\n[1/6] Looking up zone for ${DOMAIN}...`);
    let zone = await cf.getZone(DOMAIN);

    if (!zone) {
      console.log(`Zone not found. Adding ${DOMAIN} to Cloudflare...`);
      zone = await cf.addZone(DOMAIN);
      console.log(`Zone created: ${zone.id}`);
      console.log(`\nIMPORTANT: Update your domain's nameservers to:`);
      zone.nameServers.forEach((ns) => console.log(`  - ${ns}`));
      console.log(`\nWait for nameserver propagation before continuing.`);
    } else {
      console.log(`Zone found: ${zone.id} (${zone.status})`);
    }

    const zoneId = zone.id;

    // Step 2: List existing DNS records
    console.log(`\n[2/6] Checking existing DNS records...`);
    const existingRecords = await cf.listDNSRecords(zoneId);
    console.log(`Found ${existingRecords.length} existing records`);

    // Step 3: Create root domain record
    console.log(`\n[3/6] Setting up root domain (@)...`);
    const rootRecord = existingRecords.find(
      (r) => (r.name === DOMAIN || r.name === '@') && (r.type === 'A' || r.type === 'CNAME')
    );

    if (rootRecord) {
      console.log(`Root record exists: ${rootRecord.type} -> ${rootRecord.content}`);
      if (rootRecord.content !== herokuDomain) {
        console.log(`Updating to point to ${herokuDomain}...`);
        await cf.updateDNSRecord(zoneId, rootRecord.id, {
          type: 'CNAME',
          name: '@',
          content: herokuDomain,
          proxied: true,
        });
        console.log('Root record updated');
      }
    } else {
      console.log(`Creating root CNAME -> ${herokuDomain}...`);
      await cf.createDNSRecord(zoneId, {
        type: 'CNAME',
        name: '@',
        content: herokuDomain,
        proxied: true,
      });
      console.log('Root record created');
    }

    // Step 4: Create www subdomain record
    console.log(`\n[4/6] Setting up www subdomain...`);
    const wwwRecord = existingRecords.find(
      (r) => r.name === `www.${DOMAIN}` || r.name === 'www'
    );

    if (wwwRecord) {
      console.log(`WWW record exists: ${wwwRecord.type} -> ${wwwRecord.content}`);
    } else {
      console.log(`Creating www CNAME -> ${herokuDomain}...`);
      await cf.createDNSRecord(zoneId, {
        type: 'CNAME',
        name: 'www',
        content: herokuDomain,
        proxied: true,
      });
      console.log('WWW record created');
    }

    // Step 5: Create wildcard subdomain record (*.experiencess.com)
    console.log(`\n[5/6] Setting up wildcard subdomain (*.${DOMAIN})...`);
    const wildcardRecord = existingRecords.find(
      (r) => r.name === `*.${DOMAIN}` || r.name === '*'
    );

    if (wildcardRecord) {
      console.log(`Wildcard record exists: ${wildcardRecord.type} -> ${wildcardRecord.content}`);
      if (wildcardRecord.content !== herokuDomain) {
        console.log(`Updating to point to ${herokuDomain}...`);
        await cf.updateDNSRecord(zoneId, wildcardRecord.id, {
          type: 'CNAME',
          name: '*',
          content: herokuDomain,
          proxied: true,
        });
        console.log('Wildcard record updated');
      }
    } else {
      console.log(`Creating wildcard CNAME -> ${herokuDomain}...`);
      await cf.createDNSRecord(zoneId, {
        type: 'CNAME',
        name: '*',
        content: herokuDomain,
        proxied: true, // Cloudflare proxy for SSL
      });
      console.log('Wildcard record created');
    }

    // Step 6: Configure SSL and HTTPS settings
    console.log(`\n[6/6] Configuring SSL/HTTPS settings...`);

    // Set SSL mode to Full (strict would require origin cert)
    await cf.configureSSL(zoneId, 'full');
    console.log('SSL mode set to Full');

    // Enable always use HTTPS
    await cf.enableAlwaysUseHTTPS(zoneId);
    console.log('Always Use HTTPS enabled');

    // Enable automatic HTTPS rewrites
    await cf.enableAutoHTTPS(zoneId);
    console.log('Automatic HTTPS rewrites enabled');

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Setup Complete!');
    console.log('='.repeat(60));
    console.log(`\nDNS Records configured for ${DOMAIN}:`);
    console.log(`  @ (root)    -> ${herokuDomain} (proxied)`);
    console.log(`  www         -> ${herokuDomain} (proxied)`);
    console.log(`  * (wildcard) -> ${herokuDomain} (proxied)`);
    console.log(`\nSSL: Full mode with Always Use HTTPS`);
    console.log(`\nWildcard SSL: Cloudflare provides free Universal SSL`);
    console.log(`  that automatically covers *.${DOMAIN}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Wait for DNS propagation (usually 1-5 minutes with Cloudflare)`);
    console.log(`  2. Run database migration: npx prisma migrate dev`);
    console.log(`  3. Test: curl -I https://test-subdomain.${DOMAIN}`);
    console.log(`  4. Create a test microsite in the database`);
  } catch (error) {
    console.error('\nError during setup:', error);
    process.exit(1);
  }
}

main().catch(console.error);
