/**
 * Run the bidding engine in FULL mode (score + select candidates) for diagnostic purposes.
 * This does NOT create campaigns — it only returns the scoring results.
 *
 * Usage:
 *   node scripts/run-bidding-full-report.js
 *   heroku run 'cd /app && node scripts/run-bidding-full-report.js' --app holibob-experiences-demand-gen
 */
const path = require('path');

async function main() {
  // Load the compiled bidding engine
  const biddingEngine = require(
    path.join(__dirname, '../packages/jobs/dist/services/bidding-engine.js')
  );

  const budget = 200;
  console.info('=== BIDDING ENGINE FULL DIAGNOSTIC ===');
  console.info('Budget: £' + budget + '/day');
  console.info('Mode: full (score + select, NO campaign creation)');
  console.info('');

  const result = await biddingEngine.runBiddingEngine({
    mode: 'full',
    maxDailyBudget: budget,
  });

  console.info('\n=== RESULTS SUMMARY ===');
  console.info('Sites/microsites analyzed: ' + result.sitesAnalyzed);
  console.info('Candidates scored: ' + result.candidates.length);
  console.info('Campaign groups: ' + (result.groups ? result.groups.length : 0));
  console.info('Budget allocated: £' + result.budgetAllocated.toFixed(2));
  console.info('Budget remaining: £' + result.budgetRemaining.toFixed(2));

  // Profile summary
  const positiveCpc = result.profiles.filter(function (p) {
    return p.maxProfitableCpc > 0.01;
  });
  console.info(
    '\nProfiles with positive maxCPC: ' + positiveCpc.length + '/' + result.profiles.length
  );
  if (positiveCpc.length > 0) {
    var topProfiles = positiveCpc
      .sort(function (a, b) {
        return b.maxProfitableCpc - a.maxProfitableCpc;
      })
      .slice(0, 10);
    console.info('Top 10 by maxCPC:');
    for (var i = 0; i < topProfiles.length; i++) {
      var p = topProfiles[i];
      console.info(
        '  ' +
          p.siteName +
          ': maxCPC=£' +
          p.maxProfitableCpc.toFixed(4) +
          ', AOV=£' +
          p.avgOrderValue.toFixed(2) +
          ', commission=' +
          p.avgCommissionRate.toFixed(1) +
          '%, CVR=' +
          (p.conversionRate * 100).toFixed(2) +
          '% ' +
          (p.dataQuality.usedCatalogFallback ? '[catalog]' : '[real]') +
          (p.dataQuality.usedDefaultCvr ? '[defaultCVR]' : '')
      );
    }
  }

  if (result.candidates.length === 0) {
    console.info('\n=== ZERO CANDIDATES — DEBUGGING ===');

    // Check keyword pool
    var prisma = require(
      path.join(__dirname, '../packages/jobs/dist/node_modules/.prisma/client/index.js')
    );
    // Try importing prisma from the database package
    var db;
    try {
      db = require(path.join(__dirname, '../packages/database/dist/index.js'));
    } catch (_e) {
      try {
        db = require('@experience-marketplace/database');
      } catch (_e2) {
        console.info('Could not load prisma client for debugging');
      }
    }

    if (db && db.prisma) {
      var p2 = db.prisma;
      var total = await p2.sEOOpportunity.count({ where: { status: 'PAID_CANDIDATE' } });
      var withSite = await p2.sEOOpportunity.count({
        where: { status: 'PAID_CANDIDATE', siteId: { not: null } },
      });
      var withCpc = await p2.sEOOpportunity.count({
        where: { status: 'PAID_CANDIDATE', cpc: { gt: 0 } },
      });
      var withDomain = await p2.sEOOpportunity.count({
        where: {
          status: 'PAID_CANDIDATE',
          siteId: { not: null },
          site: { primaryDomain: { not: null } },
        },
      });

      console.info('PAID_CANDIDATE keywords: ' + total);
      console.info('  With siteId: ' + withSite);
      console.info('  With CPC > 0: ' + withCpc);
      console.info('  With site + domain: ' + withDomain);

      // CPC distribution
      var cpcBuckets = await p2.$queryRaw`
        SELECT
          COUNT(*)::int as total,
          SUM(CASE WHEN cpc > 0 AND cpc <= 0.50 THEN 1 ELSE 0 END)::int as under_050,
          SUM(CASE WHEN cpc > 0.50 AND cpc <= 1.00 THEN 1 ELSE 0 END)::int as cpc_050_100,
          SUM(CASE WHEN cpc > 1.00 AND cpc <= 2.00 THEN 1 ELSE 0 END)::int as cpc_100_200,
          SUM(CASE WHEN cpc > 2.00 THEN 1 ELSE 0 END)::int as over_200,
          AVG(cpc)::float as avg_cpc,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cpc)::float as median_cpc
        FROM seo_opportunities
        WHERE status = 'PAID_CANDIDATE' AND cpc > 0
      `;
      if (cpcBuckets.length > 0) {
        var b = cpcBuckets[0];
        console.info('\nCPC Distribution (keywords with CPC > 0):');
        console.info('  Under £0.50: ' + b.under_050);
        console.info('  £0.50-1.00:  ' + b.cpc_050_100);
        console.info('  £1.00-2.00:  ' + b.cpc_100_200);
        console.info('  Over £2.00:  ' + b.over_200);
        console.info('  Average CPC: £' + (b.avg_cpc || 0).toFixed(2));
        console.info('  Median CPC:  £' + (b.median_cpc || 0).toFixed(2));
      }

      // AI evaluation status
      var aiDecisions = await p2.$queryRaw`
        SELECT
          COALESCE("sourceData"::jsonb->'aiEvaluation'->>'decision', 'NONE') as decision,
          COUNT(*)::int as count
        FROM seo_opportunities
        WHERE status = 'PAID_CANDIDATE'
        GROUP BY decision
        ORDER BY count DESC
      `;
      console.info('\nAI Evaluation status:');
      for (var j = 0; j < aiDecisions.length; j++) {
        console.info('  ' + aiDecisions[j].decision + ': ' + aiDecisions[j].count);
      }

      // Compare max profitable CPC vs keyword CPCs
      var maxCpc =
        result.profiles.length > 0
          ? Math.max.apply(
              null,
              result.profiles.map(function (p) {
                return p.maxProfitableCpc;
              })
            )
          : 0;
      var avgCpc =
        result.profiles.length > 0
          ? result.profiles.reduce(function (s, p) {
              return s + p.maxProfitableCpc;
            }, 0) / result.profiles.length
          : 0;

      console.info(
        '\nMaxCPC from profiles: max=£' + maxCpc.toFixed(4) + ', avg=£' + avgCpc.toFixed(4)
      );

      var kwAboveMax = await p2.sEOOpportunity.count({
        where: {
          status: 'PAID_CANDIDATE',
          siteId: { not: null },
          cpc: { gt: maxCpc },
        },
      });
      var kwBelowMax = await p2.sEOOpportunity.count({
        where: {
          status: 'PAID_CANDIDATE',
          siteId: { not: null },
          cpc: { gt: 0, lte: maxCpc },
        },
      });
      console.info('Keywords with CPC <= maxCPC (£' + maxCpc.toFixed(2) + '): ' + kwBelowMax);
      console.info('Keywords with CPC > maxCPC: ' + kwAboveMax);

      await p2.$disconnect();
    }
  } else {
    // Show top candidates
    console.info('\nTop 20 candidates:');
    var top20 = result.candidates.slice(0, 20);
    for (var k = 0; k < top20.length; k++) {
      var c = top20[k];
      var roas = c.expectedDailyCost > 0 ? c.expectedDailyRevenue / c.expectedDailyCost : 0;
      console.info(
        '  [score=' +
          c.profitabilityScore +
          '] ' +
          c.keyword +
          ' (' +
          c.platform +
          ')' +
          ' CPC=£' +
          c.estimatedCpc.toFixed(2) +
          ' ROAS=' +
          roas.toFixed(1) +
          'x' +
          ' -> ' +
          c.landingPageType +
          ' ' +
          c.targetUrl
      );
    }

    // Landing page type breakdown
    var typeCount = {};
    for (var m = 0; m < result.candidates.length; m++) {
      var type = result.candidates[m].landingPageType;
      typeCount[type] = (typeCount[type] || 0) + 1;
    }
    console.info('\nLanding page types:');
    for (var type in typeCount) {
      console.info('  ' + type + ': ' + typeCount[type]);
    }

    // Groups summary
    if (result.groups && result.groups.length > 0) {
      console.info('\nCampaign groups: ' + result.groups.length);
      for (var n = 0; n < Math.min(result.groups.length, 15); n++) {
        var g = result.groups[n];
        console.info(
          '  [' +
            (g.campaignGroup || 'ungrouped') +
            '] ' +
            (g.micrositeDomain || g.siteName || '?').substring(0, 40) +
            ' (' +
            g.platform +
            '): ' +
            g.candidates.length +
            ' kw, ' +
            (g.adGroups ? g.adGroups.length : 0) +
            ' ad groups, £' +
            g.totalExpectedDailyCost.toFixed(2) +
            '/day'
        );
        // Show ad group details
        if (g.adGroups) {
          for (var ag = 0; ag < Math.min(g.adGroups.length, 5); ag++) {
            var adg = g.adGroups[ag];
            console.info(
              '    AG: ' +
                adg.primaryKeyword +
                ' | ' +
                adg.landingPageType +
                ' | ' +
                adg.keywords.length +
                ' kw' +
                ' | ' +
                adg.targetUrl.substring(0, 60)
            );
          }
          if (g.adGroups.length > 5) {
            console.info('    ... and ' + (g.adGroups.length - 5) + ' more ad groups');
          }
        }
      }
    }
  }

  console.info('\n=== DONE ===');
  process.exit(0);
}

main().catch(function (e) {
  console.error('ERROR:', e.message || e);
  console.error(e.stack);
  process.exit(1);
});
