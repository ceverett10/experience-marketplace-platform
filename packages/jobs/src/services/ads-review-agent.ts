/**
 * Ads Review Agent
 *
 * An AI agent that audits the full Google Ads and Meta Ads account structure.
 * Uses Claude with tool_use to iteratively pull data from both platforms,
 * identify issues, and produce a structured review report.
 *
 * The agent has access to:
 * - Live campaign data from Google Ads API and Meta Ads API
 * - Keywords, quality scores, and landing URLs (Google)
 * - Ad set targeting and creative structure (Meta)
 * - 30-day performance metrics from the database
 * - Conversion tracking status (Google)
 * - Actual search terms triggering ads (Google)
 *
 * It records findings as it investigates and completes with an executive summary.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ToolUseBlock } from '@anthropic-ai/sdk/resources';
import { prisma } from '@experience-marketplace/database';
import {
  getConfig as getGoogleConfig,
  listCampaigns as listGoogleCampaigns,
  getKeywordsForCampaign,
  listConversionActions,
  getSearchTermReport,
} from './google-ads-client';
import { type MetaAdsClient } from './social/meta-ads-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdsReviewFinding {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  category:
    | 'CONVERSION_TRACKING'
    | 'BUDGET_WASTE'
    | 'LANDING_PAGE'
    | 'CAMPAIGN_STRUCTURE'
    | 'TARGETING'
    | 'AD_COPY'
    | 'BIDDING_STRATEGY'
    | 'KEYWORD_RELEVANCE'
    | 'ACCOUNT_STRUCTURE';
  title: string;
  description: string;
  affectedCampaigns?: string[];
  recommendation: string;
  estimatedImpact?: string;
}

export interface AdsReviewActionTaken {
  campaignDbId: string;
  campaignName: string;
  platform: string;
  action: string;
  reason: string;
}

export interface AdsReviewResult {
  reportId: string;
  status: 'COMPLETED' | 'FAILED';
  executiveSummary: string;
  overallHealthScore: number;
  topPriorities: string[];
  findings: AdsReviewFinding[];
  actionsTaken: AdsReviewActionTaken[];
  campaignsReviewed: number;
  totalSpendReviewed: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const AGENT_TOOLS: Tool[] = [
  {
    name: 'list_google_campaigns',
    description:
      'Fetch all Google Search campaigns from the Google Ads API with 30-day performance metrics: spend, clicks, impressions, conversions, CTR, average CPC, daily budget, and bidding strategy. Returns all non-removed campaigns sorted by spend.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_meta_campaigns',
    description:
      'Fetch all Meta (Facebook/Instagram) campaigns from the Meta Ads API with status and budget. Use get_meta_campaign_structure to drill into specific campaigns for targeting and performance details.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_google_keywords',
    description:
      'Get all keywords, match types, quality scores (1-10), expected CTR, creative quality, post-click quality, final URLs, and 30-day performance for a specific Google Ads campaign. Essential for evaluating keyword relevance and landing page alignment.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaignId: {
          type: 'string',
          description: 'Google Ads campaign ID (numeric string from list_google_campaigns)',
        },
        campaignName: {
          type: 'string',
          description: 'Campaign name for context in your analysis',
        },
      },
      required: ['campaignId'],
    },
  },
  {
    name: 'get_google_search_terms',
    description:
      'Get actual search queries that triggered ads in a Google campaign over the last 30 days. Reveals whether irrelevant searches are consuming budget and identifies negative keyword opportunities.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaignId: {
          type: 'string',
          description: 'Google Ads campaign ID',
        },
      },
      required: ['campaignId'],
    },
  },
  {
    name: 'check_conversion_tracking',
    description:
      'Check what conversion actions are configured in the Google Ads account (type, status, Google tag label). Critical for diagnosing why conversions show as zero — the booking confirmation page may be on a different domain (Holibob checkout) meaning the tag never fires.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_meta_campaign_structure',
    description:
      'Get detailed structure for a Meta campaign: ad sets with their interest targeting, geo-locations, age ranges, bid amounts, and 30-day performance metrics (spend, clicks, impressions, CPC).',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaignId: {
          type: 'string',
          description: 'Meta campaign ID from list_meta_campaigns',
        },
        campaignName: {
          type: 'string',
          description: 'Campaign name for context',
        },
      },
      required: ['campaignId'],
    },
  },
  {
    name: 'get_db_campaign_metrics',
    description:
      'Query our database for aggregated campaign performance over a date range. Returns total spend, clicks, impressions, conversions, revenue, and daily breakdown for all or a specific campaign.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back (default 30)',
        },
        platform: {
          type: 'string',
          enum: ['GOOGLE_SEARCH', 'FACEBOOK', 'ALL'],
          description: 'Filter by platform',
        },
      },
      required: [],
    },
  },
  {
    name: 'record_finding',
    description:
      'Record a finding during the review. Call this as you discover issues — do not batch all findings at the end. Each finding should be specific and actionable.',
    input_schema: {
      type: 'object' as const,
      properties: {
        severity: {
          type: 'string',
          enum: ['CRITICAL', 'WARNING', 'INFO'],
          description:
            'CRITICAL = actively harmful/wasting budget. WARNING = suboptimal. INFO = improvement opportunity.',
        },
        category: {
          type: 'string',
          enum: [
            'CONVERSION_TRACKING',
            'BUDGET_WASTE',
            'LANDING_PAGE',
            'CAMPAIGN_STRUCTURE',
            'TARGETING',
            'AD_COPY',
            'BIDDING_STRATEGY',
            'KEYWORD_RELEVANCE',
            'ACCOUNT_STRUCTURE',
          ],
        },
        title: { type: 'string', description: 'Short title (max 80 chars)' },
        description: {
          type: 'string',
          description: 'Detailed explanation with specific evidence from the data',
        },
        affectedCampaigns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Campaign names affected',
        },
        recommendation: {
          type: 'string',
          description: 'Specific, actionable next step',
        },
        estimatedImpact: {
          type: 'string',
          description:
            'What fixing this achieves, e.g. "£40/week savings" or "unlock conversion data"',
        },
      },
      required: ['severity', 'category', 'title', 'description', 'recommendation'],
    },
  },
  {
    name: 'pause_campaign',
    description:
      'Pause a specific campaign that is actively wasting budget with no viable path to recovery. Only use for CRITICAL findings. This will be logged as an action taken.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaignDbId: {
          type: 'string',
          description: 'Database AdCampaign ID (not the platform campaign ID)',
        },
        platform: {
          type: 'string',
          enum: ['GOOGLE_SEARCH', 'FACEBOOK'],
        },
        reason: {
          type: 'string',
          description: 'Clear reason for pausing',
        },
      },
      required: ['campaignDbId', 'platform', 'reason'],
    },
  },
  {
    name: 'complete_review',
    description:
      'Signal that the review is complete. Provide a comprehensive executive summary, an overall health score (0-100), and the top 3-5 prioritised actions. Call this once you have finished analysing both platforms.',
    input_schema: {
      type: 'object' as const,
      properties: {
        executiveSummary: {
          type: 'string',
          description: 'Overall account health summary in 2-3 paragraphs covering both platforms',
        },
        overallHealthScore: {
          type: 'number',
          description: '0-100 health score (0 = critically broken, 100 = perfectly optimised)',
        },
        topPriorities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Top 3-5 actions ordered by impact',
        },
      },
      required: ['executiveSummary', 'overallHealthScore', 'topPriorities'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

interface AgentState {
  googleConfigured: boolean;
  metaClient: MetaAdsClient | null;
  findings: AdsReviewFinding[];
  actionsTaken: AdsReviewActionTaken[];
  campaignsReviewed: number;
  totalSpend: number;
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  state: AgentState
): Promise<unknown> {
  switch (name) {
    case 'list_google_campaigns': {
      if (!state.googleConfigured) {
        return { error: 'Google Ads not configured — missing env vars' };
      }
      const config = getGoogleConfig();
      if (!config) return { error: 'Google Ads config unavailable' };
      try {
        const campaigns = await listGoogleCampaigns(config);
        state.campaignsReviewed += campaigns.length;
        state.totalSpend += campaigns.reduce((sum, c) => sum + c.spendMicros / 1_000_000, 0);
        return { campaigns, count: campaigns.length };
      } catch (err) {
        return {
          error: `Google Ads API error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'list_meta_campaigns': {
      if (!state.metaClient) {
        return { error: 'Meta Ads not configured — missing env vars or no valid token' };
      }
      try {
        const campaigns = await state.metaClient.listCampaigns();
        state.campaignsReviewed += campaigns.length;
        return { campaigns, count: campaigns.length };
      } catch (err) {
        return { error: `Meta API error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'get_google_keywords': {
      if (!state.googleConfigured) return { error: 'Google Ads not configured' };
      const config = getGoogleConfig();
      if (!config) return { error: 'Google Ads config unavailable' };
      const campaignId = input['campaignId'] as string;
      try {
        const keywords = await getKeywordsForCampaign(config, campaignId);
        return { keywords, count: keywords.length };
      } catch (err) {
        return {
          error: `Google Ads API error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'get_google_search_terms': {
      if (!state.googleConfigured) return { error: 'Google Ads not configured' };
      const campaignId = input['campaignId'] as string;
      try {
        const terms = await getSearchTermReport(campaignId);
        return { terms };
      } catch (err) {
        return {
          error: `Google Ads API error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'check_conversion_tracking': {
      if (!state.googleConfigured) return { error: 'Google Ads not configured' };
      try {
        const actions = await listConversionActions();
        return { conversionActions: actions, count: actions.length };
      } catch (err) {
        return {
          error: `Google Ads API error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'get_meta_campaign_structure': {
      if (!state.metaClient) return { error: 'Meta Ads not configured' };
      const campaignId = input['campaignId'] as string;
      try {
        const structure = await state.metaClient.getCampaignStructure(campaignId);
        return structure;
      } catch (err) {
        return { error: `Meta API error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'get_db_campaign_metrics': {
      const days = (input['days'] as number | undefined) ?? 30;
      const platform = input['platform'] as string | undefined;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const where: Record<string, unknown> = { date: { gte: startDate } };
      if (platform && platform !== 'ALL') {
        // Filter via campaign relation
        where['campaign'] = { platform };
      }

      const [metrics, byPlatform] = await Promise.all([
        prisma.adDailyMetric.aggregate({
          where: where as Parameters<typeof prisma.adDailyMetric.aggregate>[0]['where'],
          _sum: { spend: true, clicks: true, impressions: true, conversions: true, revenue: true },
        }),
        prisma.adCampaign.groupBy({
          by: ['platform'],
          _sum: { dailyBudget: true },
          _count: { id: true },
          where: { status: { in: ['ACTIVE', 'PAUSED'] } },
        }),
      ]);

      return {
        period: `Last ${days} days`,
        totals: {
          spend: Number(metrics._sum.spend ?? 0),
          clicks: metrics._sum.clicks ?? 0,
          impressions: metrics._sum.impressions ?? 0,
          conversions: metrics._sum.conversions ?? 0,
          revenue: Number(metrics._sum.revenue ?? 0),
        },
        campaignsByPlatform: byPlatform.map((p) => ({
          platform: p.platform,
          count: p._count.id,
          totalDailyBudget: Number(p._sum.dailyBudget ?? 0),
        })),
      };
    }

    case 'record_finding': {
      const finding: AdsReviewFinding = {
        severity: input['severity'] as AdsReviewFinding['severity'],
        category: input['category'] as AdsReviewFinding['category'],
        title: input['title'] as string,
        description: input['description'] as string,
        affectedCampaigns: input['affectedCampaigns'] as string[] | undefined,
        recommendation: input['recommendation'] as string,
        estimatedImpact: input['estimatedImpact'] as string | undefined,
      };
      state.findings.push(finding);
      console.info(`[AdsReviewAgent] Finding recorded: [${finding.severity}] ${finding.title}`);
      return { recorded: true, totalFindings: state.findings.length };
    }

    case 'pause_campaign': {
      const campaignDbId = input['campaignDbId'] as string;
      const platform = input['platform'] as string;
      const reason = input['reason'] as string;

      try {
        const campaign = await prisma.adCampaign.update({
          where: { id: campaignDbId },
          data: { status: 'PAUSED' },
          select: { name: true, platform: true },
        });

        const action: AdsReviewActionTaken = {
          campaignDbId,
          campaignName: campaign.name,
          platform,
          action: 'PAUSED',
          reason,
        };
        state.actionsTaken.push(action);
        console.info(`[AdsReviewAgent] Paused campaign "${campaign.name}": ${reason}`);
        return { paused: true, campaignName: campaign.name };
      } catch (err) {
        return {
          error: `Failed to pause campaign ${campaignDbId}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'complete_review': {
      // Signal to the loop that we're done — actual completion handled in runAdsReviewAgent
      return { done: true };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert paid advertising auditor reviewing the full Google Ads and Meta Ads account for an experience marketplace platform.

PLATFORM CONTEXT:
- The platform operates 22 branded storefronts (food tours, Harry Potter tours, museum tickets, wine tours, etc.) selling tours and activities sourced via a wholesale API (Holibob).
- Revenue model: commission-based (~18% average).
- Booking flow: our site → Holibob's checkout page → payment confirmation. The confirmation page is on Holibob's domain.
- All sites currently display prices in GBP.
- Total spend to date: approximately £3,089 across Google and Meta with zero recorded conversions.

KNOWN CONTEXT TO INVESTIGATE:
1. Zero conversions recorded despite strong CTRs (Google 8-18%, Meta 1.5%) — the most likely cause is that conversion tracking tags fire on Holibob's domain which is a different domain than ours.
2. Budget is spread across many campaigns (500+ on Google, many Meta campaigns) — no single campaign has hit the 50 conversions/month threshold needed for Smart Bidding to work.
3. Meta campaigns targeted competitor brand interests (Evan Evans Tours, Ingresso) — questionable strategy.
4. Landing pages may be too broad — filtered experiences pages showing hundreds of products vs. the specific activity the user searched for.

PROFITABILITY MODEL (for context):
- maxCPC = (AOV × CVR × commission) / targetROAS
- Default: AOV £264, CVR 1.5%, commission 18%, targetROAS 1.0 → maxCPC ≈ £0.71
- Any campaign with average CPC above £0.71 is spending more per click than profitable.

YOUR REVIEW PROCESS:
1. Start with list_google_campaigns and list_meta_campaigns to get the full picture
2. Check conversion tracking immediately — this is the most critical issue
3. Review the highest-spend campaigns in detail (keywords, search terms, targeting)
4. Look for systemic issues: budget spread, duplicate targeting, poor quality scores, irrelevant search terms
5. Record findings as you go using record_finding — do not wait until the end
6. Only pause campaigns with clear, irreparable waste (CRITICAL severity)
7. Complete with complete_review once you have a thorough understanding of both platforms

Be specific — cite actual campaign names, spend amounts, CTR figures, and keyword examples in your findings. Vague recommendations are not useful.`;

/**
 * Runs the full ads review agent loop.
 * Creates a report record, runs the agent, and updates the record on completion.
 */
export async function runAdsReviewAgent(options?: {
  autoAction?: boolean; // If false, only records findings without taking actions (default: false)
  metaClient?: MetaAdsClient | null;
}): Promise<AdsReviewResult> {
  const autoAction = options?.autoAction ?? false;

  // Create the report record
  const report = await prisma.adReviewReport.create({
    data: {
      status: 'RUNNING',
      platformsReviewed: [],
    },
  });

  const state: AgentState = {
    googleConfigured: !!getGoogleConfig(),
    metaClient: options?.metaClient ?? null,
    findings: [],
    actionsTaken: [],
    campaignsReviewed: 0,
    totalSpend: 0,
  };

  const anthropic = new Anthropic({
    apiKey: process.env['ANTHROPIC_API_KEY'],
  });

  const messages: MessageParam[] = [];
  let reviewComplete = false;
  let finalSummary = '';
  let finalHealthScore = 0;
  let finalPriorities: string[] = [];

  // Agent loop — max 30 iterations to control costs
  const MAX_ITERATIONS = 30;
  let iterations = 0;

  try {
    // Initial message to start the review
    messages.push({
      role: 'user',
      content:
        'Please conduct a full audit of our Google Ads and Meta Ads accounts. Start by pulling campaign data from both platforms, then investigate conversion tracking, campaign structure, and performance. Record findings as you go.',
    });

    while (!reviewComplete && iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: autoAction ? AGENT_TOOLS : AGENT_TOOLS.filter((t) => t.name !== 'pause_campaign'),
        messages,
      });

      // Add assistant response to message history
      messages.push({ role: 'assistant', content: response.content });

      // Check if agent is done (no more tool calls)
      if (response.stop_reason === 'end_turn') {
        reviewComplete = true;
        break;
      }

      // Process tool calls
      const toolCalls = response.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use'
      );

      if (toolCalls.length === 0) {
        reviewComplete = true;
        break;
      }

      // Execute tools and collect results
      const toolResults: MessageParam['content'] = [];

      for (const toolCall of toolCalls) {
        const input = toolCall.input as Record<string, unknown>;
        const result = await executeTool(toolCall.name, input, state);

        // Check if review is complete
        if (toolCall.name === 'complete_review' && typeof result === 'object' && result !== null) {
          const r = result as Record<string, unknown>;
          if (r['done']) {
            // Extract summary from tool input
            finalSummary = input['executiveSummary'] as string;
            finalHealthScore = input['overallHealthScore'] as number;
            finalPriorities = input['topPriorities'] as string[];
            reviewComplete = true;
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Add tool results to message history
      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }

      if (reviewComplete) break;
    }

    // Count findings by severity
    const criticalCount = state.findings.filter((f) => f.severity === 'CRITICAL').length;
    const warningCount = state.findings.filter((f) => f.severity === 'WARNING').length;
    const infoCount = state.findings.filter((f) => f.severity === 'INFO').length;

    const platformsReviewed: string[] = [];
    if (state.googleConfigured) platformsReviewed.push('GOOGLE_SEARCH');
    if (state.metaClient) platformsReviewed.push('FACEBOOK');

    // Update the report record
    await prisma.adReviewReport.update({
      where: { id: report.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        platformsReviewed,
        campaignsReviewed: state.campaignsReviewed,
        totalSpendReviewed: state.totalSpend,
        executiveSummary: finalSummary || 'Review completed — see findings for details.',
        overallHealthScore: finalHealthScore,
        topPriorities: finalPriorities,
        findings: state.findings as unknown as Parameters<
          typeof prisma.adReviewReport.update
        >[0]['data']['findings'],
        actionsTaken: state.actionsTaken as unknown as Parameters<
          typeof prisma.adReviewReport.update
        >[0]['data']['actionsTaken'],
        criticalCount,
        warningCount,
        infoCount,
      },
    });

    console.info(
      `[AdsReviewAgent] Completed: ${state.findings.length} findings ` +
        `(${criticalCount} critical, ${warningCount} warnings), ` +
        `${state.campaignsReviewed} campaigns reviewed, ` +
        `${iterations} iterations`
    );

    return {
      reportId: report.id,
      status: 'COMPLETED',
      executiveSummary: finalSummary,
      overallHealthScore: finalHealthScore,
      topPriorities: finalPriorities,
      findings: state.findings,
      actionsTaken: state.actionsTaken,
      campaignsReviewed: state.campaignsReviewed,
      totalSpendReviewed: state.totalSpend,
      criticalCount,
      warningCount,
      infoCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[AdsReviewAgent] Agent failed:', message);

    await prisma.adReviewReport.update({
      where: { id: report.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        executiveSummary: `Review failed: ${message}`,
        findings: state.findings as unknown as Parameters<
          typeof prisma.adReviewReport.update
        >[0]['data']['findings'],
        criticalCount: state.findings.filter((f) => f.severity === 'CRITICAL').length,
        warningCount: state.findings.filter((f) => f.severity === 'WARNING').length,
        infoCount: state.findings.filter((f) => f.severity === 'INFO').length,
      },
    });

    return {
      reportId: report.id,
      status: 'FAILED',
      executiveSummary: `Review failed: ${message}`,
      overallHealthScore: 0,
      topPriorities: [],
      findings: state.findings,
      actionsTaken: state.actionsTaken,
      campaignsReviewed: state.campaignsReviewed,
      totalSpendReviewed: state.totalSpend,
      criticalCount: state.findings.filter((f) => f.severity === 'CRITICAL').length,
      warningCount: state.findings.filter((f) => f.severity === 'WARNING').length,
      infoCount: state.findings.filter((f) => f.severity === 'INFO').length,
    };
  }
}
