'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

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

interface Campaign {
  id: string;
  name: string;
  siteName: string;
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
  campaigns: Campaign[];
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
}

interface RankedOpportunity extends SiteKeyword {
  siteId: string;
  siteName: string;
  maxProfitableCpc: number;
  isProfitable: boolean;
  opportunityScore: number;
}

function calculateOpportunityScore(kw: SiteKeyword, profile: Profile | undefined): number {
  const aiWeight = kw.aiScore || 0;
  const profitabilityBonus = profile && kw.cpc <= profile.maxProfitableCpc ? 20 : 0;
  const volumeBonus = Math.min(kw.searchVolume / 100, 20);
  const difficultyPenalty = kw.difficulty > 70 ? -15 : kw.difficulty > 50 ? -5 : 0;
  return aiWeight + profitabilityBonus + volumeBonus + difficultyPenalty;
}

export default function BiddingDashboardPage() {
  const [data, setData] = useState<BiddingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [days, setDays] = useState('30');
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());

  // Tab state
  const [activeTab, setActiveTab] = useState<'planning' | 'live'>('planning');

  // Planning tab state
  const [showCount, setShowCount] = useState(20);
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [showMicrosites, setShowMicrosites] = useState(false);

  // Live tab state
  const [campaignFilter, setCampaignFilter] = useState('ALL');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const response = await fetch(`${basePath}/api/analytics/bidding?days=${days}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const triggerAction = async (action: string, extra?: Record<string, unknown>) => {
    try {
      setActionMessage('Running...');
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

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
    GOOGLE_SEARCH: 'bg-red-100 text-red-800',
    PINTEREST: 'bg-rose-100 text-rose-800',
  };

  const toggleSite = (siteId: string) => {
    setExpandedSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  // Computed: top opportunities across all sites
  const topOpportunities = useMemo<RankedOpportunity[]>(() => {
    if (!data) return [];
    const all: RankedOpportunity[] = [];
    for (const [siteId, site] of Object.entries(data.keywordsBySite)) {
      const profile = data.profiles.find((p) => p.siteId === siteId);
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
  }, [data, siteFilter, showCount]);

  // Computed: total opportunities count (for "show more")
  const totalOpportunities = useMemo(() => {
    if (!data) return 0;
    let count = 0;
    for (const [siteId, site] of Object.entries(data.keywordsBySite)) {
      for (const kw of site.keywords) {
        if (kw.aiDecision !== 'BID' && kw.aiDecision !== 'REVIEW') continue;
        if (siteFilter && siteId !== siteFilter) continue;
        count++;
      }
    }
    return count;
  }, [data, siteFilter]);

  // Computed: filtered campaigns
  const filteredCampaigns = useMemo(() => {
    if (!data) return [];
    const statusOrder: Record<string, number> = { ACTIVE: 0, PAUSED: 1, DRAFT: 2, ENDED: 3 };
    const sorted = [...data.campaigns].sort(
      (a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
    );
    if (campaignFilter === 'ALL') return sorted;
    return sorted.filter((c) => c.status === campaignFilter);
  }, [data, campaignFilter]);

  const draftCount = data?.campaigns.filter((c) => c.status === 'DRAFT').length || 0;

  return (
    <div className="space-y-6">
      {/* Shared Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bidding Engine Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Automated paid traffic acquisition — profitability-driven bidding with AI keyword evaluation
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
            onClick={() => triggerAction('run_engine')}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-sm font-medium"
          >
            Run Engine
          </button>
          <button
            onClick={() => triggerAction('deploy_drafts')}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"
          >
            Deploy Drafts
          </button>
          <button
            onClick={() => triggerAction('pause_all')}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium"
          >
            Pause All
          </button>
        </div>
      </div>

      {/* Action message */}
      {actionMessage && (
        <div className="px-4 py-2 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-800">
          {actionMessage}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          {(['planning', 'live'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'planning'
                ? `Planning${data?.keywordSummary?.aiBid ? ` (${data.keywordSummary.aiBid} bid-ready)` : ''}`
                : `Live Campaigns${data?.budget?.activeCampaigns ? ` (${data.budget.activeCampaigns} active)` : ''}`}
            </button>
          ))}
        </nav>
      </div>

      {loading && !data ? (
        <Card>
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-sky-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-slate-500">Loading bidding data...</p>
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div className="p-8 text-center">
            <p className="text-red-600 mb-2">Error: {error}</p>
            <button onClick={fetchData} className="text-sm text-sky-600 hover:text-sky-700">
              Retry
            </button>
          </div>
        </Card>
      ) : data ? (
        <>
          {/* ==================== PLANNING TAB ==================== */}
          {activeTab === 'planning' && (
            <div className="space-y-6">
              {/* Keyword Pipeline Summary */}
              {data.keywordSummary && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-900">Keyword Pipeline</h3>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-slate-500">
                          {data.keywordSummary.total} total
                        </span>
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
                    {data.keywordSummary.unassigned > 0 && (
                      <p className="text-xs text-amber-700 mt-2">
                        Run the engine to auto-assign and AI-evaluate unassigned keywords.
                      </p>
                    )}
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
                      const bidCount = siteKws?.keywords.filter((k) => k.aiDecision === 'BID').length || 0;
                      const isSelected = siteFilter === p.siteId;

                      return (
                        <button
                          key={p.siteId}
                          onClick={() => setSiteFilter(isSelected ? null : p.siteId)}
                          className={`text-left border rounded-lg border-l-4 transition-all ${
                            isSelected
                              ? 'ring-2 ring-sky-500 border-l-sky-500 bg-sky-50/50'
                              : p.maxProfitableCpc > 0.10
                                ? 'border-l-green-500 hover:bg-slate-50'
                                : p.maxProfitableCpc > 0.05
                                  ? 'border-l-amber-500 hover:bg-slate-50'
                                  : 'border-l-red-500 hover:bg-slate-50'
                          } ${!isSelected ? 'border-slate-200' : ''}`}
                        >
                          <div className="p-3">
                            <div className="font-medium text-sm text-slate-900 truncate">{p.siteName}</div>
                            {p.domain && (
                              <div className="text-xs text-slate-400 truncate">{p.domain}</div>
                            )}
                            <div className="text-xs text-slate-500 mt-1.5">
                              Max CPC:{' '}
                              <span className={`font-mono font-semibold ${
                                p.maxProfitableCpc > 0.10 ? 'text-green-700' :
                                p.maxProfitableCpc > 0.05 ? 'text-amber-700' : 'text-red-700'
                              }`}>
                                &pound;{p.maxProfitableCpc.toFixed(4)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                              <span>{kwCount} kw</span>
                              {bidCount > 0 && (
                                <span className="text-green-700">{bidCount} bid</span>
                              )}
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
                          — {data.profiles.find((p) => p.siteId === siteFilter)?.siteName}
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
                              <th className="text-center px-3 py-2 font-medium text-slate-600 w-10">#</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Keyword</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Site</th>
                              <th className="text-center px-3 py-2 font-medium text-slate-600">AI</th>
                              <th className="text-right px-3 py-2 font-medium text-slate-600">Score</th>
                              <th className="text-right px-3 py-2 font-medium text-slate-600">CPC</th>
                              <th className="text-right px-3 py-2 font-medium text-slate-600">Volume</th>
                              <th className="text-center px-3 py-2 font-medium text-slate-600">Profitable</th>
                              <th className="text-right px-3 py-2 font-medium text-slate-600">Est. Cost/mo</th>
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
                                    <div className="text-xs text-slate-400 italic mt-0.5 max-w-xs truncate" title={opp.aiReasoning}>
                                      {opp.aiReasoning}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-600">{opp.siteName}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                    aiDecisionColors[opp.aiDecision || ''] || 'bg-slate-100 text-slate-800'
                                  }`}>
                                    {opp.aiDecision}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-xs">
                                  {opp.opportunityScore.toFixed(0)}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <span className={`font-mono ${
                                    opp.isProfitable ? 'text-green-700' : 'text-red-700'
                                  }`}>
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
                            Show more ({Math.min(totalOpportunities - showCount, 30)} more of {totalOpportunities - showCount} remaining)
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
                      View all {data.keywordSummary?.total || Object.values(data.keywordsBySite).reduce((s, site) => s + site.keywords.length, 0)} keywords by site
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
                              const totalEstCost = site.keywords.reduce((s, k) => s + k.estimatedMonthlyCost, 0);
                              const avgCpc = site.keywords.length > 0
                                ? site.keywords.reduce((s, k) => s + k.cpc, 0) / site.keywords.length
                                : 0;
                              const profile = data.profiles.find((p) => p.siteId === siteId);
                              const bidKws = site.keywords.filter((k) => k.aiDecision === 'BID').length;
                              const reviewKws = site.keywords.filter((k) => k.aiDecision === 'REVIEW').length;
                              const unevaluated = site.keywords.filter((k) => k.aiScore === null).length;

                              return (
                                <div key={siteId} className="border border-slate-200 rounded-lg overflow-hidden">
                                  <button
                                    onClick={() => toggleSite(siteId)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                                  >
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <span className="text-sm font-medium text-slate-900">{site.siteName}</span>
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
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                          profile.maxProfitableCpc > avgCpc
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                        }`}>
                                          max CPC &pound;{profile.maxProfitableCpc.toFixed(4)}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-slate-400 text-sm">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                                  </button>
                                  {isExpanded && (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="border-b border-slate-200 bg-slate-50/50">
                                            <th className="text-left px-4 py-2 font-medium text-slate-600">Keyword</th>
                                            <th className="text-center px-4 py-2 font-medium text-slate-600">AI</th>
                                            <th className="text-right px-4 py-2 font-medium text-slate-600">CPC</th>
                                            <th className="text-right px-4 py-2 font-medium text-slate-600">Volume</th>
                                            <th className="text-right px-4 py-2 font-medium text-slate-600">Difficulty</th>
                                            <th className="text-right px-4 py-2 font-medium text-slate-600">Score</th>
                                            <th className="text-center px-4 py-2 font-medium text-slate-600">Intent</th>
                                            <th className="text-right px-4 py-2 font-medium text-slate-600">Est. Cost</th>
                                            <th className="text-right px-4 py-2 font-medium text-slate-600">Max Bid</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {site.keywords
                                            .sort((a, b) => {
                                              const orderA = a.aiDecision === 'BID' ? 0 : a.aiDecision === 'REVIEW' ? 1 : 2;
                                              const orderB = b.aiDecision === 'BID' ? 0 : b.aiDecision === 'REVIEW' ? 1 : 2;
                                              if (orderA !== orderB) return orderA - orderB;
                                              return (b.aiScore || 0) - (a.aiScore || 0);
                                            })
                                            .map((kw) => (
                                            <tr key={kw.id} className={`border-b border-slate-100 hover:bg-slate-50 ${
                                              kw.aiDecision === 'BID' ? 'bg-green-50/30' : ''
                                            }`}>
                                              <td className="px-4 py-2">
                                                <div className="font-medium text-slate-900">{kw.keyword}</div>
                                                {kw.location && (
                                                  <div className="text-xs text-slate-500">{kw.location}</div>
                                                )}
                                                {kw.aiReasoning && (
                                                  <div className="text-xs text-slate-400 italic mt-0.5">{kw.aiReasoning}</div>
                                                )}
                                              </td>
                                              <td className="px-4 py-2 text-center">
                                                {kw.aiDecision ? (
                                                  <div className="flex flex-col items-center gap-0.5">
                                                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                                      aiDecisionColors[kw.aiDecision] || 'bg-slate-100 text-slate-800'
                                                    }`}>
                                                      {kw.aiDecision}
                                                    </span>
                                                    <span className="text-xs text-slate-400">{kw.aiScore}</span>
                                                  </div>
                                                ) : (
                                                  <span className="text-xs text-slate-300">--</span>
                                                )}
                                              </td>
                                              <td className="px-4 py-2 text-right">
                                                <span className={`font-mono ${
                                                  profile && kw.cpc <= profile.maxProfitableCpc
                                                    ? 'text-green-700'
                                                    : 'text-red-700'
                                                }`}>
                                                  &pound;{kw.cpc.toFixed(3)}
                                                </span>
                                              </td>
                                              <td className="px-4 py-2 text-right font-mono">
                                                {kw.searchVolume.toLocaleString()}
                                              </td>
                                              <td className="px-4 py-2 text-right">
                                                <span className={`font-mono ${
                                                  kw.difficulty > 70 ? 'text-red-600' :
                                                  kw.difficulty > 40 ? 'text-amber-600' : 'text-green-600'
                                                }`}>
                                                  {kw.difficulty}
                                                </span>
                                              </td>
                                              <td className="px-4 py-2 text-right font-mono">{kw.priorityScore}</td>
                                              <td className="px-4 py-2 text-center">
                                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                                  intentColors[kw.intent] || 'bg-slate-100 text-slate-800'
                                                }`}>
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
                                <th className="text-left px-4 py-2 font-medium text-slate-600">Microsite</th>
                                <th className="text-left px-4 py-2 font-medium text-slate-600">Keyword / Niche</th>
                                <th className="text-center px-4 py-2 font-medium text-slate-600">Type</th>
                                <th className="text-right px-4 py-2 font-medium text-slate-600">Products</th>
                                <th className="text-right px-4 py-2 font-medium text-slate-600">Sessions</th>
                                <th className="text-right px-4 py-2 font-medium text-slate-600">Pageviews</th>
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
                                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                      ms.entityType === 'SUPPLIER' ? 'bg-blue-100 text-blue-800' :
                                      ms.entityType === 'PRODUCT' ? 'bg-purple-100 text-purple-800' :
                                      'bg-sky-100 text-sky-800'
                                    }`}>
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

              {/* Empty state */}
              {data.profiles.length === 0 && (!data.keywordSummary || data.keywordSummary.total === 0) && (
                <Card>
                  <div className="p-6">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4">How the Bidding Engine Works</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm">
                      <div>
                        <div className="font-medium text-slate-900 mb-1">1. Profitability Analysis</div>
                        <p className="text-slate-500">
                          Calculates per-site AOV, commission rate, and conversion rate from booking data.
                          Determines max profitable CPC: AOV &times; CVR &times; commission / target ROAS.
                        </p>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 mb-1">2. AI Quality Evaluation</div>
                        <p className="text-slate-500">
                          Claude Haiku evaluates each keyword for relevance, commercial intent, competition
                          viability, and landing page fit. Keywords scoring below 30 are auto-archived.
                        </p>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 mb-1">3. Opportunity Scoring</div>
                        <p className="text-slate-500">
                          Scans PAID_CANDIDATE keywords, matches to sites &amp; microsites, and scores by
                          expected profit (volume &times; CTR &times; profit per click).
                        </p>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 mb-1">4. Campaign Management</div>
                        <p className="text-slate-500">
                          Creates campaigns on Meta and Google Ads with UTM tracking.
                          Daily sync pulls performance data, optimizer scales winners and pauses losers.
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ==================== LIVE TAB ==================== */}
          {activeTab === 'live' && (
            <div className="space-y-6">
              {/* Portfolio KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-emerald-600">
                      {data.portfolio.roas.toFixed(2)}x
                    </p>
                    <p className="text-xs text-slate-500">Portfolio ROAS</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-sky-600">
                      &pound;{data.portfolio.totalSpend.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500">Total Spend</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-green-600">
                      &pound;{data.portfolio.totalRevenue.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500">Total Revenue</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-blue-600">
                      {data.portfolio.totalClicks.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500">Total Clicks</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-purple-600">
                      {data.portfolio.totalConversions}
                    </p>
                    <p className="text-xs text-slate-500">Conversions</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-amber-600">
                      &pound;{data.portfolio.avgCpc.toFixed(3)}
                    </p>
                    <p className="text-xs text-slate-500">Avg CPC</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-slate-700">
                      {data.budget.activeCampaigns}/{data.budget.totalCampaigns}
                    </p>
                    <p className="text-xs text-slate-500">Active Campaigns</p>
                  </CardContent>
                </Card>
              </div>

              {/* Budget Utilization */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Budget Utilization</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-500 rounded-full transition-all"
                          style={{ width: `${Math.min(data.budget.utilization * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-sm text-slate-600 whitespace-nowrap">
                      &pound;{data.budget.dailyAllocated.toFixed(2)} / &pound;{data.budget.dailyCap.toFixed(2)} per day
                      <span className="ml-2 text-slate-400">
                        ({(data.budget.utilization * 100).toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Draft Campaign Banner */}
              {draftCount > 0 && (
                <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center justify-between">
                  <span>
                    {draftCount} draft campaign{draftCount !== 1 ? 's' : ''} ready to deploy to ad platforms.
                  </span>
                  <button
                    onClick={() => triggerAction('deploy_drafts')}
                    className="ml-4 px-3 py-1 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm font-medium"
                  >
                    Deploy Now
                  </button>
                </div>
              )}

              {/* Campaign Status Filter */}
              {data.campaigns.length > 0 ? (
                <Card>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Campaigns ({data.campaigns.length})
                      </h3>
                      <div className="flex items-center gap-1">
                        {['ALL', 'ACTIVE', 'PAUSED', 'DRAFT'].map((f) => {
                          const count = f === 'ALL'
                            ? data.campaigns.length
                            : data.campaigns.filter((c) => c.status === f).length;
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
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="text-left px-4 py-2 font-medium text-slate-600">Campaign</th>
                            <th className="text-center px-4 py-2 font-medium text-slate-600">Platform</th>
                            <th className="text-center px-4 py-2 font-medium text-slate-600">Status</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">Spend</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">Revenue</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">ROAS</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">Clicks</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">CTR</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">Avg CPC</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">Budget/day</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCampaigns.map((c) => (
                            <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="px-4 py-2">
                                <div className="font-medium text-slate-900">{c.name}</div>
                                <div className="text-xs text-slate-400">{c.siteName}</div>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                  platformColors[c.platform] || 'bg-slate-100 text-slate-800'
                                }`}>
                                  {c.platform}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                  statusColors[c.status] || 'bg-slate-100 text-slate-800'
                                }`}>
                                  {c.status}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                &pound;{c.spend.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                &pound;{c.revenue.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <span className={`font-mono font-semibold ${
                                  c.roas >= 3 ? 'text-green-700' :
                                  c.roas >= 1 ? 'text-amber-700' : 'text-red-700'
                                }`}>
                                  {c.roas.toFixed(2)}x
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                {c.clicks.toLocaleString()}
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                {(c.ctr * 100).toFixed(1)}%
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                &pound;{c.avgCpc.toFixed(3)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                &pound;{c.dailyBudget.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card>
                  <div className="p-8 text-center">
                    <p className="text-slate-500 mb-2">No campaigns yet</p>
                    <p className="text-sm text-slate-400">
                      Click &quot;Run Engine&quot; to calculate site profitability profiles and generate campaign candidates.
                      The engine will analyze your keyword opportunities and create campaigns on Meta and Google Ads.
                    </p>
                  </div>
                </Card>
              )}

              {/* Booking Attribution */}
              {data.attribution.length > 0 && (
                <Card>
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">
                      Paid Booking Attribution
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="text-left px-4 py-2 font-medium text-slate-600">Source</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">Bookings</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">Revenue</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">Commission</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.attribution.map((a) => (
                            <tr key={a.source} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="px-4 py-2 font-medium text-slate-900">{a.source}</td>
                              <td className="px-4 py-2 text-right font-mono">{a.bookings}</td>
                              <td className="px-4 py-2 text-right font-mono">
                                &pound;{a.revenue.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                &pound;{a.commission.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              )}

              {/* Empty state for live tab */}
              {data.campaigns.length === 0 && data.attribution.length === 0 && (
                <Card>
                  <div className="p-6">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4">How the Bidding Engine Works</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm">
                      <div>
                        <div className="font-medium text-slate-900 mb-1">1. Profitability Analysis</div>
                        <p className="text-slate-500">
                          Calculates per-site AOV, commission rate, and conversion rate from booking data.
                          Determines max profitable CPC: AOV &times; CVR &times; commission / target ROAS.
                        </p>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 mb-1">2. AI Quality Evaluation</div>
                        <p className="text-slate-500">
                          Claude Haiku evaluates each keyword for relevance, commercial intent, competition
                          viability, and landing page fit. Keywords scoring below 30 are auto-archived.
                        </p>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 mb-1">3. Opportunity Scoring</div>
                        <p className="text-slate-500">
                          Scans PAID_CANDIDATE keywords, matches to sites &amp; microsites, and scores by
                          expected profit (volume &times; CTR &times; profit per click).
                        </p>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 mb-1">4. Campaign Management</div>
                        <p className="text-slate-500">
                          Creates campaigns on Meta and Google Ads with UTM tracking.
                          Daily sync pulls performance data, optimizer scales winners and pauses losers.
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
