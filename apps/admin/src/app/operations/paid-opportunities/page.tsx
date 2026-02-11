'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface Opportunity {
  id: string;
  keyword: string;
  cpc: number;
  searchVolume: number;
  clusterVolume: number;
  difficulty: number;
  priorityScore: number;
  potentialValue: number | null;
  intent: string;
  niche: string;
  location: string | null;
  status: string;
  site: { id: string; name: string; primaryDomain: string | null } | null;
  estimatedMonthlyClicks: number;
  estimatedMonthlyCost: number;
  paidCandidate: boolean;
}

interface Summary {
  totalOpportunities: number;
  avgCpc: number;
  avgVolume: number;
  totalMonthlyVolume: number;
  lowestCpc: number;
  highestVolume: number;
  avgScore: number;
  bySite: Array<{ siteId: string; name: string; count: number; totalVolume: number }>;
}

interface ApiResponse {
  opportunities: Opportunity[];
  summary: Summary;
  filters: { maxCpc: number; minVolume: number; siteId?: string; limit: number; sortBy: string };
}

export default function PaidOpportunitiesPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [maxCpc, setMaxCpc] = useState('3.00');
  const [minVolume, setMinVolume] = useState('100');
  const [sortBy, setSortBy] = useState('volume');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const params = new URLSearchParams({
        maxCpc,
        minVolume,
        sortBy,
        limit: '200',
      });
      const response = await fetch(`${basePath}/api/operations/paid-opportunities?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [maxCpc, minVolume, sortBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const intentColors: Record<string, string> = {
    TRANSACTIONAL: 'bg-green-100 text-green-800',
    COMMERCIAL: 'bg-blue-100 text-blue-800',
    NAVIGATIONAL: 'bg-purple-100 text-purple-800',
    INFORMATIONAL: 'bg-slate-100 text-slate-800',
  };

  const exportCsv = () => {
    if (!data) return;
    const headers = [
      'Keyword',
      'CPC',
      'Monthly Volume',
      'Cluster Volume',
      'Difficulty',
      'Score',
      'Intent',
      'Niche',
      'Location',
      'Site',
      'Est. Monthly Clicks',
      'Est. Monthly Cost',
    ];
    const rows = data.opportunities.map((o) => [
      o.keyword,
      o.cpc.toFixed(2),
      o.searchVolume,
      o.clusterVolume,
      o.difficulty,
      o.priorityScore,
      o.intent,
      o.niche,
      o.location || '',
      o.site?.name || '',
      o.estimatedMonthlyClicks,
      o.estimatedMonthlyCost.toFixed(2),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paid-opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paid Traffic Opportunities</h1>
          <p className="text-slate-500 mt-1">
            Keywords with low CPC that can be targeted with paid ads
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!data || data.opportunities.length === 0}
          className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Max CPC ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="15.00"
                value={maxCpc}
                onChange={(e) => setMaxCpc(e.target.value)}
                className="w-24 px-3 py-1.5 border border-slate-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Min Volume/mo
              </label>
              <input
                type="number"
                step="50"
                min="0"
                value={minVolume}
                onChange={(e) => setMinVolume(e.target.value)}
                className="w-28 px-3 py-1.5 border border-slate-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-sm"
              >
                <option value="volume">Search Volume</option>
                <option value="cpc">CPC (Lowest)</option>
                <option value="score">Priority Score</option>
              </select>
            </div>
            <button
              onClick={fetchData}
              className="px-4 py-1.5 bg-slate-900 text-white rounded-md text-sm hover:bg-slate-800"
            >
              Apply
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-sky-600">
                {data.summary.totalOpportunities}
              </p>
              <p className="text-xs text-slate-500">Total Keywords</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-emerald-600">
                ${data.summary.avgCpc.toFixed(3)}
              </p>
              <p className="text-xs text-slate-500">Avg CPC</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-purple-600">
                ${data.summary.lowestCpc.toFixed(3)}
              </p>
              <p className="text-xs text-slate-500">Lowest CPC</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-blue-600">
                {data.summary.avgVolume.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">Avg Volume</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-amber-600">
                {data.summary.totalMonthlyVolume.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">Total Volume</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-rose-600">
                {data.summary.highestVolume.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">Highest Volume</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-slate-700">{data.summary.avgScore}</p>
              <p className="text-xs text-slate-500">Avg Score</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Site Breakdown */}
      {data && data.summary.bySite.length > 0 && (
        <Card>
          <div className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">By Site</h3>
            <div className="flex flex-wrap gap-2">
              {data.summary.bySite
                .sort((a, b) => b.totalVolume - a.totalVolume)
                .map((s) => (
                  <span
                    key={s.siteId}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full text-sm"
                  >
                    <span className="font-medium text-slate-900">{s.name}</span>
                    <span className="text-slate-500">
                      {s.count} kws, {s.totalVolume.toLocaleString()}/mo
                    </span>
                  </span>
                ))}
            </div>
          </div>
        </Card>
      )}

      {/* Opportunities Table */}
      {loading && !data ? (
        <Card>
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-sky-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-slate-500">Loading opportunities...</p>
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
      ) : data && data.opportunities.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <p className="text-slate-500">
              No opportunities found with CPC &lt; ${maxCpc} and volume &ge; {minVolume}/mo
            </p>
            <p className="text-sm text-slate-400 mt-2">
              Try increasing the max CPC or lowering the minimum volume
            </p>
          </div>
        </Card>
      ) : data ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Keyword</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">CPC</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Volume</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Difficulty</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Score</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Intent</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Site</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Est. Clicks</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.opportunities.map((opp) => (
                  <tr
                    key={opp.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{opp.keyword}</div>
                      {opp.location && (
                        <div className="text-xs text-slate-500">{opp.location}</div>
                      )}
                      {opp.niche && (
                        <div className="text-xs text-slate-400">{opp.niche}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-emerald-700">${opp.cpc.toFixed(3)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono">{opp.searchVolume.toLocaleString()}</span>
                      {opp.clusterVolume > opp.searchVolume && (
                        <div className="text-xs text-slate-400">
                          cluster: {opp.clusterVolume.toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-mono ${
                          opp.difficulty > 70
                            ? 'text-red-600'
                            : opp.difficulty > 40
                              ? 'text-amber-600'
                              : 'text-green-600'
                        }`}
                      >
                        {opp.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono">{opp.priorityScore}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          intentColors[opp.intent] || 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {opp.intent}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-700 text-xs">{opp.site?.name || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-slate-600">
                        {opp.estimatedMonthlyClicks.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-slate-600">
                        ${opp.estimatedMonthlyCost.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.opportunities.length < data.summary.totalOpportunities && (
            <div className="px-4 py-3 bg-slate-50 text-sm text-slate-500 text-center border-t">
              Showing {data.opportunities.length} of {data.summary.totalOpportunities} opportunities
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
