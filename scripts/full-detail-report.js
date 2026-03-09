const path = require('path');
async function main() {
  const be = require(path.join(__dirname, '../packages/jobs/dist/services/bidding-engine.js'));
  const result = await be.runBiddingEngine({ mode: 'full', maxDailyBudget: 200 });

  console.info('=== FULL CAMPAIGN DETAIL ===\n');
  console.info('Total candidates: ' + result.candidates.length);
  console.info('Total groups: ' + result.groups.length + '\n');

  for (var i = 0; i < result.groups.length; i++) {
    var g = result.groups[i];
    console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.info('CAMPAIGN: ' + (g.campaignGroup || 'ungrouped'));
    console.info(
      'Keywords: ' +
        g.candidates.length +
        ' | Ad Groups: ' +
        (g.adGroups ? g.adGroups.length : 0) +
        ' | Budget: £' +
        g.totalExpectedDailyCost.toFixed(2) +
        '/day'
    );
    console.info('');

    if (g.adGroups) {
      for (var j = 0; j < g.adGroups.length; j++) {
        var ag = g.adGroups[j];
        console.info('  AD GROUP ' + (j + 1) + ': ' + ag.primaryKeyword);
        console.info('  Landing Page Type: ' + ag.landingPageType);
        console.info('  Landing URL: ' + ag.targetUrl);
        console.info('  Keywords (' + ag.keywords.length + '):');
        for (var k = 0; k < ag.keywords.length; k++) {
          console.info('    - ' + ag.keywords[k]);
        }
        console.info('');
      }
    }
  }
  console.info('\n=== DONE ===');
  process.exit(0);
}
main().catch(function (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
});
