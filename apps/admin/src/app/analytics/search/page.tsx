'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';
import { DateRangePicker } from '../components/DateRangePicker';
import { MetricCard } from '../components/MetricCard';

interface SearchData {
  totals: {
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number;
  };
  bySite: Array<{
    siteId: string;
    siteName: string;
    domain: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    siteId: string;
    siteName: string;
  }>;
  topPages: Array<{
    pageUrl: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    siteId: string;
    siteName: string;
  }>;
  positionDistribution: {
    top3: number;
    top10: number;
    top20: number;
    beyond20: number;
  };
  dateRange: { startDate: string; endDate: string };
}

function getDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return {
    startDate: start.toISOString().split('T')[0]!,
    endDate: end.toISOString().split('T')[0]!,
  };
}

function PositionBadge({ position }: { position: number }) {
  let colorClass = 'bg-red-100 text-red-700';
  if (position <= 3) colorClass = 'bg-green-100 text-green-700';
  else if (position <= 10) colorClass = 'bg-yellow-100 text-yellow-700';
  else if (position <= 20) colorClass = 'bg-orange-100 text-orange-700';

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {position.toFixed(1)}
    </span>
  );
}

export default function SearchPage() {
  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState(getDefaultDates);
  const [activeTab, setActiveTab] = useState<'queries' | 'pages'>('queries');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const params = new URLSearchParams({
        startDate: dates.startDate,
        endDate: dates.endDate,
      });
      const response = await fetch(`${basePath}/api/analytics/search?${params}`);
      if (!response.ok) throw new Error('Failed to fetch search data');
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load search data');
    } finally {
      setLoading(false);
    }
  }, [dates]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDateChange = (startDate: string, endDate: string) => {
    setDates({ startDate, endDate });
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-slate-100 rounded animate-pulse mt-2" />
          </div>
          <div className="h-10 w-80 bg-slate-200 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-4 w-20 bg-slate-200 rounded animate-pulse mb-2" />
                <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { totals, bySite, topQueries, topPages, positionDistribution } = data;
  const totalPositionImpressions =
    positionDistribution.top3 +
    positionDistribution.top10 +
    positionDistribution.top20 +
    positionDistribution.beyond20;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/analytics" className="hover:text-sky-600">
              Analytics
            </Link>
            <span>/</span>
            <span>Search</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Search Performance</h1>
          <p className="text-slate-500 mt-1">
            Google Search Console data across all sites
          </p>
        </div>
        <DateRangePicker
          startDate={dates.startDate}
          endDate={dates.endDate}
          onChange={handleDateChange}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          title="Total Clicks"
          value={totals.clicks}
        />
        <MetricCard
          title="Total Impressions"
          value={totals.impressions}
        />
        <MetricCard
          title="Avg CTR"
          value={totals.ctr}
          format="percent"
        />
        <MetricCard
          title="Avg Position"
          value={totals.avgPosition}
          format="position"
          subtitle="Lower is better"
        />
      </div>

      {/* Position Distribution */}
      <Card>
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Position Distribution</h2>
          <p className="text-sm text-slate-500 mt-1">
            Based on impression-weighted average positions
          </p>
        </div>
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {totalPositionImpressions > 0
                  ? ((positionDistribution.top3 / totalPositionImpressions) * 100).toFixed(1)
                  : '0'}%
              </div>
              <p className="text-sm text-slate-500 mt-1">Top 3</p>
              <p className="text-xs text-slate-400">
                {positionDistribution.top3.toLocaleString()} impressions
              </p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {totalPositionImpressions > 0
                  ? ((positionDistribution.top10 / totalPositionImpressions) * 100).toFixed(1)
                  : '0'}%
              </div>
              <p className="text-sm text-slate-500 mt-1">Position 4-10</p>
              <p className="text-xs text-slate-400">
                {positionDistribution.top10.toLocaleString()} impressions
              </p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {totalPositionImpressions > 0
                  ? ((positionDistribution.top20 / totalPositionImpressions) * 100).toFixed(1)
                  : '0'}%
              </div>
              <p className="text-sm text-slate-500 mt-1">Position 11-20</p>
              <p className="text-xs text-slate-400">
                {positionDistribution.top20.toLocaleString()} impressions
              </p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {totalPositionImpressions > 0
                  ? ((positionDistribution.beyond20 / totalPositionImpressions) * 100).toFixed(1)
                  : '0'}%
              </div>
              <p className="text-sm text-slate-500 mt-1">Beyond 20</p>
              <p className="text-xs text-slate-400">
                {positionDistribution.beyond20.toLocaleString()} impressions
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance by Site */}
      <Card>
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Performance by Site</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Site
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Clicks
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Impressions
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  CTR
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Position
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bySite.slice(0, 10).map((site) => (
                <tr key={site.siteId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/analytics/sites/${site.siteId}`}
                      className="text-sm font-medium text-slate-900 hover:text-sky-600"
                    >
                      {site.siteName}
                    </Link>
                    <p className="text-xs text-slate-500">{site.domain}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {site.clicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {site.impressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {site.ctr.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PositionBadge position={site.position} />
                  </td>
                </tr>
              ))}
              {bySite.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No GSC data available. Make sure sites have GSC configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top Queries / Pages Tabs */}
      <Card>
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('queries')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                activeTab === 'queries'
                  ? 'text-sky-600 border-sky-600'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              Top Queries
            </button>
            <button
              onClick={() => setActiveTab('pages')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                activeTab === 'pages'
                  ? 'text-sky-600 border-sky-600'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              Top Pages
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {activeTab === 'queries' ? (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Query
                  </th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Site
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Clicks
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Impressions
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    CTR
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Position
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topQueries.slice(0, 20).map((query, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-900">{query.query}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/analytics/sites/${query.siteId}`}
                        className="text-xs text-slate-500 hover:text-sky-600"
                      >
                        {query.siteName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {query.clicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {query.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {query.ctr.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PositionBadge position={query.position} />
                    </td>
                  </tr>
                ))}
                {topQueries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No query data available for the selected period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Page
                  </th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Site
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Clicks
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Impressions
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    CTR
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Position
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topPages.slice(0, 20).map((page, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span
                        className="text-sm text-slate-900 block truncate max-w-xs"
                        title={page.pageUrl}
                      >
                        {page.pageUrl}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/analytics/sites/${page.siteId}`}
                        className="text-xs text-slate-500 hover:text-sky-600"
                      >
                        {page.siteName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {page.clicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {page.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {page.ctr.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PositionBadge position={page.position} />
                    </td>
                  </tr>
                ))}
                {topPages.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No page data available for the selected period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Loading indicator for refresh */}
      {loading && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-slate-100 z-50">
          <div className="h-full w-1/3 bg-sky-500 animate-pulse" />
        </div>
      )}
    </div>
  );
}
