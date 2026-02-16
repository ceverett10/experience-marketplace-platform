/**
 * End-to-End Test: Ad Platform IDs Auto-Fetch & Propagation
 *
 * Tests the full pipeline:
 * 1. propagateAdPlatformIds() — writes pixel IDs to all Sites and Microsites
 * 2. Verifies all active Sites have the correct seoConfig values
 * 3. Verifies all active Microsites have the correct seoConfig values
 * 4. Tests idempotent re-propagation (skip already-correct records)
 * 5. Cleans up test pixel IDs after the test
 * 6. Verifies the website-platform tenant mapping surfaces the IDs
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/test-ad-platform-ids.ts
 *   # Or on Heroku:
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/test-ad-platform-ids.js'
 */
import { prisma } from '@experience-marketplace/database';
import { propagateAdPlatformIds } from '../services/ad-platform-ids';

// Test pixel IDs — clearly fake to avoid confusion with real ones
const TEST_META_PIXEL_ID = 'TEST_PIXEL_9999999999';
const TEST_GOOGLE_ADS_ID = 'AW-TEST1234567890';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function pass(name: string, details: string) {
  results.push({ name, passed: true, details });
  console.log(`  PASS  ${name}: ${details}`);
}

function fail(name: string, details: string) {
  results.push({ name, passed: false, details });
  console.error(`  FAIL  ${name}: ${details}`);
}

async function main() {
  console.log('\n=== AD PLATFORM IDS END-TO-END TEST ===\n');

  // ─── Phase 1: Pre-flight checks ──────────────────────────────────────

  console.log('Phase 1: Pre-flight checks\n');

  const activeSites = await prisma.site.findMany({
    where: { status: { in: ['ACTIVE', 'REVIEW'] } },
    select: { id: true, name: true, primaryDomain: true, seoConfig: true },
  });

  const activeMicrosites = await prisma.micrositeConfig.findMany({
    where: { status: { in: ['ACTIVE', 'REVIEW', 'GENERATING'] } },
    select: { id: true, fullDomain: true, seoConfig: true },
  });

  console.log(`  Found ${activeSites.length} active/review sites`);
  console.log(`  Found ${activeMicrosites.length} active/review/generating microsites\n`);

  if (activeSites.length === 0) {
    fail('Pre-flight', 'No active sites found — cannot test propagation');
    printSummary();
    return;
  }

  pass(
    'Pre-flight',
    `${activeSites.length} sites, ${activeMicrosites.length} microsites available`
  );

  // Save original seoConfig values so we can restore them
  const originalSiteConfigs = new Map<string, unknown>();
  for (const site of activeSites) {
    originalSiteConfigs.set(site.id, site.seoConfig);
  }
  const originalMicrositeConfigs = new Map<string, unknown>();
  for (const ms of activeMicrosites) {
    originalMicrositeConfigs.set(ms.id, ms.seoConfig);
  }

  try {
    // ─── Phase 2: Propagate test IDs ──────────────────────────────────────

    console.log('\nPhase 2: Propagating test pixel IDs\n');

    const propagateResult = await propagateAdPlatformIds({
      metaPixelId: TEST_META_PIXEL_ID,
      googleAdsId: TEST_GOOGLE_ADS_ID,
    });

    console.log(`  Sites updated: ${propagateResult.sitesUpdated}`);
    console.log(`  Sites skipped: ${propagateResult.sitesSkipped}`);
    console.log(`  Microsites updated: ${propagateResult.micrositesUpdated}`);
    console.log(`  Microsites skipped: ${propagateResult.micrositesSkipped}`);
    console.log(`  Errors: ${propagateResult.errors}\n`);

    if (propagateResult.errors > 0) {
      fail('Propagation', `${propagateResult.errors} errors during propagation`);
    } else {
      pass(
        'Propagation',
        `No errors, ${propagateResult.sitesUpdated} sites + ${propagateResult.micrositesUpdated} microsites updated`
      );
    }

    // ─── Phase 3: Verify Sites ────────────────────────────────────────────

    console.log('\nPhase 3: Verifying Sites have correct pixel IDs\n');

    const sitesAfter = await prisma.site.findMany({
      where: { status: { in: ['ACTIVE', 'REVIEW'] } },
      select: { id: true, name: true, primaryDomain: true, seoConfig: true },
    });

    let siteFailures = 0;
    for (const site of sitesAfter) {
      const config = site.seoConfig as Record<string, unknown> | null;
      const metaOk = config?.['metaPixelId'] === TEST_META_PIXEL_ID;
      const googleOk = config?.['googleAdsId'] === TEST_GOOGLE_ADS_ID;

      if (!metaOk || !googleOk) {
        siteFailures++;
        console.error(
          `  FAIL  Site "${site.name}" (${site.primaryDomain}): ` +
            `metaPixelId=${config?.['metaPixelId']} (expected ${TEST_META_PIXEL_ID}), ` +
            `googleAdsId=${config?.['googleAdsId']} (expected ${TEST_GOOGLE_ADS_ID})`
        );
      }
    }

    if (siteFailures === 0) {
      pass('Site verification', `All ${sitesAfter.length} sites have correct pixel IDs`);
    } else {
      fail(
        'Site verification',
        `${siteFailures}/${sitesAfter.length} sites have incorrect pixel IDs`
      );
    }

    // Verify seoConfig preserved other fields
    const sampleSite = sitesAfter[0];
    if (sampleSite) {
      const config = sampleSite.seoConfig as Record<string, unknown> | null;
      const hasOtherFields =
        config &&
        ('titleTemplate' in config ||
          'defaultDescription' in config ||
          'keywords' in config ||
          'gaMeasurementId' in config);
      if (hasOtherFields) {
        pass(
          'Config preservation',
          `Site "${sampleSite.name}" seoConfig retains other fields (titleTemplate, keywords, etc.)`
        );
      } else {
        // It's possible site had no prior seoConfig — not a failure
        console.log(`  INFO  Site "${sampleSite.name}" had minimal seoConfig before propagation`);
      }
    }

    // ─── Phase 4: Verify Microsites ────────────────────────────────────────

    console.log('\nPhase 4: Verifying Microsites have correct pixel IDs\n');

    if (activeMicrosites.length === 0) {
      console.log('  SKIP  No active microsites to verify');
      pass('Microsite verification', 'No microsites to verify (skipped)');
    } else {
      const micrositesAfter = await prisma.micrositeConfig.findMany({
        where: { status: { in: ['ACTIVE', 'REVIEW', 'GENERATING'] } },
        select: { id: true, fullDomain: true, seoConfig: true },
      });

      let msFailures = 0;
      const sampleSize = Math.min(micrositesAfter.length, 20);
      for (let i = 0; i < micrositesAfter.length; i++) {
        const ms = micrositesAfter[i]!;
        const config = ms.seoConfig as Record<string, unknown> | null;
        const metaOk = config?.['metaPixelId'] === TEST_META_PIXEL_ID;
        const googleOk = config?.['googleAdsId'] === TEST_GOOGLE_ADS_ID;

        if (!metaOk || !googleOk) {
          msFailures++;
          // Only log first 5 failures to avoid noise
          if (msFailures <= 5) {
            console.error(
              `  FAIL  Microsite "${ms.fullDomain}": ` +
                `metaPixelId=${config?.['metaPixelId']}, googleAdsId=${config?.['googleAdsId']}`
            );
          }
        }
      }

      if (msFailures > 5) {
        console.error(`  ... and ${msFailures - 5} more microsite failures`);
      }

      if (msFailures === 0) {
        pass(
          'Microsite verification',
          `All ${micrositesAfter.length} microsites have correct pixel IDs`
        );
      } else {
        fail(
          'Microsite verification',
          `${msFailures}/${micrositesAfter.length} microsites have incorrect pixel IDs`
        );
      }

      // Sample detail log
      const sampleMs = micrositesAfter.slice(0, 3);
      for (const ms of sampleMs) {
        const config = ms.seoConfig as Record<string, unknown> | null;
        console.log(
          `  Sample: ${ms.fullDomain} → metaPixelId=${config?.['metaPixelId']}, googleAdsId=${config?.['googleAdsId']}`
        );
      }
    }

    // ─── Phase 5: Test idempotent re-propagation ───────────────────────────

    console.log('\nPhase 5: Testing idempotent re-propagation\n');

    const rerunResult = await propagateAdPlatformIds({
      metaPixelId: TEST_META_PIXEL_ID,
      googleAdsId: TEST_GOOGLE_ADS_ID,
    });

    console.log(`  Sites updated: ${rerunResult.sitesUpdated} (expected 0)`);
    console.log(`  Sites skipped: ${rerunResult.sitesSkipped} (expected ${activeSites.length})`);
    console.log(`  Microsites updated: ${rerunResult.micrositesUpdated} (expected 0)`);
    console.log(
      `  Microsites skipped: ${rerunResult.micrositesSkipped} (expected ${activeMicrosites.length})\n`
    );

    if (rerunResult.sitesUpdated === 0 && rerunResult.micrositesUpdated === 0) {
      pass(
        'Idempotent re-run',
        `All ${rerunResult.sitesSkipped} sites and ${rerunResult.micrositesSkipped} microsites correctly skipped`
      );
    } else {
      fail(
        'Idempotent re-run',
        `Expected 0 updates, got ${rerunResult.sitesUpdated} sites + ${rerunResult.micrositesUpdated} microsites`
      );
    }

    // ─── Phase 6: Test partial update (only one ID) ──────────────────────────

    console.log('\nPhase 6: Testing partial update (new Google Ads ID only)\n');

    const NEW_GOOGLE_ADS_ID = 'AW-NEWTEST99999';
    const partialResult = await propagateAdPlatformIds({
      metaPixelId: null,
      googleAdsId: NEW_GOOGLE_ADS_ID,
    });

    console.log(`  Sites updated: ${partialResult.sitesUpdated}`);
    console.log(`  Microsites updated: ${partialResult.micrositesUpdated}\n`);

    // Verify only googleAdsId changed, metaPixelId preserved
    const siteAfterPartial = await prisma.site.findFirst({
      where: { status: { in: ['ACTIVE', 'REVIEW'] } },
      select: { id: true, name: true, seoConfig: true },
    });

    if (siteAfterPartial) {
      const config = siteAfterPartial.seoConfig as Record<string, unknown> | null;
      const metaPreserved = config?.['metaPixelId'] === TEST_META_PIXEL_ID;
      const googleUpdated = config?.['googleAdsId'] === NEW_GOOGLE_ADS_ID;

      if (metaPreserved && googleUpdated) {
        pass(
          'Partial update',
          `Meta pixel preserved (${TEST_META_PIXEL_ID}), Google Ads updated (${NEW_GOOGLE_ADS_ID})`
        );
      } else {
        fail(
          'Partial update',
          `Meta=${config?.['metaPixelId']} (expected ${TEST_META_PIXEL_ID}), Google=${config?.['googleAdsId']} (expected ${NEW_GOOGLE_ADS_ID})`
        );
      }
    }

    // ─── Phase 7: Verify tenant.ts mapping ──────────────────────────────────

    console.log('\nPhase 7: Verifying tenant.ts SiteConfig mapping surfaces pixel IDs\n');

    // We can't import the website-platform tenant.ts from jobs package,
    // but we can verify the shape of seoConfig matches what tenant.ts expects
    const siteForTenant = await prisma.site.findFirst({
      where: { status: 'ACTIVE' },
      select: { seoConfig: true },
    });

    if (siteForTenant) {
      const config = siteForTenant.seoConfig as Record<string, unknown> | null;
      const hasMetaPixelId = 'metaPixelId' in (config || {});
      const hasGoogleAdsId = 'googleAdsId' in (config || {});

      if (hasMetaPixelId && hasGoogleAdsId) {
        pass(
          'Tenant mapping',
          'seoConfig has metaPixelId and googleAdsId fields — tenant.ts mapSiteToConfig() will surface them'
        );
      } else {
        fail(
          'Tenant mapping',
          `Missing fields in seoConfig: metaPixelId=${hasMetaPixelId}, googleAdsId=${hasGoogleAdsId}`
        );
      }
    }

    // Same for microsites
    const msForTenant = await prisma.micrositeConfig.findFirst({
      where: { status: 'ACTIVE' },
      select: { seoConfig: true },
    });

    if (msForTenant) {
      const config = msForTenant.seoConfig as Record<string, unknown> | null;
      const hasMetaPixelId = 'metaPixelId' in (config || {});
      const hasGoogleAdsId = 'googleAdsId' in (config || {});

      if (hasMetaPixelId && hasGoogleAdsId) {
        pass(
          'Microsite tenant mapping',
          'MicrositeConfig seoConfig has metaPixelId and googleAdsId — mapMicrositeToSiteConfig() will surface them'
        );
      } else {
        fail(
          'Microsite tenant mapping',
          `Missing: metaPixelId=${hasMetaPixelId}, googleAdsId=${hasGoogleAdsId}`
        );
      }
    }
  } finally {
    // ─── Cleanup: Restore original seoConfig values ───────────────────────

    console.log('\n\nPhase 8: Restoring original seoConfig values\n');

    let restored = 0;
    let restoreErrors = 0;

    for (const [id, originalConfig] of originalSiteConfigs) {
      try {
        await prisma.site.update({
          where: { id },
          data: { seoConfig: (originalConfig as any) ?? {} },
        });
        restored++;
      } catch (error) {
        restoreErrors++;
        console.error(`  Error restoring site ${id}:`, error);
      }
    }

    const RESTORE_BATCH_SIZE = 50;
    const micrositeEntries = [...originalMicrositeConfigs.entries()];
    for (let i = 0; i < micrositeEntries.length; i += RESTORE_BATCH_SIZE) {
      const batch = micrositeEntries.slice(i, i + RESTORE_BATCH_SIZE);
      await Promise.all(
        batch.map(async ([id, originalConfig]) => {
          try {
            await prisma.micrositeConfig.update({
              where: { id },
              data: { seoConfig: (originalConfig as any) ?? {} },
            });
            restored++;
          } catch (error) {
            restoreErrors++;
          }
        })
      );
    }

    if (restoreErrors === 0) {
      pass('Cleanup', `Restored ${restored} original seoConfig values`);
    } else {
      fail('Cleanup', `Restored ${restored} but ${restoreErrors} errors during restore`);
    }
  }

  printSummary();
  await prisma.$disconnect();
}

function printSummary() {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n' + '='.repeat(60));
  console.log(`\n  RESULTS: ${passed} passed, ${failed} failed out of ${results.length} tests\n`);

  if (failed > 0) {
    console.log('  Failed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`    - ${r.name}: ${r.details}`);
    }
    console.log('');
  }

  console.log('='.repeat(60) + '\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test script failed:', err);
  process.exit(1);
});
