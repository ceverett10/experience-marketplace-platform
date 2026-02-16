'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

// ═══════════════════════════════════════════════════════════════════════════
// Types — Bidding API
// ═══════════════════════════════════════════════════════════════════════════

interface Profile {
  siteId: string;
  siteName: string;
  domain: string | null;
  avgOrderValue: number;
  avgCommissionRate: number;
  conversionRate: number;
  maxProfitableCpc: number;
  isAutoBidding: boolean;
  lastCalculatedAt: string | null;
}

interface ProposalEstimates {
  estimatedCpc: number;
  maxBid: number;
  searchVolume: number;
  expectedClicksPerDay: number;
  expectedDailyCost: number;
  expectedDailyRevenue: number;
  profitabilityScore: number;
  intent: string;
  assumptions: {
    avgOrderValue: number;
    commissionRate: number;
    conversionRate: number;
    targetRoas: number;
    revenuePerClick: number;
  };
}

interface BiddingCampaign {
  id: string;
  name: string;
  siteName: string;
  micrositeName: string | null;
  micrositeDomain: string | null;
  isMicrosite: boolean;
  platform: string;
  status: string;
  dailyBudget: number;
  maxCpc: number;
  keywords: string[];
  spend: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
  roas: number;
  ctr: number;
  avgCpc: number;
  daysWithData: number;
  proposalData: ProposalEstimates | null;
  landingPagePath: string | null;
  landingPageType: string | null;
  landingPageProducts: number | null;
  qualityScore: number | null;
}

interface Attribution {
  source: string;
  bookings: number;
  revenue: number;
  commission: number;
}

interface SiteKeyword {
  id: string;
  keyword: string;
  searchVolume: number;
  cpc: number;
  difficulty: number;
  intent: string;
  priorityScore: number;
  location: string | null;
  niche: string;
  estimatedMonthlyClicks: number;
  estimatedMonthlyCost: number;
  maxBid: number | null;
  aiScore: number | null;
  aiDecision: string | null;
  aiReasoning: string | null;
}

interface SiteKeywords {
  siteName: string;
  keywords: SiteKeyword[];
}

interface MicrositeSummary {
  id: string;
  siteName: string;
  fullDomain: string;
  entityType: string;
  keyword: string | null;
  destination: string | null;
  niche: string | null;
  productCount: number;
  sessions: number;
  pageviews: number;
}

interface Enrichment {
  suppliersTotal: number;
  suppliersEnriched: number;
  lastEnrichmentDate: string | null;
  keywordPool: {
    total: number;
    avgCpc: number;
    avgVolume: number;
    highVolume: number;
    medVolume: number;
    lowVolume: number;
    cpcUnder025: number;
    cpc025to050: number;
    cpc050to100: number;
    cpcOver100: number;
    uniqueCities: number;
    intentBreakdown: {
      commercial: number;
      transactional: number;
      informational: number;
      navigational: number;
    };
  };
  projection: {
    totalCampaigns: number;
    uniqueKeywords: number;
    dailySpend: number;
    dailyRevenue: number;
    overallRoas: number;
    profitableCampaigns: number;
    breakEvenCampaigns: number;
    micrositeCampaigns: number;
    mainSiteCampaigns: number;
    uniqueMicrosites: number;
    googleCampaigns: number;
    facebookCampaigns: number;
    assumptions: { aov: number; commission: number; cvr: number; targetRoas: number } | null;
  } | null;
}

interface BiddingData {
  period: { days: number; since: string };
  portfolio: {
    totalSpend: number;
    totalRevenue: number;
    totalClicks: number;
    totalImpressions: number;
    totalConversions: number;
    roas: number;
    avgCpc: number;
  };
  budget: {
    dailyAllocated: number;
    dailyCap: number;
    utilization: number;
    activeCampaigns: number;
    totalCampaigns: number;
  };
  profiles: Profile[];
  campaigns: BiddingCampaign[];
  attribution: Attribution[];
  keywordsBySite: Record<string, SiteKeywords>;
  keywordSummary?: {
    total: number;
    assigned: number;
    unassigned: number;
    aiEvaluated: number;
    aiBid: number;
    aiReview: number;
  };
  microsites?: MicrositeSummary[];
  enrichment?: Enrichment;
}

// ═══════════════════════════════════════════════════════════════════════════
// Types — Ads API
// ═══════════════════════════════════════════════════════════════════════════

interface KPIs {
  spend: number;
  revenue: number;
  roas: number | null;
  clicks: number;
  impressions: number;
  conversions: number;
  cpc: number | null;
  cpa: number | null;
  ctr: number | null;
  budgetUtilization?: number | null;
}

interface AdsCampaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  siteName: string;
  micrositeName: string | null;
  spend: number;
  revenue: number;
  roas: number | null;
  clicks: number;
  impressions: number;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  conversions: number;
  dailyBudget: number;
  maxCpc: number;
  keywords: string[];
  targetUrl: string;
  landingPagePath: string | null;
  landingPageType: string | null;
  landingPageProducts: number | null;
  qualityScore: number | null;
}

interface DailyTrend {
  date: string;
  spend: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
  roas: number | null;
}

interface PlatformMetrics {
  campaigns: number;
  spend: number;
  revenue: number;
  roas: number | null;
  clicks: number;
  impressions: number;
  conversions: number;
  cpc: number | null;
  ctr: number | null;
}

interface AdsAttribution {
  campaign: string;
  source: string;
  bookings: number;
  revenue: number;
  commission: number;
}

interface LandingPage {
  path: string;
  conversions: number;
  revenue: number;
  commission: number;
}

interface LandingPageTypePerf {
  type: string;
  campaigns: number;
  spend: number;
  clicks: number;
  conversions: number;
  revenue: number;
  roas: number | null;
  cvr: number | null;
  avgQualityScore: number | null;
}

interface Alert {
  id: string;
  type: string;
  severity: string;
  campaignId: string | null;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

interface AdsData {
  kpis: KPIs;
  kpisPrior: KPIs;
  dailyTrend: DailyTrend[];
  platformComparison: { google: PlatformMetrics; meta: PlatformMetrics };
  campaigns: AdsCampaign[];
  attribution: AdsAttribution[];
  landingPages: LandingPage[];
  landingPagesByType: LandingPageTypePerf[];
  alerts: Alert[];
  alertCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Computed Types
// ═══════════════════════════════════════════════════════════════════════════

interface RankedOpportunity extends SiteKeyword {
  siteId: string;
  siteName: string;
  maxProfitableCpc: number;
  isProfitable: boolean;
  opportunityScore: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function calculateOpportunityScore(kw: SiteKeyword, profile: Profile | undefined): number {
  const aiWeight = kw.aiScore || 0;
  const profitabilityBonus = profile && kw.cpc <= profile.maxProfitableCpc ? 20 : 0;
  const volumeBonus = Math.min(kw.searchVolume / 100, 20);
  const difficultyPenalty = kw.difficulty > 70 ? -15 : kw.difficulty > 50 ? -5 : 0;
  return aiWeight + profitabilityBonus + volumeBonus + difficultyPenalty;
}

const fmt = (
  n: number | null | undefined,
  type: 'currency' | 'number' | 'percent' | 'roas' = 'number'
) => {
  if (n == null) return '\u2014';
  switch (type) {
    case 'currency':
      return `\u00A3${n.toFixed(2)}`;
    case 'percent':
      return `${n.toFixed(1)}%`;
    case 'roas':
      return `${n.toFixed(2)}x`;
    case 'number':
      return n.toLocaleString();
  }
};

const trendPct = (current: number | null, prior: number | null) => {
  if (current == null || prior == null || prior === 0) return null;
  return ((current - prior) / prior) * 100;
};

const roasColor = (roas: number | null) => {
  if (roas == null) return 'text-slate-400';
  if (roas >= 3) return 'text-emerald-600';
  if (roas >= 1) return 'text-amber-600';
  return 'text-red-600';
};

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  PAUSED: 'bg-amber-100 text-amber-800',
  DRAFT: 'bg-slate-100 text-slate-800',
  ENDED: 'bg-red-100 text-red-800',
};

const intentColors: Record<string, string> = {
  TRANSACTIONAL: 'bg-green-100 text-green-800',
  COMMERCIAL: 'bg-blue-100 text-blue-800',
  NAVIGATIONAL: 'bg-purple-100 text-purple-800',
  INFORMATIONAL: 'bg-slate-100 text-slate-800',
};

const aiDecisionColors: Record<string, string> = {
  BID: 'bg-green-100 text-green-800',
  REVIEW: 'bg-amber-100 text-amber-800',
  SKIP: 'bg-red-100 text-red-800',
};

const platformColors: Record<string, string> = {
  META: 'bg-blue-100 text-blue-800',
  FACEBOOK: 'bg-blue-100 text-blue-800',
  GOOGLE_SEARCH: 'bg-red-100 text-red-800',
  PINTEREST: 'bg-rose-100 text-rose-800',
};

const platformLabel = (p: string) =>
  p === 'FACEBOOK' ? 'Meta' : p === 'GOOGLE_SEARCH' ? 'Google' : p;

const severityColors: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  WARNING: 'bg-amber-100 text-amber-700',
  INFO: 'bg-blue-100 text-blue-700',
};

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

type Tab = 'overview' | 'strategy' | 'campaigns' | 'performance';

export default function PaidTrafficDashboard() {
  // --- Data state ---
  const [biddingData, setBiddingData] = useState<BiddingData | null>(null);
  const [adsData, setAdsData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // --- Shared state ---
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [days, setDays] = useState('30');

  // --- Strategy tab state ---
  const [showCount, setShowCount] = useState(20);
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [showMicrosites, setShowMicrosites] = useState(false);
  const [budgetCap, setBudgetCap] = useState(1200);
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());

  // --- Campaigns tab state ---
  const [campaignFilter, setCampaignFilter] = useState('ALL');
  const [platformFilter, setPlatformFilter] = useState('');
  const [sortField, setSortField] = useState<string>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

  // ─── Data Fetching ────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [biddingRes, adsRes] = await Promise.all([
        fetch(`${basePath}/api/analytics/bidding?days=${days}`),
        fetch(`${basePath}/api/analytics/ads?days=${days}`),
      ]);

      if (!biddingRes.ok) throw new Error(`Bidding API: HTTP ${biddingRes.status}`);
      const biddingJson = await biddingRes.json();
      setBiddingData(biddingJson);

      // Ads API is optional — don't fail if it errors
      if (adsRes.ok) {
        const adsJson = await adsRes.json();
        setAdsData(adsJson);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [days, basePath]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Actions ──────────────────────────────────────────────────────────

  const triggerBiddingAction = async (action: string, extra?: Record<string, unknown>) => {
    try {
      setActionMessage('Running...');
      if (action === 'run_engine') {
        const response = await fetch(`${basePath}/api/operations/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'trigger', jobType: 'BIDDING_ENGINE_RUN' }),
        });
        const result = await response.json();
        setActionMessage(result.success ? `Engine triggered (Job: ${result.jobId})` : result.error);
      } else {
        const response = await fetch(`${basePath}/api/analytics/bidding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...extra }),
        });
        const result = await response.json();
        setActionMessage(result.message || result.error);
      }
      setTimeout(fetchData, 2000);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const triggerAdsAction = async (action: string, params: Record<string, unknown> = {}) => {
    setActionLoading(action);
    try {
      const res = await fetch(`${basePath}/api/analytics/ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
      });
      if (!res.ok) throw new Error('Action failed');
      await fetchData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Computed: Strategy ───────────────────────────────────────────────

  const toggleSite = (siteId: string) => {
    setExpandedSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  const topOpportunities = useMemo<RankedOpportunity[]>(() => {
    if (!biddingData) return [];
    const all: RankedOpportunity[] = [];
    for (const [siteId, site] of Object.entries(biddingData.keywordsBySite)) {
      const profile = biddingData.profiles.find((p) => p.siteId === siteId);
      for (const kw of site.keywords) {
        if (kw.aiDecision !== 'BID' && kw.aiDecision !== 'REVIEW') continue;
        if (siteFilter && siteId !== siteFilter) continue;
        all.push({
          ...kw,
          siteId,
          siteName: site.siteName,
          maxProfitableCpc: profile?.maxProfitableCpc || 0,
          isProfitable: profile ? kw.cpc <= profile.maxProfitableCpc : false,
          opportunityScore: calculateOpportunityScore(kw, profile),
        });
      }
    }
    all.sort((a, b) => b.opportunityScore - a.opportunityScore);
    return all.slice(0, showCount);
  }, [biddingData, siteFilter, showCount]);

  const totalOpportunities = useMemo(() => {
    if (!biddingData) return 0;
    let count = 0;
    for (const [siteId, site] of Object.entries(biddingData.keywordsBySite)) {
      for (const kw of site.keywords) {
        if (kw.aiDecision !== 'BID' && kw.aiDecision !== 'REVIEW') continue;
        if (siteFilter && siteId !== siteFilter) continue;
        count++;
      }
    }
    return count;
  }, [biddingData, siteFilter]);

  const proposalMetrics = useMemo(() => {
    if (!biddingData) return null;
    const drafts = biddingData.campaigns.filter((c) => c.status === 'DRAFT' && c.proposalData);
    if (drafts.length === 0) return null;

    const bySite = new Map<string, BiddingCampaign[]>();
    for (const d of drafts) {
      const groupKey = d.isMicrosite && d.micrositeName ? d.micrositeName : d.siteName;
      const existing = bySite.get(groupKey) || [];
      existing.push(d);
      bySite.set(groupKey, existing);
    }

    let totalDailySpend = 0;
    let totalClicksPerDay = 0;
    let totalDailyRevenue = 0;
    let mainSiteCampaigns = 0;
    let micrositeCampaigns = 0;
    for (const d of drafts) {
      const p = d.proposalData!;
      totalDailySpend += p.expectedDailyCost;
      totalClicksPerDay += p.expectedClicksPerDay;
      totalDailyRevenue += p.expectedDailyRevenue;
      if (d.isMicrosite) micrositeCampaigns++;
      else mainSiteCampaigns++;
    }

    const firstAssumptions = drafts[0]!.proposalData!.assumptions;
    const avgCpc = totalClicksPerDay > 0 ? totalDailySpend / totalClicksPerDay : 0;
    const conversionRate = firstAssumptions.conversionRate;
    const dailyBookings = totalClicksPerDay * conversionRate;
    const cpa = dailyBookings > 0 ? totalDailySpend / dailyBookings : 0;
    const roas = totalDailySpend > 0 ? totalDailyRevenue / totalDailySpend : 0;

    return {
      drafts,
      bySite,
      siteCount: bySite.size,
      mainSiteCampaigns,
      micrositeCampaigns,
      totalDailySpend,
      totalClicksPerDay,
      totalDailyRevenue,
      avgCpc,
      dailyBookings,
      cpa,
      roas,
      assumptions: firstAssumptions,
    };
  }, [biddingData]);

  // ─── Computed: Campaigns (merged) ─────────────────────────────────────

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Merge campaigns from both APIs, dedup by id, prefer ads data (has more fields)
  const allCampaigns = useMemo(() => {
    const map = new Map<string, AdsCampaign | BiddingCampaign>();
    // Ads campaigns first (richer data)
    if (adsData) {
      for (const c of adsData.campaigns) map.set(c.id, c);
    }
    // Bidding campaigns fill in any missing
    if (biddingData) {
      for (const c of biddingData.campaigns) {
        if (!map.has(c.id)) map.set(c.id, c);
      }
    }
    return Array.from(map.values());
  }, [biddingData, adsData]);

  const filteredCampaigns = useMemo(() => {
    let list = allCampaigns;
    if (campaignFilter !== 'ALL') list = list.filter((c) => c.status === campaignFilter);
    if (platformFilter) list = list.filter((c) => c.platform === platformFilter);
    return [...list].sort((a, b) => {
      const aVal = (a as any)[sortField] ?? 0;
      const bVal = (b as any)[sortField] ?? 0;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [allCampaigns, campaignFilter, platformFilter, sortField, sortDir]);

  const draftCount = biddingData?.campaigns.filter((c) => c.status === 'DRAFT').length || 0;

  // ─── Shorthand refs ───────────────────────────────────────────────────

  const data = biddingData;
  const enrichment = data?.enrichment;
  const proj = enrichment?.projection;
  const kp = enrichment?.keywordPool;

  // ─── Loading / Error states ───────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Paid Traffic</h1>
        <Card>
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-sky-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-slate-500">Loading paid traffic data...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Paid Traffic</h1>
        <Card>
          <div className="p-8 text-center">
            <p className="text-red-600 mb-2">Error: {error}</p>
            <button onClick={fetchData} className="text-sm text-sky-600 hover:text-sky-700">
              Retry
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  // ─── KPI Card helper ──────────────────────────────────────────────────

  const KPICard = ({
    label,
    value,
    prior,
    format,
    colorFn,
  }: {
    label: string;
    value: number | null;
    prior?: number | null;
    format: 'currency' | 'number' | 'percent' | 'roas';
    colorFn?: (v: number | null) => string;
  }) => {
    const tv = trendPct(value, prior ?? null);
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm text-slate-500 mb-1">{label}</p>
        <p className={`text-2xl font-bold ${colorFn ? colorFn(value) : 'text-slate-900'}`}>
          {fmt(value, format)}
        </p>
        {tv != null && (
          <p className={`text-xs mt-1 ${tv >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {tv >= 0 ? '\u2191' : '\u2193'} {Math.abs(tv).toFixed(1)}% vs prior
          </p>
        )}
      </div>
    );
  };

  // ─── Critical alerts ──────────────────────────────────────────────────

  const criticalAlerts =
    adsData?.alerts.filter((a) => a.severity === 'CRITICAL' && !a.acknowledged) || [];

  // ═══════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paid Traffic</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Keyword enrichment, campaign management &amp; performance monitoring
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-md text-sm"
          >
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <button
            onClick={() => triggerBiddingAction('run_enrichment')}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
          >
            Enrich Keywords
          </button>
          <button
            onClick={() => triggerBiddingAction('run_engine')}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-sm font-medium"
          >
            Run Engine
          </button>
        </div>
      </div>

      {/* Action feedback */}
      {actionMessage && (
        <div className="px-4 py-2 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-800 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-sky-600 hover:text-sky-700 ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Critical alert banner */}
      {criticalAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-red-800">
              {criticalAlerts.length} critical alert{criticalAlerts.length > 1 ? 's' : ''}
            </p>
            <p className="text-sm text-red-700 mt-1">{criticalAlerts[0]?.message}</p>
          </div>
          <button
            onClick={() => triggerAdsAction('acknowledge_all_alerts')}
            className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700"
          >
            Dismiss All
          </button>
        </div>
      )}

      {/* ─── Tab Navigation ─────────────────────────────────────────────── */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          {[
            { key: 'overview' as Tab, label: 'Overview' },
            {
              key: 'strategy' as Tab,
              label: `Strategy${data.keywordSummary?.aiBid ? ` (${data.keywordSummary.aiBid} bid-ready)` : ''}`,
            },
            { key: 'campaigns' as Tab, label: `Campaigns (${allCampaigns.length})` },
            { key: 'performance' as Tab, label: 'Performance' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1: OVERVIEW — Executive summary
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Hero KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Projected ROAS</p>
                <p
                  className={`text-2xl font-bold ${
                    (proj?.overallRoas || 0) >= 3
                      ? 'text-emerald-600'
                      : (proj?.overallRoas || 0) >= 1
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}
                >
                  {proj ? `${proj.overallRoas.toFixed(1)}x` : '\u2014'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Monthly Profit</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {proj
                    ? `\u00A3${Math.round((proj.dailyRevenue - proj.dailySpend) * 30).toLocaleString()}`
                    : '\u2014'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Budget Fill</p>
                <p className="text-2xl font-bold text-sky-600">
                  {(data.budget.utilization * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-slate-400">
                  &pound;{data.budget.dailyAllocated.toFixed(0)}/&pound;
                  {data.budget.dailyCap.toFixed(0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Keyword Pool</p>
                <p className="text-2xl font-bold text-purple-600">
                  {kp?.total?.toLocaleString() || '\u2014'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Campaigns</p>
                <p className="text-2xl font-bold text-slate-700">
                  {proj?.totalCampaigns?.toLocaleString() ||
                    data.budget.totalCampaigns.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Budget Utilization Bar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        data.budget.utilization >= 0.95
                          ? 'bg-emerald-500'
                          : data.budget.utilization >= 0.5
                            ? 'bg-sky-500'
                            : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(data.budget.utilization * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm text-slate-600 whitespace-nowrap">
                  &pound;{data.budget.dailyAllocated.toFixed(0)} of &pound;
                  {data.budget.dailyCap.toFixed(0)}/day allocated
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Two-column: Enrichment Pipeline + ROAS Projections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Enrichment Pipeline */}
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Enrichment Pipeline</h3>
                {enrichment ? (
                  <div className="space-y-4">
                    {/* Suppliers */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-slate-600">Suppliers enriched</span>
                        <span className="font-mono font-semibold">
                          {enrichment.suppliersEnriched.toLocaleString()}/
                          {enrichment.suppliersTotal.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{
                            width: `${enrichment.suppliersTotal > 0 ? (enrichment.suppliersEnriched / enrichment.suppliersTotal) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Keyword Funnel */}
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Validated keywords</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {kp!.total.toLocaleString()}
                        </span>
                      </div>
                      {proj && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Selected by engine</span>
                          <span className="font-mono font-semibold text-sky-700">
                            {proj.uniqueKeywords.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {proj && kp!.total > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Selection rate</span>
                          <span className="font-mono text-slate-600">
                            {((proj.uniqueKeywords / kp!.total) * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Unique cities</span>
                        <span className="font-mono text-slate-600">{kp!.uniqueCities}</span>
                      </div>
                    </div>

                    {/* Last run */}
                    {enrichment.lastEnrichmentDate && (
                      <p className="text-xs text-slate-400">
                        Last enrichment:{' '}
                        {new Date(enrichment.lastEnrichmentDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    No enrichment data available. Run &quot;Enrich Keywords&quot; to start.
                  </p>
                )}
              </div>
            </Card>

            {/* ROAS Projections */}
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">ROAS Projections</h3>
                {proj ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500">Campaigns</span>
                        <p className="font-semibold">{proj.totalCampaigns.toLocaleString()}</p>
                        <p className="text-xs text-slate-400">
                          {proj.uniqueKeywords.toLocaleString()} unique &times; 2 platforms
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Profitable &ge;3x</span>
                        <p className="font-semibold text-emerald-600">
                          {proj.profitableCampaigns.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Daily Spend</span>
                        <p className="font-semibold">&pound;{proj.dailySpend.toFixed(0)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Daily Revenue</span>
                        <p className="font-semibold text-emerald-600">
                          &pound;{proj.dailyRevenue.toFixed(0)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Monthly Spend</span>
                        <p className="font-semibold">
                          &pound;{Math.round(proj.dailySpend * 30).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Monthly Revenue</span>
                        <p className="font-semibold text-emerald-600">
                          &pound;{Math.round(proj.dailyRevenue * 30).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Assumptions */}
                    {proj.assumptions && (
                      <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 flex-wrap">
                        <span className="font-medium text-slate-600">Assumptions:</span>
                        <span>AOV &pound;{proj.assumptions.aov?.toFixed(0)}</span>
                        <span>&middot;</span>
                        <span>Comm {proj.assumptions.commission?.toFixed(0)}%</span>
                        <span>&middot;</span>
                        <span>CVR {((proj.assumptions.cvr || 0) * 100).toFixed(1)}%</span>
                        <span>&middot;</span>
                        <span>Target {proj.assumptions.targetRoas}x</span>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => triggerBiddingAction('run_engine')}
                        className="px-3 py-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-xs font-medium"
                      >
                        Run Engine
                      </button>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        Budget &pound;
                        <input
                          type="number"
                          value={budgetCap}
                          onChange={(e) => setBudgetCap(Number(e.target.value))}
                          className="w-20 px-1.5 py-0.5 border border-slate-300 rounded text-xs font-mono"
                          min={100}
                          step={100}
                        />
                        /day
                      </span>
                      {budgetCap !== data.budget.dailyCap && (
                        <button
                          onClick={() =>
                            triggerBiddingAction('set_budget_cap', { dailyBudgetCap: budgetCap })
                          }
                          className="px-2 py-0.5 bg-sky-600 text-white rounded text-xs font-medium hover:bg-sky-700"
                        >
                          Apply
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    Run the bidding engine to generate projections.
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Three-column: Platform Split, Landing Routing, CPC Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Platform Split */}
            <Card>
              <div className="p-5">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Platform Split</h4>
                {proj ? (
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                          Google
                        </span>
                        <span className="text-xs text-slate-400">
                          {proj.googleCampaigns} campaigns
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          Meta
                        </span>
                        <span className="text-xs text-slate-400">
                          {proj.facebookCampaigns} campaigns
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No data</p>
                )}
              </div>
            </Card>

            {/* Landing Routing */}
            <Card>
              <div className="p-5">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Landing Routing</h4>
                {proj ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Microsites</span>
                      <span className="font-mono">{proj.micrositeCampaigns}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{proj.uniqueMicrosites} unique microsites</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Main site</span>
                      <span className="font-mono">{proj.mainSiteCampaigns}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No data</p>
                )}
              </div>
            </Card>

            {/* CPC Distribution */}
            <Card>
              <div className="p-5">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">CPC Distribution</h4>
                {kp ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">&lt;&pound;0.25</span>
                      <span className="font-mono">{kp.cpcUnder025.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">&pound;0.25&ndash;0.50</span>
                      <span className="font-mono">{kp.cpc025to050.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">&pound;0.50&ndash;1.00</span>
                      <span className="font-mono">{kp.cpc050to100.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">&gt;&pound;1.00</span>
                      <span className="font-mono">{kp.cpcOver100.toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No data</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 2: STRATEGY — Keyword management & campaign planning
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'strategy' && (
        <div className="space-y-6">
          {/* Pipeline Automation Status */}
          <Card className="border border-slate-200 bg-slate-50/50">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Pipeline Automation</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Keywords discovered at 3 AM &rarr; Engine scores &amp; creates campaigns at 5 AM
                    &rarr; Auto-deployed as PAUSED. Activate campaigns in the Campaigns tab to start
                    spending.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    Budget cap &pound;
                    <input
                      type="number"
                      value={budgetCap}
                      onChange={(e) => setBudgetCap(Number(e.target.value))}
                      className="w-20 px-1.5 py-0.5 border border-slate-300 rounded text-xs font-mono"
                      min={100}
                      step={100}
                    />
                    /day
                    {budgetCap !== data.budget.dailyCap && (
                      <button
                        onClick={() =>
                          triggerBiddingAction('set_budget_cap', { dailyBudgetCap: budgetCap })
                        }
                        className="px-2 py-0.5 bg-sky-600 text-white rounded text-xs font-medium hover:bg-sky-700"
                      >
                        Re-run
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => triggerBiddingAction('run_engine')}
                    className="px-3 py-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-xs font-medium"
                  >
                    Run Engine Now
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Enrichment Pipeline Detail */}
          {enrichment && kp && (
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">
                  Enrichment Pipeline Detail
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Volume Distribution */}
                  <div>
                    <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">
                      Volume Distribution
                    </h4>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">High (1000+)</span>
                        <span className="font-mono">{kp.highVolume.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Medium (100-999)</span>
                        <span className="font-mono">{kp.medVolume.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Low (10-99)</span>
                        <span className="font-mono">{kp.lowVolume.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* CPC Distribution */}
                  <div>
                    <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">
                      CPC Distribution
                    </h4>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">&lt;&pound;0.25</span>
                        <span className="font-mono">{kp.cpcUnder025.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">&pound;0.25&ndash;0.50</span>
                        <span className="font-mono">{kp.cpc025to050.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">&pound;0.50&ndash;1.00</span>
                        <span className="font-mono">{kp.cpc050to100.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">&gt;&pound;1.00</span>
                        <span className="font-mono">{kp.cpcOver100.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Intent Breakdown */}
                  <div>
                    <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">
                      Intent Breakdown
                    </h4>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Commercial</span>
                        <span className="font-mono">
                          {kp.intentBreakdown.commercial.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Transactional</span>
                        <span className="font-mono">
                          {kp.intentBreakdown.transactional.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Informational</span>
                        <span className="font-mono">
                          {kp.intentBreakdown.informational.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Navigational</span>
                        <span className="font-mono">
                          {kp.intentBreakdown.navigational.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Averages */}
                  <div>
                    <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">Averages</h4>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Avg CPC</span>
                        <span className="font-mono">&pound;{kp.avgCpc.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Avg Volume</span>
                        <span className="font-mono">{kp.avgVolume.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Total Keywords</span>
                        <span className="font-mono font-semibold">{kp.total.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Cities</span>
                        <span className="font-mono">{kp.uniqueCities}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Keyword Pipeline Summary */}
          {data.keywordSummary && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Keyword Pipeline</h3>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-500">{data.keywordSummary.total} total</span>
                    <span className="text-green-700 font-medium">
                      {data.keywordSummary.aiBid} bid-ready
                    </span>
                    <span className="text-amber-700">
                      {data.keywordSummary.aiReview} need review
                    </span>
                    <span className="text-slate-400">
                      {data.keywordSummary.total - data.keywordSummary.aiEvaluated} pending AI
                    </span>
                    {data.keywordSummary.unassigned > 0 && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                        {data.keywordSummary.unassigned} unassigned
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Site Profitability Cards */}
          {data.profiles.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Site Profitability ({data.profiles.length})
                </h3>
                {siteFilter && (
                  <button
                    onClick={() => setSiteFilter(null)}
                    className="text-xs text-sky-600 hover:text-sky-700"
                  >
                    Clear site filter
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {data.profiles.map((p) => {
                  const siteKws = data.keywordsBySite[p.siteId];
                  const kwCount = siteKws?.keywords.length || 0;
                  const bidCount =
                    siteKws?.keywords.filter((k) => k.aiDecision === 'BID').length || 0;
                  const isSelected = siteFilter === p.siteId;
                  return (
                    <button
                      key={p.siteId}
                      onClick={() => setSiteFilter(isSelected ? null : p.siteId)}
                      className={`text-left border rounded-lg border-l-4 transition-all ${
                        isSelected
                          ? 'ring-2 ring-sky-500 border-l-sky-500 bg-sky-50/50'
                          : p.maxProfitableCpc > 0.1
                            ? 'border-l-green-500 hover:bg-slate-50'
                            : p.maxProfitableCpc > 0.05
                              ? 'border-l-amber-500 hover:bg-slate-50'
                              : 'border-l-red-500 hover:bg-slate-50'
                      } ${!isSelected ? 'border-slate-200' : ''}`}
                    >
                      <div className="p-3">
                        <div className="font-medium text-sm text-slate-900 truncate">
                          {p.siteName}
                        </div>
                        {p.domain && (
                          <div className="text-xs text-slate-400 truncate">{p.domain}</div>
                        )}
                        <div className="text-xs text-slate-500 mt-1.5">
                          Max CPC:{' '}
                          <span
                            className={`font-mono font-semibold ${
                              p.maxProfitableCpc > 0.1
                                ? 'text-green-700'
                                : p.maxProfitableCpc > 0.05
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }`}
                          >
                            &pound;{p.maxProfitableCpc.toFixed(4)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                          <span>{kwCount} kw</span>
                          {bidCount > 0 && <span className="text-green-700">{bidCount} bid</span>}
                          <span className={p.isAutoBidding ? 'text-green-700' : 'text-slate-400'}>
                            Auto: {p.isAutoBidding ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Opportunities Table */}
          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Top Opportunities
                  {siteFilter && data.profiles.find((p) => p.siteId === siteFilter) && (
                    <span className="text-slate-400 font-normal ml-2">
                      &mdash; {data.profiles.find((p) => p.siteId === siteFilter)?.siteName}
                    </span>
                  )}
                </h3>
                <span className="text-xs text-slate-500">
                  Showing {topOpportunities.length} of {totalOpportunities} opportunities
                </span>
              </div>
              {topOpportunities.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="text-center px-3 py-2 font-medium text-slate-600 w-10">
                            #
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">
                            Keyword
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Site</th>
                          <th className="text-center px-3 py-2 font-medium text-slate-600">AI</th>
                          <th className="text-right px-3 py-2 font-medium text-slate-600">Score</th>
                          <th className="text-right px-3 py-2 font-medium text-slate-600">CPC</th>
                          <th className="text-right px-3 py-2 font-medium text-slate-600">
                            Volume
                          </th>
                          <th className="text-center px-3 py-2 font-medium text-slate-600">
                            Profitable
                          </th>
                          <th className="text-right px-3 py-2 font-medium text-slate-600">
                            Est. Cost/mo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {topOpportunities.map((opp, idx) => (
                          <tr
                            key={opp.id}
                            className={`border-b border-slate-100 hover:bg-slate-50 ${
                              opp.aiDecision === 'BID' ? 'bg-green-50/30' : ''
                            }`}
                          >
                            <td className="px-3 py-2 text-center text-slate-400 font-mono text-xs">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-900">{opp.keyword}</div>
                              {opp.location && (
                                <div className="text-xs text-slate-500">{opp.location}</div>
                              )}
                              {opp.aiReasoning && (
                                <div
                                  className="text-xs text-slate-400 italic mt-0.5 max-w-xs truncate"
                                  title={opp.aiReasoning}
                                >
                                  {opp.aiReasoning}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600">{opp.siteName}</td>
                            <td className="px-3 py-2 text-center">
                              <span
                                className={`text-xs px-2 py-0.5 rounded font-medium ${
                                  aiDecisionColors[opp.aiDecision || ''] ||
                                  'bg-slate-100 text-slate-800'
                                }`}
                              >
                                {opp.aiDecision}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs">
                              {opp.opportunityScore.toFixed(0)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span
                                className={`font-mono ${opp.isProfitable ? 'text-green-700' : 'text-red-700'}`}
                              >
                                &pound;{opp.cpc.toFixed(3)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {opp.searchVolume.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {opp.isProfitable ? (
                                <span className="text-green-600 font-bold">&#10003;</span>
                              ) : (
                                <span className="text-red-400">&#10007;</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-600">
                              &pound;{opp.estimatedMonthlyCost.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalOpportunities > showCount && (
                    <div className="mt-3 text-center">
                      <button
                        onClick={() => setShowCount((prev) => Math.min(prev + 30, 200))}
                        className="text-sm text-sky-600 hover:text-sky-700 font-medium"
                      >
                        Show more ({Math.min(totalOpportunities - showCount, 30)} more of{' '}
                        {totalOpportunities - showCount} remaining)
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400 py-4 text-center">
                  No bid-ready or review-pending keywords found.
                  {!data.keywordSummary?.aiEvaluated && ' Run the engine to evaluate keywords.'}
                </p>
              )}
            </div>
          </Card>

          {/* Progressive Disclosure: Full Keywords by Site */}
          {data.keywordsBySite && Object.keys(data.keywordsBySite).length > 0 && (
            <div>
              <button
                onClick={() => setShowAllKeywords(!showAllKeywords)}
                className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm font-medium text-slate-600 flex items-center justify-between border border-slate-200"
              >
                <span>
                  View all{' '}
                  {data.keywordSummary?.total ||
                    Object.values(data.keywordsBySite).reduce(
                      (s, site) => s + site.keywords.length,
                      0
                    )}{' '}
                  keywords by site
                </span>
                <span className="text-slate-400">{showAllKeywords ? '\u25B2' : '\u25BC'}</span>
              </button>
              {showAllKeywords && (
                <Card className="mt-2">
                  <div className="p-4">
                    <div className="space-y-2">
                      {Object.entries(data.keywordsBySite)
                        .sort((a, b) => b[1].keywords.length - a[1].keywords.length)
                        .map(([siteId, site]) => {
                          const isExpanded = expandedSites.has(siteId);
                          const totalVolume = site.keywords.reduce((s, k) => s + k.searchVolume, 0);
                          const totalEstCost = site.keywords.reduce(
                            (s, k) => s + k.estimatedMonthlyCost,
                            0
                          );
                          const avgSiteCpc =
                            site.keywords.length > 0
                              ? site.keywords.reduce((s, k) => s + k.cpc, 0) / site.keywords.length
                              : 0;
                          const profile = data.profiles.find((p) => p.siteId === siteId);
                          const bidKws = site.keywords.filter((k) => k.aiDecision === 'BID').length;
                          const reviewKws = site.keywords.filter(
                            (k) => k.aiDecision === 'REVIEW'
                          ).length;
                          const unevaluated = site.keywords.filter(
                            (k) => k.aiScore === null
                          ).length;

                          return (
                            <div
                              key={siteId}
                              className="border border-slate-200 rounded-lg overflow-hidden"
                            >
                              <button
                                onClick={() => toggleSite(siteId)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                              >
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="text-sm font-medium text-slate-900">
                                    {site.siteName}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 bg-sky-100 text-sky-800 rounded">
                                    {site.keywords.length} keywords
                                  </span>
                                  {bidKws > 0 && (
                                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">
                                      {bidKws} bid
                                    </span>
                                  )}
                                  {reviewKws > 0 && (
                                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded">
                                      {reviewKws} review
                                    </span>
                                  )}
                                  {unevaluated > 0 && (
                                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                                      {unevaluated} pending AI
                                    </span>
                                  )}
                                  <span className="text-xs text-slate-500">
                                    {totalVolume.toLocaleString()} vol/mo
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    est. &pound;{totalEstCost.toFixed(2)}/mo
                                  </span>
                                  {profile && (
                                    <span
                                      className={`text-xs px-2 py-0.5 rounded ${
                                        profile.maxProfitableCpc > avgSiteCpc
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-red-100 text-red-800'
                                      }`}
                                    >
                                      max CPC &pound;{profile.maxProfitableCpc.toFixed(4)}
                                    </span>
                                  )}
                                </div>
                                <span className="text-slate-400 text-sm">
                                  {isExpanded ? '\u25B2' : '\u25BC'}
                                </span>
                              </button>
                              {isExpanded && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-slate-200 bg-slate-50/50">
                                        <th className="text-left px-4 py-2 font-medium text-slate-600">
                                          Keyword
                                        </th>
                                        <th className="text-center px-4 py-2 font-medium text-slate-600">
                                          AI
                                        </th>
                                        <th className="text-right px-4 py-2 font-medium text-slate-600">
                                          CPC
                                        </th>
                                        <th className="text-right px-4 py-2 font-medium text-slate-600">
                                          Volume
                                        </th>
                                        <th className="text-right px-4 py-2 font-medium text-slate-600">
                                          Difficulty
                                        </th>
                                        <th className="text-right px-4 py-2 font-medium text-slate-600">
                                          Score
                                        </th>
                                        <th className="text-center px-4 py-2 font-medium text-slate-600">
                                          Intent
                                        </th>
                                        <th className="text-right px-4 py-2 font-medium text-slate-600">
                                          Est. Cost
                                        </th>
                                        <th className="text-right px-4 py-2 font-medium text-slate-600">
                                          Max Bid
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {site.keywords
                                        .sort((a, b) => {
                                          const orderA =
                                            a.aiDecision === 'BID'
                                              ? 0
                                              : a.aiDecision === 'REVIEW'
                                                ? 1
                                                : 2;
                                          const orderB =
                                            b.aiDecision === 'BID'
                                              ? 0
                                              : b.aiDecision === 'REVIEW'
                                                ? 1
                                                : 2;
                                          if (orderA !== orderB) return orderA - orderB;
                                          return (b.aiScore || 0) - (a.aiScore || 0);
                                        })
                                        .map((kw) => (
                                          <tr
                                            key={kw.id}
                                            className={`border-b border-slate-100 hover:bg-slate-50 ${
                                              kw.aiDecision === 'BID' ? 'bg-green-50/30' : ''
                                            }`}
                                          >
                                            <td className="px-4 py-2">
                                              <div className="font-medium text-slate-900">
                                                {kw.keyword}
                                              </div>
                                              {kw.location && (
                                                <div className="text-xs text-slate-500">
                                                  {kw.location}
                                                </div>
                                              )}
                                              {kw.aiReasoning && (
                                                <div className="text-xs text-slate-400 italic mt-0.5">
                                                  {kw.aiReasoning}
                                                </div>
                                              )}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                              {kw.aiDecision ? (
                                                <div className="flex flex-col items-center gap-0.5">
                                                  <span
                                                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                                                      aiDecisionColors[kw.aiDecision] ||
                                                      'bg-slate-100 text-slate-800'
                                                    }`}
                                                  >
                                                    {kw.aiDecision}
                                                  </span>
                                                  <span className="text-xs text-slate-400">
                                                    {kw.aiScore}
                                                  </span>
                                                </div>
                                              ) : (
                                                <span className="text-xs text-slate-300">--</span>
                                              )}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                              <span
                                                className={`font-mono ${
                                                  profile && kw.cpc <= profile.maxProfitableCpc
                                                    ? 'text-green-700'
                                                    : 'text-red-700'
                                                }`}
                                              >
                                                &pound;{kw.cpc.toFixed(3)}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">
                                              {kw.searchVolume.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                              <span
                                                className={`font-mono ${
                                                  kw.difficulty > 70
                                                    ? 'text-red-600'
                                                    : kw.difficulty > 40
                                                      ? 'text-amber-600'
                                                      : 'text-green-600'
                                                }`}
                                              >
                                                {kw.difficulty}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">
                                              {kw.priorityScore}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                              <span
                                                className={`text-xs px-2 py-0.5 rounded font-medium ${
                                                  intentColors[kw.intent] ||
                                                  'bg-slate-100 text-slate-800'
                                                }`}
                                              >
                                                {kw.intent}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono text-slate-600">
                                              &pound;{kw.estimatedMonthlyCost.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                              {kw.maxBid !== null ? (
                                                <span className="font-mono text-sky-700">
                                                  &pound;{kw.maxBid.toFixed(4)}
                                                </span>
                                              ) : (
                                                <span className="text-slate-400">-</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Progressive Disclosure: Microsites */}
          {data.microsites && data.microsites.length > 0 && (
            <div>
              <button
                onClick={() => setShowMicrosites(!showMicrosites)}
                className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm font-medium text-slate-600 flex items-center justify-between border border-slate-200"
              >
                <span>View {data.microsites.length} microsites (potential landing pages)</span>
                <span className="text-slate-400">{showMicrosites ? '\u25B2' : '\u25BC'}</span>
              </button>
              {showMicrosites && (
                <Card className="mt-2">
                  <div className="p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="text-left px-4 py-2 font-medium text-slate-600">
                              Microsite
                            </th>
                            <th className="text-left px-4 py-2 font-medium text-slate-600">
                              Keyword / Niche
                            </th>
                            <th className="text-center px-4 py-2 font-medium text-slate-600">
                              Type
                            </th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">
                              Products
                            </th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">
                              Sessions
                            </th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">
                              Pageviews
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.microsites.map((ms) => (
                            <tr key={ms.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="px-4 py-2">
                                <div className="font-medium text-slate-900">{ms.siteName}</div>
                                <div className="text-xs text-slate-400">{ms.fullDomain}</div>
                              </td>
                              <td className="px-4 py-2">
                                {ms.keyword && (
                                  <div className="text-sm text-slate-700">{ms.keyword}</div>
                                )}
                                {ms.destination && (
                                  <div className="text-xs text-slate-500">{ms.destination}</div>
                                )}
                                {ms.niche && (
                                  <div className="text-xs text-slate-400">{ms.niche}</div>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded font-medium ${
                                    ms.entityType === 'SUPPLIER'
                                      ? 'bg-blue-100 text-blue-800'
                                      : ms.entityType === 'PRODUCT'
                                        ? 'bg-purple-100 text-purple-800'
                                        : 'bg-sky-100 text-sky-800'
                                  }`}
                                >
                                  {ms.entityType}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right font-mono">{ms.productCount}</td>
                              <td className="px-4 py-2 text-right font-mono">{ms.sessions}</td>
                              <td className="px-4 py-2 text-right font-mono">{ms.pageviews}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 3: CAMPAIGNS — Merged campaign management
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          {/* PAUSED campaigns ready to activate */}
          {allCampaigns.filter((c) => c.status === 'PAUSED').length > 0 && (
            <div className="px-4 py-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-800 flex items-center justify-between">
              <span>
                {allCampaigns.filter((c) => c.status === 'PAUSED').length} campaign
                {allCampaigns.filter((c) => c.status === 'PAUSED').length !== 1 ? 's' : ''} deployed
                and ready to activate (not spending yet).
              </span>
              <button
                onClick={() => triggerBiddingAction('activate_paused')}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm font-medium"
              >
                Activate All
              </button>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Status pills */}
            <div className="flex items-center gap-1">
              {['ALL', 'ACTIVE', 'PAUSED', 'DRAFT', 'ENDED'].map((f) => {
                const count =
                  f === 'ALL'
                    ? allCampaigns.length
                    : allCampaigns.filter((c) => c.status === f).length;
                if (f !== 'ALL' && count === 0) return null;
                return (
                  <button
                    key={f}
                    onClick={() => setCampaignFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      campaignFilter === f
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()} ({count})
                  </button>
                );
              })}
            </div>

            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All Platforms</option>
              <option value="GOOGLE_SEARCH">Google Search</option>
              <option value="FACEBOOK">Meta / Facebook</option>
            </select>

            <span className="text-sm text-slate-500">{filteredCampaigns.length} campaigns</span>

            {/* Bulk actions */}
            {allCampaigns.some((c) => c.status === 'ACTIVE') && (
              <button
                onClick={() => triggerBiddingAction('pause_all')}
                className="ml-auto px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-xs font-medium"
              >
                Pause All
              </button>
            )}
          </div>

          {/* Campaign Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {[
                      { key: 'name', label: 'Campaign' },
                      { key: 'platform', label: 'Platform' },
                      { key: 'status', label: 'Status' },
                      { key: 'landingPageType', label: 'LP Type' },
                      { key: 'qualityScore', label: 'QS' },
                      { key: 'spend', label: 'Spend' },
                      { key: 'revenue', label: 'Revenue' },
                      { key: 'roas', label: 'ROAS' },
                      { key: 'clicks', label: 'Clicks' },
                      { key: 'ctr', label: 'CTR' },
                      { key: 'cpc', label: 'CPC' },
                      { key: 'conversions', label: 'Conv.' },
                      { key: 'dailyBudget', label: 'Budget/day' },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer hover:text-slate-700"
                      >
                        {col.label}
                        {sortField === col.key && (
                          <span className="ml-1">{sortDir === 'desc' ? '\u2193' : '\u2191'}</span>
                        )}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div
                          className="font-medium text-slate-900 truncate max-w-[200px]"
                          title={c.name}
                        >
                          {c.name}
                        </div>
                        <div className="text-xs text-slate-400">{c.siteName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            platformColors[c.platform] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {platformLabel(c.platform)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            statusColors[c.status] || 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.landingPageType ? (
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                              c.landingPageType === 'DESTINATION' ||
                              c.landingPageType === 'CATEGORY'
                                ? 'bg-emerald-50 text-emerald-700'
                                : c.landingPageType === 'EXPERIENCES_FILTERED'
                                  ? 'bg-amber-50 text-amber-700'
                                  : c.landingPageType === 'BLOG'
                                    ? 'bg-purple-50 text-purple-700'
                                    : 'bg-slate-50 text-slate-600'
                            }`}
                            title={c.landingPagePath || ''}
                          >
                            {c.landingPageType.replace(/_/g, ' ').substring(0, 12)}
                          </span>
                        ) : (
                          '\u2014'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.qualityScore != null ? (
                          <span
                            className={`text-sm font-semibold ${
                              c.qualityScore >= 7
                                ? 'text-emerald-600'
                                : c.qualityScore >= 4
                                  ? 'text-amber-600'
                                  : 'text-red-600'
                            }`}
                          >
                            {c.qualityScore}
                          </span>
                        ) : (
                          '\u2014'
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{fmt(c.spend, 'currency')}</td>
                      <td className="px-4 py-3 font-medium">{fmt(c.revenue, 'currency')}</td>
                      <td className={`px-4 py-3 font-bold ${roasColor(c.roas)}`}>
                        {fmt(c.roas, 'roas')}
                      </td>
                      <td className="px-4 py-3">{fmt(c.clicks)}</td>
                      <td className="px-4 py-3">{fmt((c as any).ctr, 'percent')}</td>
                      <td className="px-4 py-3">
                        {fmt((c as any).cpc ?? (c as any).avgCpc, 'currency')}
                      </td>
                      <td className="px-4 py-3">{fmt(c.conversions)}</td>
                      <td className="px-4 py-3">{fmt(c.dailyBudget, 'currency')}</td>
                      <td className="px-4 py-3">
                        {c.status === 'ACTIVE' && (
                          <button
                            onClick={() => triggerAdsAction('pause_campaign', { campaignId: c.id })}
                            disabled={actionLoading === `pause_${c.id}`}
                            className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                          >
                            Pause
                          </button>
                        )}
                        {c.status === 'PAUSED' && (
                          <button
                            onClick={() =>
                              triggerAdsAction('resume_campaign', { campaignId: c.id })
                            }
                            disabled={actionLoading === `resume_${c.id}`}
                            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                          >
                            Resume
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredCampaigns.length === 0 && (
              <div className="p-8 text-center text-slate-500">
                No campaigns match the current filters
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 4: PERFORMANCE — Actual results & attribution
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          {adsData ? (
            <>
              {/* KPI Cards with trends */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard
                  label="Total Spend"
                  value={adsData.kpis.spend}
                  prior={adsData.kpisPrior.spend}
                  format="currency"
                />
                <KPICard
                  label="Revenue"
                  value={adsData.kpis.revenue}
                  prior={adsData.kpisPrior.revenue}
                  format="currency"
                />
                <KPICard
                  label="ROAS"
                  value={adsData.kpis.roas}
                  prior={adsData.kpisPrior.roas}
                  format="roas"
                  colorFn={roasColor}
                />
                <KPICard
                  label="Conversions"
                  value={adsData.kpis.conversions}
                  prior={adsData.kpisPrior.conversions}
                  format="number"
                />
                <KPICard
                  label="Avg CPC"
                  value={adsData.kpis.cpc}
                  prior={adsData.kpisPrior.cpc}
                  format="currency"
                />
                <KPICard
                  label="CPA"
                  value={adsData.kpis.cpa}
                  prior={adsData.kpisPrior.cpa}
                  format="currency"
                />
                <KPICard
                  label="CTR"
                  value={adsData.kpis.ctr}
                  prior={adsData.kpisPrior.ctr}
                  format="percent"
                />
                <KPICard
                  label="Budget Utilization"
                  value={adsData.kpis.budgetUtilization ?? null}
                  format="percent"
                />
              </div>

              {/* Daily Trend Chart */}
              {adsData.dailyTrend.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h3 className="text-sm font-medium text-slate-700 mb-4">
                    Daily Spend &amp; Revenue
                  </h3>
                  <div className="flex items-end gap-1 h-40">
                    {adsData.dailyTrend.map((day) => {
                      const maxVal = Math.max(
                        ...adsData.dailyTrend.map((d) => d.spend),
                        ...adsData.dailyTrend.map((d) => d.revenue),
                        1
                      );
                      const spendHeight = (day.spend / maxVal) * 100;
                      const revenueHeight = (day.revenue / maxVal) * 100;
                      return (
                        <div
                          key={day.date}
                          className="flex-1 flex items-end gap-0.5 group relative"
                          title={`${day.date}: Spend \u00A3${day.spend.toFixed(2)}, Revenue \u00A3${day.revenue.toFixed(2)}`}
                        >
                          <div
                            className="flex-1 bg-red-300 rounded-t"
                            style={{
                              height: `${spendHeight}%`,
                              minHeight: day.spend > 0 ? '2px' : '0',
                            }}
                          />
                          <div
                            className="flex-1 bg-emerald-400 rounded-t"
                            style={{
                              height: `${revenueHeight}%`,
                              minHeight: day.revenue > 0 ? '2px' : '0',
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-red-300 rounded" /> Spend
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-emerald-400 rounded" /> Revenue
                    </div>
                  </div>
                </div>
              )}

              {/* Platform Comparison */}
              <div className="grid grid-cols-2 gap-4">
                {/* Google */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">
                      Google Search
                    </span>
                    <span className="text-xs text-slate-400">
                      {adsData.platformComparison.google.campaigns} campaigns
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-500">Spend</span>
                      <p className="font-semibold">
                        {fmt(adsData.platformComparison.google.spend, 'currency')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Revenue</span>
                      <p className="font-semibold">
                        {fmt(adsData.platformComparison.google.revenue, 'currency')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">ROAS</span>
                      <p
                        className={`font-semibold ${roasColor(adsData.platformComparison.google.roas)}`}
                      >
                        {fmt(adsData.platformComparison.google.roas, 'roas')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">CPC</span>
                      <p className="font-semibold">
                        {fmt(adsData.platformComparison.google.cpc, 'currency')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Clicks</span>
                      <p className="font-semibold">
                        {fmt(adsData.platformComparison.google.clicks)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Conversions</span>
                      <p className="font-semibold">
                        {fmt(adsData.platformComparison.google.conversions)}
                      </p>
                    </div>
                  </div>
                </div>
                {/* Meta */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                      Meta / Facebook
                    </span>
                    <span className="text-xs text-slate-400">
                      {adsData.platformComparison.meta.campaigns} campaigns
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-500">Spend</span>
                      <p className="font-semibold">
                        {fmt(adsData.platformComparison.meta.spend, 'currency')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Revenue</span>
                      <p className="font-semibold">
                        {fmt(adsData.platformComparison.meta.revenue, 'currency')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">ROAS</span>
                      <p
                        className={`font-semibold ${roasColor(adsData.platformComparison.meta.roas)}`}
                      >
                        {fmt(adsData.platformComparison.meta.roas, 'roas')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">CPC</span>
                      <p className="font-semibold">
                        {fmt(adsData.platformComparison.meta.cpc, 'currency')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Clicks</span>
                      <p className="font-semibold">{fmt(adsData.platformComparison.meta.clicks)}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Conversions</span>
                      <p className="font-semibold">
                        {fmt(adsData.platformComparison.meta.conversions)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Alerts */}
              {adsData.alerts.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h3 className="text-sm font-medium text-slate-700 mb-4">Recent Alerts</h3>
                  <div className="space-y-2">
                    {adsData.alerts.slice(0, 10).map((alert) => (
                      <div
                        key={alert.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${alert.acknowledged ? 'bg-slate-50' : 'bg-amber-50'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${severityColors[alert.severity] || 'bg-slate-100'}`}
                          >
                            {alert.severity}
                          </span>
                          <span
                            className={`text-sm ${alert.acknowledged ? 'text-slate-500' : 'text-slate-700'}`}
                          >
                            {alert.message}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">
                            {new Date(alert.createdAt).toLocaleDateString()}
                          </span>
                          {!alert.acknowledged && (
                            <button
                              onClick={() =>
                                triggerAdsAction('acknowledge_alert', { alertId: alert.id })
                              }
                              className="text-xs text-sky-600 hover:text-sky-700 font-medium"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Booking Attribution */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-sm font-medium text-slate-700 mb-4">
                  Booking Attribution by Campaign
                </h3>
                {adsData.attribution.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 text-xs text-slate-500 uppercase">
                          Campaign
                        </th>
                        <th className="text-left py-2 text-xs text-slate-500 uppercase">Source</th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">
                          Bookings
                        </th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">
                          Revenue
                        </th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">
                          Commission
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {adsData.attribution.map((a, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td
                            className="py-2 font-medium truncate max-w-[250px]"
                            title={a.campaign}
                          >
                            {a.campaign}
                          </td>
                          <td className="py-2 text-slate-600">{a.source}</td>
                          <td className="py-2 text-right">{a.bookings}</td>
                          <td className="py-2 text-right font-medium">
                            {fmt(a.revenue, 'currency')}
                          </td>
                          <td className="py-2 text-right text-emerald-600 font-medium">
                            {fmt(a.commission, 'currency')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-slate-500">
                    No paid booking attribution data for this period
                  </p>
                )}
              </div>

              {/* Landing Page Performance */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-sm font-medium text-slate-700 mb-4">
                  Landing Page Performance (Paid Traffic)
                </h3>
                {adsData.landingPages.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 text-xs text-slate-500 uppercase">
                          Landing Page
                        </th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">
                          Conversions
                        </th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">
                          Revenue
                        </th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">
                          Commission
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {adsData.landingPages.map((lp, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td
                            className="py-2 font-mono text-xs truncate max-w-[350px]"
                            title={lp.path}
                          >
                            {lp.path}
                          </td>
                          <td className="py-2 text-right">{lp.conversions}</td>
                          <td className="py-2 text-right font-medium">
                            {fmt(lp.revenue, 'currency')}
                          </td>
                          <td className="py-2 text-right text-emerald-600 font-medium">
                            {fmt(lp.commission, 'currency')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-slate-500">
                    No landing page conversion data for this period
                  </p>
                )}
              </div>

              {/* Landing Page Type Performance */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-sm font-medium text-slate-700 mb-4">
                  Performance by Landing Page Type
                </h3>
                {adsData.landingPagesByType && adsData.landingPagesByType.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 text-xs text-slate-500 uppercase">
                          Page Type
                        </th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">
                          Campaigns
                        </th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">Spend</th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">Clicks</th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">CVR</th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">
                          Revenue
                        </th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">ROAS</th>
                        <th className="text-right py-2 text-xs text-slate-500 uppercase">Avg QS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adsData.landingPagesByType.map((lp) => (
                        <tr key={lp.type} className="border-b border-slate-100">
                          <td className="py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                lp.type === 'DESTINATION' || lp.type === 'CATEGORY'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : lp.type === 'COLLECTION' || lp.type === 'EXPERIENCE_DETAIL'
                                    ? 'bg-sky-50 text-sky-700'
                                    : lp.type === 'EXPERIENCES_FILTERED'
                                      ? 'bg-amber-50 text-amber-700'
                                      : lp.type === 'BLOG'
                                        ? 'bg-purple-50 text-purple-700'
                                        : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {lp.type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2 text-right">{lp.campaigns}</td>
                          <td className="py-2 text-right">{fmt(lp.spend, 'currency')}</td>
                          <td className="py-2 text-right">{fmt(lp.clicks, 'number')}</td>
                          <td className="py-2 text-right">{fmt(lp.cvr, 'percent')}</td>
                          <td className="py-2 text-right font-medium">
                            {fmt(lp.revenue, 'currency')}
                          </td>
                          <td className={`py-2 text-right font-medium ${roasColor(lp.roas)}`}>
                            {fmt(lp.roas, 'roas')}
                          </td>
                          <td className="py-2 text-right">
                            {lp.avgQualityScore != null ? (
                              <span
                                className={
                                  lp.avgQualityScore >= 7
                                    ? 'text-emerald-600'
                                    : lp.avgQualityScore >= 4
                                      ? 'text-amber-600'
                                      : 'text-red-600'
                                }
                              >
                                {lp.avgQualityScore.toFixed(1)}
                              </span>
                            ) : (
                              '\u2014'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-slate-500">No landing page type data available yet</p>
                )}
              </div>
            </>
          ) : (
            <Card>
              <div className="p-8 text-center">
                <p className="text-slate-500">Performance data is loading or unavailable.</p>
                <button
                  onClick={fetchData}
                  className="mt-2 text-sm text-sky-600 hover:text-sky-700"
                >
                  Retry
                </button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
