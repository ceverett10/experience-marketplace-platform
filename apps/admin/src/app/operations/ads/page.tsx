'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

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

interface Campaign {
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

interface Attribution {
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
  campaigns: Campaign[];
  attribution: Attribution[];
  landingPages: LandingPage[];
  alerts: Alert[];
  alertCount: number;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function AdPerformancePage() {
  const [data, setData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'attribution'>('overview');
  const [days, setDays] = useState(30);
  const [platformFilter, setPlatformFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState<string>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ days: days.toString() });
      if (platformFilter) params.set('platform', platformFilter);

      const res = await fetch(`${basePath}/api/analytics/ads?${params}`);
      if (!res.ok) throw new Error('Failed to fetch data');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [days, platformFilter, basePath]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (action: string, params: Record<string, unknown> = {}) => {
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
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const syncPixelIds = async () => {
    setActionLoading('sync_pixels');
    try {
      const res = await fetch(`${basePath}/api/sites/ad-platform-ids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to sync pixel IDs');
      const result = await res.json();
      alert(`Synced: ${result.sitesUpdated} sites, ${result.micrositesUpdated} microsites`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────

  const fmt = (n: number | null | undefined, type: 'currency' | 'number' | 'percent' | 'roas' = 'number') => {
    if (n == null) return '—';
    switch (type) {
      case 'currency': return `£${n.toFixed(2)}`;
      case 'percent': return `${n.toFixed(1)}%`;
      case 'roas': return `${n.toFixed(2)}x`;
      case 'number': return n.toLocaleString();
    }
  };

  const trend = (current: number | null, prior: number | null) => {
    if (current == null || prior == null || prior === 0) return null;
    return ((current - prior) / prior) * 100;
  };

  const roasColor = (roas: number | null) => {
    if (roas == null) return 'text-slate-400';
    if (roas >= 3) return 'text-emerald-600';
    if (roas >= 1) return 'text-amber-600';
    return 'text-red-600';
  };

  const platformBadge = (platform: string) => {
    if (platform === 'GOOGLE_SEARCH') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Google</span>;
    if (platform === 'FACEBOOK') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Meta</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{platform}</span>;
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-emerald-100 text-emerald-700',
      PAUSED: 'bg-amber-100 text-amber-700',
      DRAFT: 'bg-slate-100 text-slate-600',
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
  };

  const severityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      CRITICAL: 'bg-red-100 text-red-700',
      WARNING: 'bg-amber-100 text-amber-700',
      INFO: 'bg-blue-100 text-blue-700',
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[severity] || 'bg-slate-100'}`}>{severity}</span>;
  };

  // ─── Sorted campaigns ─────────────────────────────────────────────────

  const filteredCampaigns = (data?.campaigns || []).filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });

  const sortedCampaigns = [...filteredCampaigns].sort((a, b) => {
    const aVal = (a as any)[sortField] ?? 0;
    const bVal = (b as any)[sortField] ?? 0;
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };

  // ─── Loading / Error ──────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Ad Performance</h1>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-20 mb-3" />
              <div className="h-8 bg-slate-200 rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Ad Performance</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // ─── KPI Card Component ───────────────────────────────────────────────

  const KPICard = ({ label, value, prior, format }: { label: string; value: number | null; prior?: number | null; format: 'currency' | 'number' | 'percent' | 'roas' }) => {
    const trendVal = trend(value, prior ?? null);
    const isRoas = format === 'roas';
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm text-slate-500 mb-1">{label}</p>
        <p className={`text-2xl font-bold ${isRoas ? roasColor(value) : 'text-slate-900'}`}>
          {fmt(value, format)}
        </p>
        {trendVal != null && (
          <p className={`text-xs mt-1 ${trendVal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trendVal >= 0 ? '↑' : '↓'} {Math.abs(trendVal).toFixed(1)}% vs prior
          </p>
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────

  const criticalAlerts = data.alerts.filter((a) => a.severity === 'CRITICAL' && !a.acknowledged);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ad Performance</h1>
          <p className="text-sm text-slate-500 mt-1">Campaign performance across Google & Meta</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date range picker */}
          <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-2 text-sm font-medium ${days === d ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {d}d
              </button>
            ))}
          </div>
          {/* Sync buttons */}
          <button
            onClick={syncPixelIds}
            disabled={actionLoading === 'sync_pixels'}
            className="px-4 py-2 bg-slate-600 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50"
          >
            {actionLoading === 'sync_pixels' ? 'Syncing...' : 'Sync Pixel IDs'}
          </button>
          <button
            onClick={() => handleAction('sync_now')}
            disabled={actionLoading === 'sync_now'}
            className="px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 disabled:opacity-50"
          >
            {actionLoading === 'sync_now' ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Critical alert banner */}
      {criticalAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-800">
                {criticalAlerts.length} critical alert{criticalAlerts.length > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-red-700 mt-1">{criticalAlerts[0]?.message}</p>
            </div>
            <button
              onClick={() => handleAction('acknowledge_all_alerts')}
              className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700"
            >
              Dismiss All
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-6">
          {(['overview', 'campaigns', 'attribution'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'campaigns' && data.alertCount > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{data.alertCount}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ═══ Overview Tab ═══ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Total Spend" value={data.kpis.spend} prior={data.kpisPrior.spend} format="currency" />
            <KPICard label="Revenue" value={data.kpis.revenue} prior={data.kpisPrior.revenue} format="currency" />
            <KPICard label="ROAS" value={data.kpis.roas} prior={data.kpisPrior.roas} format="roas" />
            <KPICard label="Conversions" value={data.kpis.conversions} prior={data.kpisPrior.conversions} format="number" />
            <KPICard label="Avg CPC" value={data.kpis.cpc} prior={data.kpisPrior.cpc} format="currency" />
            <KPICard label="CPA" value={data.kpis.cpa} prior={data.kpisPrior.cpa} format="currency" />
            <KPICard label="CTR" value={data.kpis.ctr} prior={data.kpisPrior.ctr} format="percent" />
            <KPICard label="Budget Utilization" value={data.kpis.budgetUtilization ?? null} format="percent" />
          </div>

          {/* Daily Trend Chart (simple bar representation) */}
          {data.dailyTrend.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-sm font-medium text-slate-700 mb-4">Daily Spend & Revenue</h3>
              <div className="flex items-end gap-1 h-40">
                {data.dailyTrend.map((day) => {
                  const maxSpend = Math.max(...data.dailyTrend.map((d) => d.spend), 1);
                  const maxRevenue = Math.max(...data.dailyTrend.map((d) => d.revenue), 1);
                  const maxVal = Math.max(maxSpend, maxRevenue);
                  const spendHeight = (day.spend / maxVal) * 100;
                  const revenueHeight = (day.revenue / maxVal) * 100;

                  return (
                    <div key={day.date} className="flex-1 flex items-end gap-0.5 group relative" title={`${day.date}: Spend £${day.spend.toFixed(2)}, Revenue £${day.revenue.toFixed(2)}`}>
                      <div className="flex-1 bg-red-300 rounded-t" style={{ height: `${spendHeight}%`, minHeight: day.spend > 0 ? '2px' : '0' }} />
                      <div className="flex-1 bg-emerald-400 rounded-t" style={{ height: `${revenueHeight}%`, minHeight: day.revenue > 0 ? '2px' : '0' }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-red-300 rounded" /> Spend</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-400 rounded" /> Revenue</div>
              </div>
            </div>
          )}

          {/* Platform Comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Google */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">Google Search</span>
                <span className="text-xs text-slate-400">{data.platformComparison.google.campaigns} campaigns</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Spend</span><p className="font-semibold">{fmt(data.platformComparison.google.spend, 'currency')}</p></div>
                <div><span className="text-slate-500">Revenue</span><p className="font-semibold">{fmt(data.platformComparison.google.revenue, 'currency')}</p></div>
                <div><span className="text-slate-500">ROAS</span><p className={`font-semibold ${roasColor(data.platformComparison.google.roas)}`}>{fmt(data.platformComparison.google.roas, 'roas')}</p></div>
                <div><span className="text-slate-500">CPC</span><p className="font-semibold">{fmt(data.platformComparison.google.cpc, 'currency')}</p></div>
                <div><span className="text-slate-500">Clicks</span><p className="font-semibold">{fmt(data.platformComparison.google.clicks)}</p></div>
                <div><span className="text-slate-500">Conversions</span><p className="font-semibold">{fmt(data.platformComparison.google.conversions)}</p></div>
              </div>
            </div>
            {/* Meta */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">Meta / Facebook</span>
                <span className="text-xs text-slate-400">{data.platformComparison.meta.campaigns} campaigns</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Spend</span><p className="font-semibold">{fmt(data.platformComparison.meta.spend, 'currency')}</p></div>
                <div><span className="text-slate-500">Revenue</span><p className="font-semibold">{fmt(data.platformComparison.meta.revenue, 'currency')}</p></div>
                <div><span className="text-slate-500">ROAS</span><p className={`font-semibold ${roasColor(data.platformComparison.meta.roas)}`}>{fmt(data.platformComparison.meta.roas, 'roas')}</p></div>
                <div><span className="text-slate-500">CPC</span><p className="font-semibold">{fmt(data.platformComparison.meta.cpc, 'currency')}</p></div>
                <div><span className="text-slate-500">Clicks</span><p className="font-semibold">{fmt(data.platformComparison.meta.clicks)}</p></div>
                <div><span className="text-slate-500">Conversions</span><p className="font-semibold">{fmt(data.platformComparison.meta.conversions)}</p></div>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {data.alerts.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-sm font-medium text-slate-700 mb-4">Recent Alerts</h3>
              <div className="space-y-2">
                {data.alerts.slice(0, 10).map((alert) => (
                  <div key={alert.id} className={`flex items-center justify-between p-3 rounded-lg ${alert.acknowledged ? 'bg-slate-50' : 'bg-amber-50'}`}>
                    <div className="flex items-center gap-3">
                      {severityBadge(alert.severity)}
                      <span className={`text-sm ${alert.acknowledged ? 'text-slate-500' : 'text-slate-700'}`}>{alert.message}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">{new Date(alert.createdAt).toLocaleDateString()}</span>
                      {!alert.acknowledged && (
                        <button
                          onClick={() => handleAction('acknowledge_alert', { alertId: alert.id })}
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
        </div>
      )}

      {/* ═══ Campaigns Tab ═══ */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Platforms</option>
              <option value="GOOGLE_SEARCH">Google Search</option>
              <option value="FACEBOOK">Meta / Facebook</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="DRAFT">Draft</option>
            </select>
            <span className="text-sm text-slate-500">{filteredCampaigns.length} campaigns</span>
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
                      { key: 'spend', label: 'Spend' },
                      { key: 'revenue', label: 'Revenue' },
                      { key: 'roas', label: 'ROAS' },
                      { key: 'clicks', label: 'Clicks' },
                      { key: 'ctr', label: 'CTR' },
                      { key: 'cpc', label: 'CPC' },
                      { key: 'cpa', label: 'CPA' },
                      { key: 'conversions', label: 'Conv.' },
                      { key: 'dailyBudget', label: 'Budget/day' },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer hover:text-slate-700"
                      >
                        {col.label}
                        {sortField === col.key && <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 truncate max-w-[200px]" title={c.name}>{c.name}</div>
                        <div className="text-xs text-slate-400">{c.siteName}</div>
                      </td>
                      <td className="px-4 py-3">{platformBadge(c.platform)}</td>
                      <td className="px-4 py-3">{statusBadge(c.status)}</td>
                      <td className="px-4 py-3 font-medium">{fmt(c.spend, 'currency')}</td>
                      <td className="px-4 py-3 font-medium">{fmt(c.revenue, 'currency')}</td>
                      <td className={`px-4 py-3 font-bold ${roasColor(c.roas)}`}>{fmt(c.roas, 'roas')}</td>
                      <td className="px-4 py-3">{fmt(c.clicks)}</td>
                      <td className="px-4 py-3">{fmt(c.ctr, 'percent')}</td>
                      <td className="px-4 py-3">{fmt(c.cpc, 'currency')}</td>
                      <td className="px-4 py-3">{fmt(c.cpa, 'currency')}</td>
                      <td className="px-4 py-3">{fmt(c.conversions)}</td>
                      <td className="px-4 py-3">{fmt(c.dailyBudget, 'currency')}</td>
                      <td className="px-4 py-3">
                        {c.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleAction('pause_campaign', { campaignId: c.id })}
                            disabled={actionLoading === `pause_${c.id}`}
                            className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                          >
                            Pause
                          </button>
                        )}
                        {c.status === 'PAUSED' && (
                          <button
                            onClick={() => handleAction('resume_campaign', { campaignId: c.id })}
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
            {sortedCampaigns.length === 0 && (
              <div className="p-8 text-center text-slate-500">No campaigns match the current filters</div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Attribution Tab ═══ */}
      {activeTab === 'attribution' && (
        <div className="space-y-6">
          {/* Campaign Attribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-medium text-slate-700 mb-4">Booking Attribution by Campaign</h3>
            {data.attribution.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 text-xs text-slate-500 uppercase">Campaign</th>
                    <th className="text-left py-2 text-xs text-slate-500 uppercase">Source</th>
                    <th className="text-right py-2 text-xs text-slate-500 uppercase">Bookings</th>
                    <th className="text-right py-2 text-xs text-slate-500 uppercase">Revenue</th>
                    <th className="text-right py-2 text-xs text-slate-500 uppercase">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attribution.map((a, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 font-medium truncate max-w-[250px]" title={a.campaign}>{a.campaign}</td>
                      <td className="py-2 text-slate-600">{a.source}</td>
                      <td className="py-2 text-right">{a.bookings}</td>
                      <td className="py-2 text-right font-medium">{fmt(a.revenue, 'currency')}</td>
                      <td className="py-2 text-right text-emerald-600 font-medium">{fmt(a.commission, 'currency')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500">No paid booking attribution data for this period</p>
            )}
          </div>

          {/* Landing Page Performance */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-medium text-slate-700 mb-4">Landing Page Performance (Paid Traffic)</h3>
            {data.landingPages.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 text-xs text-slate-500 uppercase">Landing Page</th>
                    <th className="text-right py-2 text-xs text-slate-500 uppercase">Conversions</th>
                    <th className="text-right py-2 text-xs text-slate-500 uppercase">Revenue</th>
                    <th className="text-right py-2 text-xs text-slate-500 uppercase">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {data.landingPages.map((lp, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 font-mono text-xs truncate max-w-[350px]" title={lp.path}>{lp.path}</td>
                      <td className="py-2 text-right">{lp.conversions}</td>
                      <td className="py-2 text-right font-medium">{fmt(lp.revenue, 'currency')}</td>
                      <td className="py-2 text-right text-emerald-600 font-medium">{fmt(lp.commission, 'currency')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500">No landing page conversion data for this period</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
