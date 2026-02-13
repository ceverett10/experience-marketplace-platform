'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
}

export default function BiddingDashboardPage() {
  const [data, setData] = useState<BiddingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [days, setDays] = useState('30');

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
        // Trigger via schedules endpoint
        const response = await fetch(`${basePath}/api/operations/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'trigger', jobType: 'BIDDING_ENGINE_RUN' }),
        });
        const result = await response.json();
        setActionMessage(result.success ? `Engine triggered (Job: ${result.jobId})` : result.error);
      } else {
        // Use bidding API for other actions
        const response = await fetch(`${basePath}/api/analytics/bidding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...extra }),
        });
        const result = await response.json();
        setActionMessage(result.message || result.error);
      }

      // Refresh data after 2s
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

  const platformColors: Record<string, string> = {
    META: 'bg-blue-100 text-blue-800',
    GOOGLE_SEARCH: 'bg-red-100 text-red-800',
    PINTEREST: 'bg-rose-100 text-rose-800',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bidding Engine Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Automated paid traffic acquisition — profitability-driven bidding
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

          {/* Site Profitability Profiles */}
          {data.profiles.length > 0 && (
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  Site Profitability Profiles ({data.profiles.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Site</th>
                        <th className="text-right px-4 py-2 font-medium text-slate-600">AOV</th>
                        <th className="text-right px-4 py-2 font-medium text-slate-600">Commission</th>
                        <th className="text-right px-4 py-2 font-medium text-slate-600">CVR</th>
                        <th className="text-right px-4 py-2 font-medium text-slate-600">Max CPC</th>
                        <th className="text-center px-4 py-2 font-medium text-slate-600">Auto Bid</th>
                        <th className="text-right px-4 py-2 font-medium text-slate-600">Last Calc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.profiles.map((p) => (
                        <tr key={p.siteId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <div className="font-medium text-slate-900">{p.siteName}</div>
                            {p.domain && (
                              <div className="text-xs text-slate-400">{p.domain}</div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            &pound;{p.avgOrderValue.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {(p.avgCommissionRate * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {(p.conversionRate * 100).toFixed(2)}%
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-mono font-semibold ${
                              p.maxProfitableCpc > 0.10 ? 'text-green-700' :
                              p.maxProfitableCpc > 0.05 ? 'text-amber-700' : 'text-red-700'
                            }`}>
                              &pound;{p.maxProfitableCpc.toFixed(4)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              p.isAutoBidding ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {p.isAutoBidding ? 'ON' : 'OFF'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-slate-500">
                            {p.lastCalculatedAt
                              ? new Date(p.lastCalculatedAt).toLocaleDateString()
                              : 'Never'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {/* Campaigns */}
          {data.campaigns.length > 0 ? (
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  Campaigns ({data.campaigns.length})
                </h3>
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
                      {data.campaigns.map((c) => (
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

          {/* Empty state with explanation */}
          {data.profiles.length === 0 && data.campaigns.length === 0 && (
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">How the Bidding Engine Works</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                  <div>
                    <div className="font-medium text-slate-900 mb-1">1. Profitability Analysis</div>
                    <p className="text-slate-500">
                      Calculates per-site AOV, commission rate, and conversion rate from booking data.
                      Determines max profitable CPC: AOV &times; CVR &times; commission / target ROAS.
                    </p>
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 mb-1">2. Opportunity Scoring</div>
                    <p className="text-slate-500">
                      Scans PAID_CANDIDATE keywords, matches to sites, and scores by expected profit
                      (search volume &times; CTR &times; profit per click).
                    </p>
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 mb-1">3. Campaign Management</div>
                    <p className="text-slate-500">
                      Creates campaigns on Meta and Google Ads with UTM tracking.
                      Daily sync pulls performance data, optimizer scales winners and pauses losers.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
