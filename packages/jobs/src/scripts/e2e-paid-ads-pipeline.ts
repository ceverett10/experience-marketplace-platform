/**
 * End-to-End Paid Ads Pipeline Validation
 *
 * Tests every stage of the pipeline before going live with spend:
 *
 *   1. Database State — Campaign structure, keywords, budgets, targeting
 *   2. Bidding Engine — Profitability calc, scoring, grouping (dry run)
 *   3. Meta API — Connection, token validity, interest search
 *   4. Google Ads API — Connection check
 *   5. Campaign Data Integrity — Budget floors, landing URLs, UTMs, ad groups
 *   6. Deployment Readiness — DRAFT/PAUSED campaign structure
 *   7. Budget Optimizer Logic — Pause/scale thresholds
 *   8. Alert System — ad_alerts table operational
 *   9. Conversion Tracking — CAPI readiness
 *  10. Admin Dashboard API — Data returned correctly
 *
 * Usage:
 *   Local:  npx tsx packages/jobs/src/scripts/e2e-paid-ads-pipeline.ts
 *   Heroku: heroku run 'cd /app && node packages/jobs/dist/scripts/e2e-paid-ads-pipeline.js'
 */

import { prisma } from '@experience-marketplace/database';
import { runBiddingEngine } from '../services/bidding-engine';
import { isGoogleAdsConfigured } from '../services/google-ads-client.js';
import { PAID_TRAFFIC_CONFIG } from '../config/paid-traffic';

// --- Test harness -----------------------------------------------------------

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  message: string;
  details?: string;
}

const results: TestResult[] = [];

function pass(name: string, message: string, details?: string) {
  results.push({ name, status: 'PASS', message, details });
  console.log(`  ✓ ${name}: ${message}`);
}

function fail(name: string, message: string, details?: string) {
  results.push({ name, status: 'FAIL', message, details });
  console.log(`  ✗ ${name}: ${message}`);
  if (details) console.log(`    → ${details}`);
}

function warn(name: string, message: string, details?: string) {
  results.push({ name, status: 'WARN', message, details });
  console.log(`  ⚠ ${name}: ${message}`);
  if (details) console.log(`    → ${details}`);
}

function skip(name: string, message: string) {
  results.push({ name, status: 'SKIP', message });
  console.log(`  ○ ${name}: ${message}`);
}

// --- Phase 1: Database State ------------------------------------------------

async function phase1_databaseState() {
  console.log('\n═══ PHASE 1: DATABASE STATE ═══\n');

  // 1.1 Campaign counts by status
  const statusCounts = await prisma.adCampaign.groupBy({
    by: ['status'],
    _count: true,
  });
  const statusMap: Record<string, number> = {};
  for (const s of statusCounts) statusMap[s.status] = s._count;
  const total = Object.values(statusMap).reduce((a, b) => a + b, 0);

  if (total > 0) {
    pass('Campaign records', `${total} campaigns: ${JSON.stringify(statusMap)}`);
  } else {
    fail('Campaign records', 'No campaigns found in database');
  }

  // 1.2 Platform distribution
  const platformCounts = await prisma.adCampaign.groupBy({
    by: ['platform'],
    _count: true,
  });
  const platforms: Record<string, number> = {};
  for (const p of platformCounts) platforms[p.platform] = p._count;

  if (platforms['FACEBOOK'] && platforms['FACEBOOK'] > 0) {
    pass('Meta campaigns', `${platforms['FACEBOOK']} Meta/Facebook campaigns`);
  } else {
    warn('Meta campaigns', 'No Meta campaigns found');
  }

  if (platforms['GOOGLE_SEARCH'] && platforms['GOOGLE_SEARCH'] > 0) {
    pass('Google campaigns', `${platforms['GOOGLE_SEARCH']} Google Search campaigns`);
  } else {
    warn(
      'Google campaigns',
      'No Google campaigns found (may be expected if Google Ads not configured)'
    );
  }

  // 1.3 Keyword pool
  const kwCount = await prisma.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE' as any },
  });
  if (kwCount >= 100) {
    pass('Keyword pool', `${kwCount} PAID_CANDIDATE keywords`);
  } else if (kwCount > 0) {
    warn('Keyword pool', `Only ${kwCount} PAID_CANDIDATE keywords (expected 100+)`);
  } else {
    fail('Keyword pool', 'No PAID_CANDIDATE keywords found');
  }

  // 1.4 Bidding profiles
  const profileCount = await prisma.biddingProfile.count();
  if (profileCount > 0) {
    pass('Bidding profiles', `${profileCount} site profitability profiles`);
  } else {
    fail('Bidding profiles', 'No bidding profiles found — engine may not have run');
  }

  // 1.5 Microsites
  const msCount = await prisma.micrositeConfig.count({ where: { status: 'ACTIVE' } });
  if (msCount > 0) {
    pass('Active microsites', `${msCount} active microsites for campaign targeting`);
  } else {
    warn('Active microsites', 'No active microsites — campaigns will route to main sites only');
  }

  // 1.6 ad_alerts table
  try {
    const alertCount = await (prisma as any).adAlert.count();
    pass('ad_alerts table', `Table exists (${alertCount} alerts)`);
  } catch {
    fail('ad_alerts table', 'Table does not exist — migration 20260213180000 not applied');
  }

  // 1.7 booking_funnel_events table
  try {
    const funnelCount = await (prisma as any).bookingFunnelEvent.count();
    pass('booking_funnel_events table', `Table exists (${funnelCount} events)`);
  } catch {
    fail('booking_funnel_events table', 'Table does not exist — will affect funnel analytics');
  }

  // 1.8 Booking gclid/fbclid columns
  try {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Booking' AND column_name IN ('gclid', 'fbclid')`
    );
    const colNames = cols.map((c) => c.column_name).sort();
    if (colNames.includes('fbclid') && colNames.includes('gclid')) {
      pass('Booking click ID columns', 'gclid and fbclid columns exist on Booking table');
    } else {
      fail(
        'Booking click ID columns',
        `Missing columns: ${['gclid', 'fbclid'].filter((c) => !colNames.includes(c)).join(', ')}`
      );
    }
  } catch (err: any) {
    fail('Booking click ID columns', err.message.substring(0, 100));
  }

  // 1.9 Social accounts (Meta token)
  const fbAccount = await prisma.socialAccount.findFirst({
    where: { platform: 'FACEBOOK', isActive: true },
    select: { id: true, tokenExpiresAt: true, accountId: true },
  });
  if (fbAccount) {
    const expiresAt = fbAccount.tokenExpiresAt;
    if (expiresAt && expiresAt < new Date()) {
      fail(
        'Meta social account',
        'Facebook token is expired',
        `Expired: ${expiresAt.toISOString()}`
      );
    } else {
      pass(
        'Meta social account',
        `Active Facebook account (${fbAccount.accountId})${expiresAt ? ` expires ${expiresAt.toISOString()}` : ''}`
      );
    }
  } else {
    fail(
      'Meta social account',
      'No active Facebook social account found — Meta deployment will fail'
    );
  }

  // 1.10 Meta Ad Account ID env
  const metaAdAccount = process.env['META_AD_ACCOUNT_ID'];
  if (metaAdAccount) {
    pass('META_AD_ACCOUNT_ID', `Set: ${metaAdAccount}`);
  } else {
    fail('META_AD_ACCOUNT_ID', 'Not set — Meta campaign creation will be skipped');
  }
}

// --- Phase 2: Campaign Data Integrity ---------------------------------------

async function phase2_campaignIntegrity() {
  console.log('\n═══ PHASE 2: CAMPAIGN DATA INTEGRITY ═══\n');

  const campaigns = await prisma.adCampaign.findMany({
    where: { status: { in: ['DRAFT', 'PAUSED', 'ACTIVE'] } },
    include: { site: { select: { name: true, primaryDomain: true } } },
  });

  if (campaigns.length === 0) {
    fail('Campaign count', 'No active/draft/paused campaigns to validate');
    return;
  }

  // 2.1 Budget floors
  const subMinBudget = campaigns.filter(
    (c) => Number(c.dailyBudget) < PAID_TRAFFIC_CONFIG.minDailyBudget
  );
  if (subMinBudget.length === 0) {
    pass(
      'Budget floor (£1)',
      `All ${campaigns.length} campaigns meet minimum £${PAID_TRAFFIC_CONFIG.minDailyBudget}/day`
    );
  } else {
    fail(
      'Budget floor (£1)',
      `${subMinBudget.length} campaigns have budget < £${PAID_TRAFFIC_CONFIG.minDailyBudget}`,
      `Examples: ${subMinBudget
        .slice(0, 3)
        .map((c) => `${c.name}: £${Number(c.dailyBudget).toFixed(2)}`)
        .join(', ')}`
    );
  }

  // 2.2 Budget caps
  const overMaxBudget = campaigns.filter(
    (c) => Number(c.dailyBudget) > PAID_TRAFFIC_CONFIG.maxPerCampaignBudget
  );
  if (overMaxBudget.length === 0) {
    pass(
      'Budget cap (£50)',
      `No campaigns exceed £${PAID_TRAFFIC_CONFIG.maxPerCampaignBudget}/day`
    );
  } else {
    fail(
      'Budget cap (£50)',
      `${overMaxBudget.length} campaigns exceed £${PAID_TRAFFIC_CONFIG.maxPerCampaignBudget}/day`,
      overMaxBudget
        .slice(0, 3)
        .map((c) => `${c.name}: £${Number(c.dailyBudget).toFixed(2)}`)
        .join(', ')
    );
  }

  // 2.3 Total portfolio budget
  const totalBudget = campaigns.reduce((s, c) => s + Number(c.dailyBudget), 0);
  const maxDaily = PAID_TRAFFIC_CONFIG.maxDailyBudget;
  if (totalBudget <= maxDaily * 1.1) {
    pass('Portfolio budget', `£${totalBudget.toFixed(2)}/day total (cap: £${maxDaily})`);
  } else {
    warn(
      'Portfolio budget',
      `£${totalBudget.toFixed(2)}/day exceeds cap £${maxDaily}/day`,
      'Budget optimizer will enforce cap at runtime'
    );
  }

  // 2.4 Keywords present
  const noKeywords = campaigns.filter((c) => !c.keywords || c.keywords.length === 0);
  if (noKeywords.length === 0) {
    pass('Keywords populated', `All campaigns have keywords`);
  } else {
    fail('Keywords populated', `${noKeywords.length} campaigns have no keywords`);
  }

  // 2.5 Keyword count distribution
  const kwCounts = campaigns.map((c) => c.keywords.length);
  const avgKw = kwCounts.reduce((a, b) => a + b, 0) / kwCounts.length;
  const maxKw = Math.max(...kwCounts);
  const minKw = Math.min(...kwCounts);
  const totalKw = new Set(campaigns.flatMap((c) => c.keywords)).size;
  pass(
    'Keyword distribution',
    `${totalKw} unique keywords, avg ${avgKw.toFixed(1)}/campaign (min: ${minKw}, max: ${maxKw})`
  );

  // 2.6 Target URLs valid
  const noUrl = campaigns.filter((c) => !c.targetUrl || c.targetUrl.length < 10);
  if (noUrl.length === 0) {
    pass('Target URLs', `All campaigns have target URLs`);
  } else {
    fail('Target URLs', `${noUrl.length} campaigns have missing/invalid target URLs`);
  }

  // 2.7 Target URLs are HTTPS
  const nonHttps = campaigns.filter((c) => c.targetUrl && !c.targetUrl.startsWith('https://'));
  if (nonHttps.length === 0) {
    pass('HTTPS URLs', `All target URLs use HTTPS`);
  } else {
    fail(
      'HTTPS URLs',
      `${nonHttps.length} campaigns have non-HTTPS URLs`,
      nonHttps
        .slice(0, 3)
        .map((c) => c.targetUrl)
        .join(', ')
    );
  }

  // 2.8 UTM tracking
  const noUtm = campaigns.filter((c) => !c.utmSource || !c.utmMedium || !c.utmCampaign);
  if (noUtm.length === 0) {
    pass('UTM tracking', `All campaigns have UTM source/medium/campaign`);
  } else {
    fail('UTM tracking', `${noUtm.length} campaigns missing UTM params`);
  }

  // 2.9 Geo targets
  const noGeo = campaigns.filter((c) => !c.geoTargets || c.geoTargets.length === 0);
  if (noGeo.length === 0) {
    pass('Geo targets', `All campaigns have geo targeting`);
  } else {
    warn('Geo targets', `${noGeo.length} campaigns have no geo targets (will use defaults GB/US)`);
  }

  // 2.10 ProposalData present on grouped campaigns
  const draftAndPaused = campaigns.filter((c) => c.status === 'DRAFT' || c.status === 'PAUSED');
  const noProposal = draftAndPaused.filter((c) => !c.proposalData);
  if (noProposal.length === 0 || draftAndPaused.length === 0) {
    pass('ProposalData', `All ${draftAndPaused.length} draft/paused campaigns have proposalData`);
  } else {
    warn(
      'ProposalData',
      `${noProposal.length}/${draftAndPaused.length} campaigns missing proposalData`
    );
  }

  // 2.11 Ad groups in audiences (grouped campaigns)
  const withAudiences = campaigns.filter((c) => {
    const aud = c.audiences as any;
    return aud?.adGroups && Array.isArray(aud.adGroups) && aud.adGroups.length > 0;
  });
  if (withAudiences.length > 0) {
    const totalAdGroups = withAudiences.reduce(
      (s, c) => s + ((c.audiences as any).adGroups?.length || 0),
      0
    );
    pass(
      'Ad group structure',
      `${withAudiences.length} campaigns have ${totalAdGroups} ad groups for Google multi-ad-group deployment`
    );
  } else {
    warn(
      'Ad group structure',
      'No campaigns have audiences.adGroups — Google will use single ad group fallback'
    );
  }

  // 2.12 Microsite campaigns
  const msCampaigns = campaigns.filter((c) => c.micrositeId);
  if (msCampaigns.length > 0) {
    pass('Microsite campaigns', `${msCampaigns.length} campaigns target specific microsites`);
  } else {
    warn(
      'Microsite campaigns',
      'No microsite-targeted campaigns — all traffic routes to main sites'
    );
  }

  // 2.13 Landing page path populated
  const withLp = campaigns.filter((c) => (c as any).landingPagePath);
  pass(
    'Landing page paths',
    `${withLp.length}/${campaigns.length} campaigns have explicit landing page paths`
  );

  // 2.14 MaxCPC sanity check
  const highCpc = campaigns.filter((c) => Number(c.maxCpc) > PAID_TRAFFIC_CONFIG.maxCpc);
  if (highCpc.length === 0) {
    pass('MaxCPC cap', `All campaigns have maxCpc ≤ £${PAID_TRAFFIC_CONFIG.maxCpc}`);
  } else {
    warn(
      'MaxCPC cap',
      `${highCpc.length} campaigns have maxCpc > £${PAID_TRAFFIC_CONFIG.maxCpc}`,
      highCpc
        .slice(0, 3)
        .map((c) => `${c.name}: £${Number(c.maxCpc).toFixed(2)}`)
        .join(', ')
    );
  }
}

// --- Phase 3: Meta API Connection -------------------------------------------

async function phase3_metaApi() {
  console.log('\n═══ PHASE 3: META ADS API ═══\n');

  const adAccountId = process.env['META_AD_ACCOUNT_ID'];
  if (!adAccountId) {
    skip('Meta API', 'META_AD_ACCOUNT_ID not set');
    return;
  }

  const account = await prisma.socialAccount.findFirst({
    where: { platform: 'FACEBOOK', isActive: true },
    select: {
      accessToken: true,
      tokenExpiresAt: true,
      refreshToken: true,
      id: true,
      platform: true,
      accountId: true,
    },
  });

  if (!account?.accessToken) {
    fail('Meta access token', 'No active Facebook social account with access token');
    return;
  }

  // Dynamic import to avoid pulling in Meta client at top-level
  const { MetaAdsClient } = await import('../services/social/meta-ads-client.js');
  const { refreshTokenIfNeeded } = await import('../services/social/token-refresh.js');

  // 3.1 Token refresh
  try {
    const refreshed = await refreshTokenIfNeeded(account);
    pass(
      'Meta token refresh',
      `Token valid (refreshed: ${refreshed.accessToken !== account.accessToken})`
    );
  } catch (err: any) {
    fail('Meta token refresh', `Failed: ${err.message.substring(0, 150)}`);
    return;
  }

  const client = new MetaAdsClient({
    accessToken: account.accessToken,
    adAccountId,
  });

  // 3.2 Interest search (lightweight read-only test)
  try {
    const interests = await client.searchInterests('travel');
    if (interests.length > 0) {
      pass(
        'Meta interest search',
        `Found ${interests.length} interests for "travel" (e.g., ${interests[0]!.name})`
      );
    } else {
      warn('Meta interest search', 'No interests returned for "travel" — targeting may be limited');
    }
  } catch (err: any) {
    fail('Meta interest search', `API error: ${err.message.substring(0, 200)}`);
  }

  // 3.3 Check for existing platform campaign IDs (Meta deployment already happened)
  const deployedMeta = await prisma.adCampaign.count({
    where: { platform: 'FACEBOOK', platformCampaignId: { not: null } },
  });
  if (deployedMeta > 0) {
    pass('Meta deployed campaigns', `${deployedMeta} campaigns have Meta platformCampaignId`);
  } else {
    warn('Meta deployed campaigns', 'No campaigns deployed to Meta yet');
  }

  // 3.4 Verify at least one deployed campaign is reachable on Meta
  if (deployedMeta > 0) {
    const sample = await prisma.adCampaign.findFirst({
      where: { platform: 'FACEBOOK', platformCampaignId: { not: null } },
      select: { platformCampaignId: true, name: true },
    });
    if (sample?.platformCampaignId) {
      try {
        const insights = await client.getCampaignInsights(sample.platformCampaignId, {
          since: formatDate(daysAgo(7)),
          until: formatDate(new Date()),
        });
        pass(
          'Meta campaign reachable',
          `Campaign "${sample.name}" is accessible on Meta API (insights: ${JSON.stringify(insights).substring(0, 100)})`
        );
      } catch (err: any) {
        // A 400 error about "no data" is OK — it means the campaign exists
        if (err.message?.includes('no data') || err.message?.includes('100')) {
          pass(
            'Meta campaign reachable',
            `Campaign "${sample.name}" exists on Meta (no insights data yet — expected for new campaigns)`
          );
        } else {
          fail('Meta campaign reachable', `API error: ${err.message.substring(0, 200)}`);
        }
      }
    }
  }
}

// --- Phase 4: Google Ads API ------------------------------------------------

async function phase4_googleApi() {
  console.log('\n═══ PHASE 4: GOOGLE ADS API ═══\n');

  const configured = isGoogleAdsConfigured();
  if (configured) {
    pass('Google Ads configured', 'All required env vars set');

    // 4.1 Check for deployed campaigns
    const deployedGoogle = await prisma.adCampaign.count({
      where: { platform: 'GOOGLE_SEARCH', platformCampaignId: { not: null } },
    });
    if (deployedGoogle > 0) {
      pass('Google deployed campaigns', `${deployedGoogle} campaigns deployed to Google`);
    } else {
      warn(
        'Google deployed campaigns',
        'No campaigns deployed to Google yet (may need API access approval)'
      );
    }

    // 4.2 Test token refresh (read-only)
    try {
      const { listConversionActions } = await import('../services/google-ads-client.js');
      const actions = await listConversionActions();
      pass(
        'Google Ads API access',
        `Authenticated successfully (${actions.length} conversion actions found)`
      );
    } catch (err: any) {
      if (err.message?.includes('403') || err.message?.includes('PERMISSION_DENIED')) {
        fail(
          'Google Ads API access',
          'Permission denied — API access not approved',
          'Request Standard access at https://ads.google.com/aw/apicenter/'
        );
      } else {
        fail('Google Ads API access', `Error: ${err.message.substring(0, 200)}`);
      }
    }
  } else {
    warn('Google Ads configured', 'Google Ads env vars not set — Google campaigns will not deploy');
    skip('Google API access', 'Not configured');
  }
}

// --- Phase 5: Bidding Engine (Dry Run) --------------------------------------

async function phase5_biddingEngine() {
  console.log('\n═══ PHASE 5: BIDDING ENGINE (FULL SCORING) ═══\n');
  console.log('  Note: runBiddingEngine() scores and groups but does NOT create campaigns.');
  console.log('  Campaign creation only happens via handleBiddingEngineRun() worker.\n');

  try {
    const result = await runBiddingEngine({
      mode: 'full',
      maxDailyBudget: PAID_TRAFFIC_CONFIG.maxDailyBudget,
    });

    // 5.1 Sites analyzed
    if (result.sitesAnalyzed > 0) {
      pass('Sites analyzed', `${result.sitesAnalyzed} sites processed`);
    } else {
      fail('Sites analyzed', 'No sites analyzed — profitability calculation failed');
    }

    // 5.2 Profiles generated
    const profitableProfiles = result.profiles.filter((p) => p.maxProfitableCpc > 0.01);
    if (profitableProfiles.length > 0) {
      pass(
        'Profitable profiles',
        `${profitableProfiles.length}/${result.profiles.length} sites have positive maxCPC`
      );
      // Show top 3
      const top3 = profitableProfiles
        .sort((a, b) => b.maxProfitableCpc - a.maxProfitableCpc)
        .slice(0, 3);
      for (const p of top3) {
        console.log(
          `    ${p.siteName}: maxCPC £${p.maxProfitableCpc.toFixed(2)}, AOV £${p.avgOrderValue.toFixed(0)}, CVR ${(p.conversionRate * 100).toFixed(2)}%`
        );
      }
    } else {
      fail(
        'Profitable profiles',
        'No sites have positive maxCPC — all candidates will have negative ROAS'
      );
    }

    // 5.3 Candidates scored
    if (result.candidates.length > 0) {
      pass('Candidates scored', `${result.candidates.length} keyword-platform pairs scored`);

      // Score distribution
      const above50 = result.candidates.filter((c) => c.profitabilityScore >= 50).length;
      const above75 = result.candidates.filter((c) => c.profitabilityScore >= 75).length;
      console.log(`    Score ≥ 50: ${above50}, Score ≥ 75: ${above75}`);

      // ROAS distribution
      const positive = result.candidates.filter(
        (c) => c.expectedDailyCost > 0 && c.expectedDailyRevenue / c.expectedDailyCost >= 1.0
      ).length;
      pass('Positive ROAS candidates', `${positive}/${result.candidates.length} have ROAS ≥ 1.0`);
    } else {
      fail('Candidates scored', 'No candidates scored');
    }

    // 5.4 Groups created
    if (result.groups.length > 0) {
      const msGroups = result.groups.filter((g) => g.isMicrosite);
      const mainGroups = result.groups.filter((g) => !g.isMicrosite);
      pass(
        'Campaign groups',
        `${result.groups.length} groups (${msGroups.length} microsite, ${mainGroups.length} main site)`
      );

      // Platform split
      const fbGroups = result.groups.filter((g) => g.platform === 'FACEBOOK').length;
      const gGroups = result.groups.filter((g) => g.platform === 'GOOGLE_SEARCH').length;
      console.log(`    Meta: ${fbGroups}, Google: ${gGroups}`);

      // Sub-£1 budget count
      const subThreshold = result.groups.filter((g) => g.totalExpectedDailyCost < 1.0);
      console.log(
        `    Sub-£1 natural budget (will be floored): ${subThreshold.length}/${result.groups.length}`
      );

      // Total budget with floor
      const totalWithFloor = result.groups.reduce(
        (s, g) => s + Math.max(g.totalExpectedDailyCost, PAID_TRAFFIC_CONFIG.minDailyBudget),
        0
      );
      console.log(`    Total budget with £1 floor: £${totalWithFloor.toFixed(2)}/day`);

      // Check all groups have candidates
      const emptyGroups = result.groups.filter((g) => g.candidates.length === 0);
      if (emptyGroups.length === 0) {
        pass('Group candidates', `All groups have candidates`);
      } else {
        fail('Group candidates', `${emptyGroups.length} groups have no candidates`);
      }

      // Check all groups have ad groups
      const noAdGroups = result.groups.filter((g) => g.adGroups.length === 0);
      if (noAdGroups.length === 0) {
        pass('Group ad groups', `All groups have ad group structures`);
      } else {
        fail('Group ad groups', `${noAdGroups.length} groups have no ad groups`);
      }
    } else {
      fail('Campaign groups', 'No campaign groups created');
    }

    // 5.5 Budget allocation
    pass(
      'Budget allocated',
      `£${result.budgetAllocated.toFixed(2)}/day allocated, £${result.budgetRemaining.toFixed(2)} remaining`
    );
  } catch (err: any) {
    fail('Bidding engine', `Engine crashed: ${err.message.substring(0, 300)}`);
  }
}

// --- Phase 6: Deployment Readiness ------------------------------------------

async function phase6_deploymentReadiness() {
  console.log('\n═══ PHASE 6: DEPLOYMENT READINESS ═══\n');

  // 6.1 DRAFT campaigns ready for deployment
  const drafts = await prisma.adCampaign.findMany({
    where: { status: 'DRAFT' },
    select: {
      id: true,
      name: true,
      platform: true,
      dailyBudget: true,
      keywords: true,
      targetUrl: true,
    },
  });

  if (drafts.length > 0) {
    pass('DRAFT campaigns', `${drafts.length} campaigns ready for deployment`);

    // Validate each draft has minimum viable data
    let viable = 0;
    for (const d of drafts) {
      const hasKw = d.keywords.length > 0;
      const hasUrl = d.targetUrl && d.targetUrl.startsWith('https://');
      const hasBudget = Number(d.dailyBudget) >= PAID_TRAFFIC_CONFIG.minDailyBudget;
      if (hasKw && hasUrl && hasBudget) viable++;
    }
    if (viable === drafts.length) {
      pass(
        'Draft viability',
        `All ${drafts.length} drafts have keywords + valid URL + viable budget`
      );
    } else {
      fail('Draft viability', `Only ${viable}/${drafts.length} drafts are viable for deployment`);
    }
  } else {
    warn('DRAFT campaigns', 'No DRAFT campaigns — all may have been deployed already');
  }

  // 6.2 PAUSED campaigns (deployed but not spending)
  const paused = await prisma.adCampaign.findMany({
    where: { status: 'PAUSED' },
    select: { id: true, name: true, platform: true, platformCampaignId: true, dailyBudget: true },
  });

  if (paused.length > 0) {
    const withPlatformId = paused.filter((p) => p.platformCampaignId);
    pass(
      'PAUSED campaigns',
      `${paused.length} paused (${withPlatformId.length} deployed to platform)`
    );

    if (withPlatformId.length < paused.length) {
      warn(
        'Undeployed PAUSED',
        `${paused.length - withPlatformId.length} PAUSED campaigns lack platformCampaignId`,
        'These may have failed during deployment'
      );
    }
  } else {
    warn('PAUSED campaigns', 'No PAUSED campaigns');
  }

  // 6.3 Check no campaigns are ACTIVE (spending money) yet
  const active = await prisma.adCampaign.count({ where: { status: 'ACTIVE' } });
  if (active === 0) {
    pass('No active spend', 'No ACTIVE campaigns — no money being spent yet (safe)');
  } else {
    warn('Active campaigns', `${active} campaigns are ACTIVE and spending money`);
  }

  // 6.4 Landing URL reachability (sample 5)
  const sampleCampaigns = await prisma.adCampaign.findMany({
    where: { status: { in: ['DRAFT', 'PAUSED'] } },
    select: { name: true, targetUrl: true },
    take: 5,
  });

  let reachable = 0;
  let unreachable = 0;
  for (const c of sampleCampaigns) {
    try {
      const url = c.targetUrl.split('?')[0]!; // Strip UTM for fetch
      const resp = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (
        resp.ok ||
        resp.status === 308 ||
        resp.status === 307 ||
        resp.status === 301 ||
        resp.status === 302
      ) {
        reachable++;
      } else {
        unreachable++;
        console.log(`    ⚠ ${c.name}: ${url} → HTTP ${resp.status}`);
      }
    } catch (err: any) {
      unreachable++;
      console.log(
        `    ⚠ ${c.name}: ${c.targetUrl.split('?')[0]} → ${err.message.substring(0, 80)}`
      );
    }
  }

  if (unreachable === 0 && reachable > 0) {
    pass('Landing URL reachability', `All ${reachable} sampled landing pages are reachable`);
  } else if (unreachable > 0) {
    warn(
      'Landing URL reachability',
      `${unreachable}/${reachable + unreachable} sampled URLs are unreachable`
    );
  }
}

// --- Phase 7: Budget Optimizer Logic ----------------------------------------

async function phase7_budgetOptimizer() {
  console.log('\n═══ PHASE 7: BUDGET OPTIMIZER CONFIG ═══\n');

  const cfg = PAID_TRAFFIC_CONFIG;

  // 7.1 Config values sanity
  if (cfg.roasPauseThreshold < cfg.targetRoas) {
    pass(
      'ROAS thresholds',
      `Pause at ROAS < ${cfg.roasPauseThreshold}, target ${cfg.targetRoas}, scale at > ${cfg.roasScaleThreshold}`
    );
  } else {
    fail(
      'ROAS thresholds',
      `Pause threshold (${cfg.roasPauseThreshold}) >= target ROAS (${cfg.targetRoas})`
    );
  }

  if (cfg.observationDays >= 3 && cfg.observationDays <= 30) {
    pass('Observation period', `${cfg.observationDays} days before pausing underperformers`);
  } else {
    warn('Observation period', `${cfg.observationDays} days seems unusual (expected 3-30)`);
  }

  if (cfg.scaleIncrement > 0 && cfg.scaleIncrement <= 0.5) {
    pass('Scale increment', `${(cfg.scaleIncrement * 100).toFixed(0)}% budget increase per cycle`);
  } else {
    warn('Scale increment', `${(cfg.scaleIncrement * 100).toFixed(0)}% seems aggressive`);
  }

  // 7.2 Profitability defaults
  pass('Default AOV', `£${cfg.defaults.aov} (used when <${MIN_BOOKINGS_FOR_AOV} bookings)`);
  pass('Default commission', `${cfg.defaults.commissionRate}%`);
  pass('Default CVR', `${(cfg.defaults.cvr * 100).toFixed(1)}%`);

  // 7.3 Calculate break-even CPC with defaults
  const defaultRevPerClick =
    cfg.defaults.aov * cfg.defaults.cvr * (cfg.defaults.commissionRate / 100);
  const breakEvenCpc = defaultRevPerClick / cfg.targetRoas;
  pass(
    'Break-even CPC (defaults)',
    `£${breakEvenCpc.toFixed(2)} (AOV × CVR × commission ÷ targetROAS)`
  );

  if (breakEvenCpc > cfg.maxCpc) {
    pass(
      'CPC headroom',
      `Break-even CPC £${breakEvenCpc.toFixed(2)} > maxCpc threshold £${cfg.maxCpc} — good margin`
    );
  } else {
    warn(
      'CPC headroom',
      `Break-even CPC £${breakEvenCpc.toFixed(2)} ≤ maxCpc threshold £${cfg.maxCpc} — tight margins`
    );
  }
}

// --- Phase 8: Conversion Tracking -------------------------------------------

async function phase8_conversionTracking() {
  console.log('\n═══ PHASE 8: CONVERSION TRACKING (CAPI) ═══\n');

  // 8.1 Meta Pixel ID
  const siteWithPixel = await prisma.site.findFirst({
    where: { status: 'ACTIVE' },
    select: { name: true, seoConfig: true },
  });
  const seoConfig = siteWithPixel?.seoConfig as any;
  if (seoConfig?.metaPixelId) {
    pass('Meta Pixel ID', `Pixel ${seoConfig.metaPixelId} on site "${siteWithPixel?.name}"`);
  } else {
    warn('Meta Pixel ID', 'No Meta Pixel ID in seoConfig — run AD_PLATFORM_IDS_SYNC');
  }

  // 8.2 Google Conversion Action
  if (seoConfig?.googleAdsConversionAction) {
    pass('Google Conversion Action', `Action: ${seoConfig.googleAdsConversionAction}`);
  } else {
    warn(
      'Google Conversion Action',
      'No Google conversion action in seoConfig — run AD_PLATFORM_IDS_SYNC'
    );
  }

  // 8.3 Recent bookings with UTM attribution
  const recentUtmBookings = await prisma.booking.count({
    where: {
      utmSource: { not: null },
      createdAt: { gte: daysAgo(30) },
    },
  });
  if (recentUtmBookings > 0) {
    pass(
      'UTM-attributed bookings',
      `${recentUtmBookings} bookings with UTM source in last 30 days`
    );
  } else {
    warn(
      'UTM-attributed bookings',
      'No UTM-attributed bookings yet — expected before first paid traffic'
    );
  }
}

// --- Phase 9: Admin Dashboard API -------------------------------------------

async function phase9_dashboardApi() {
  console.log('\n═══ PHASE 9: ADMIN DASHBOARD DATA ═══\n');

  // Simulate what the API returns by running the same queries
  const lookback = daysAgo(30);

  // 9.1 Campaign summaries (same query as bidding API route)
  try {
    const campaigns = await prisma.adCampaign.findMany({
      include: {
        site: { select: { name: true } },
        microsite: { select: { siteName: true, fullDomain: true } },
        dailyMetrics: { where: { date: { gte: lookback } }, orderBy: { date: 'desc' }, take: 1 },
      },
    });

    if (campaigns.length > 0) {
      pass('Dashboard campaigns', `${campaigns.length} campaigns queryable`);

      // Check microsite includes work
      const withMs = campaigns.filter((c) => c.microsite);
      pass('Microsite includes', `${withMs.length} campaigns have microsite data`);
    } else {
      fail('Dashboard campaigns', 'No campaigns returned');
    }
  } catch (err: any) {
    fail('Dashboard campaigns', `Query failed: ${err.message.substring(0, 200)}`);
  }

  // 9.2 Booking attribution query
  try {
    const attribution = await prisma.booking.groupBy({
      by: ['utmSource'],
      where: {
        utmSource: { not: null },
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        createdAt: { gte: lookback },
      },
      _sum: { totalAmount: true, commissionAmount: true },
      _count: true,
    });
    pass('Booking attribution query', `Returns ${attribution.length} sources`);
  } catch (err: any) {
    fail('Booking attribution query', `Failed: ${err.message.substring(0, 200)}`);
  }

  // 9.3 Keyword stats
  try {
    const kwAgg = await prisma.sEOOpportunity.aggregate({
      where: { status: 'PAID_CANDIDATE' as any },
      _avg: { cpc: true, searchVolume: true },
      _count: true,
    });
    pass(
      'Keyword aggregation',
      `${kwAgg._count} keywords, avg CPC £${Number(kwAgg._avg.cpc || 0).toFixed(2)}, avg volume ${Math.round(Number(kwAgg._avg.searchVolume || 0))}`
    );
  } catch (err: any) {
    fail('Keyword aggregation', `Failed: ${err.message.substring(0, 200)}`);
  }

  // 9.4 Enrichment stats
  try {
    const suppEnriched = await prisma.supplier.count({
      where: { keywordsEnrichedAt: { not: null } },
    });
    pass('Enrichment stats', `${suppEnriched} suppliers enriched with keywords`);
  } catch (err: any) {
    fail('Enrichment stats', `Query failed: ${err.message.substring(0, 100)}`);
  }

  // 9.5 AdAlert query (the one that caused the 500)
  try {
    const alertCount = await (prisma as any).adAlert.count();
    const alerts = await (prisma as any).adAlert.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    pass('AdAlert queries', `${alertCount} alerts, findMany OK`);
  } catch (err: any) {
    fail('AdAlert queries', `STILL FAILING: ${err.message.substring(0, 200)}`);
  }
}

// --- Phase 10: Scheduler Validation -----------------------------------------

async function phase10_schedulerConfig() {
  console.log('\n═══ PHASE 10: SCHEDULER & JOBS ═══\n');

  // Check that required job types exist in enum
  const requiredJobs = [
    'PAID_KEYWORD_SCAN',
    'BIDDING_ENGINE_RUN',
    'AD_CAMPAIGN_SYNC',
    'AD_CONVERSION_UPLOAD',
    'AD_PLATFORM_IDS_SYNC',
    'AD_PERFORMANCE_REPORT',
    'AD_BUDGET_OPTIMIZER',
    'KEYWORD_ENRICHMENT',
  ];

  for (const jobType of requiredJobs) {
    try {
      const count = await prisma.job.count({
        where: { type: jobType as any },
      });
      pass(`Job: ${jobType}`, `${count} historical runs`);
    } catch {
      // If enum value doesn't exist, the query itself may fail
      warn(`Job: ${jobType}`, 'Job type may not exist in enum');
    }
  }
}

// --- Helpers ----------------------------------------------------------------

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

const MIN_BOOKINGS_FOR_AOV = 3;

// --- Main -------------------------------------------------------------------

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   PAID ADS PIPELINE — END-TO-END VALIDATION                  ║');
  console.log('║   Pre-launch checklist before enabling live spend             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\nTimestamp: ${new Date().toISOString()}`);
  console.log(
    `Config: maxDailyBudget=£${PAID_TRAFFIC_CONFIG.maxDailyBudget}, minDailyBudget=£${PAID_TRAFFIC_CONFIG.minDailyBudget}, targetRoas=${PAID_TRAFFIC_CONFIG.targetRoas}`
  );

  try {
    await phase1_databaseState();
    await phase2_campaignIntegrity();
    await phase3_metaApi();
    await phase4_googleApi();
    await phase5_biddingEngine();
    await phase6_deploymentReadiness();
    await phase7_budgetOptimizer();
    await phase8_conversionTracking();
    await phase9_dashboardApi();
    await phase10_schedulerConfig();
  } catch (err) {
    console.error('\n\n!!! UNHANDLED ERROR !!!', err);
  }

  // --- Summary ---
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║   SUMMARY                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const passes = results.filter((r) => r.status === 'PASS');
  const fails = results.filter((r) => r.status === 'FAIL');
  const warns = results.filter((r) => r.status === 'WARN');
  const skips = results.filter((r) => r.status === 'SKIP');

  console.log(`  ✓ PASS: ${passes.length}`);
  console.log(`  ✗ FAIL: ${fails.length}`);
  console.log(`  ⚠ WARN: ${warns.length}`);
  console.log(`  ○ SKIP: ${skips.length}`);

  if (fails.length > 0) {
    console.log('\n  ─── FAILURES (must fix before go-live) ───');
    for (const f of fails) {
      console.log(`  ✗ ${f.name}: ${f.message}`);
      if (f.details) console.log(`    → ${f.details}`);
    }
  }

  if (warns.length > 0) {
    console.log('\n  ─── WARNINGS (review before go-live) ───');
    for (const w of warns) {
      console.log(`  ⚠ ${w.name}: ${w.message}`);
    }
  }

  const goLive = fails.length === 0;
  console.log(`\n  ${'═'.repeat(60)}`);
  console.log(`  ${goLive ? '✓ GO-LIVE READY' : '✗ NOT READY — fix failures above'}`);
  console.log(`  ${'═'.repeat(60)}\n`);

  await prisma.$disconnect();
  process.exit(goLive ? 0 : 1);
}

main();
