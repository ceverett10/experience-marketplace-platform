'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';
import { DateRangePicker } from '../../components/DateRangePicker';
import { MetricCard } from '../../components/MetricCard';
import { AnalyticsStatus } from '../../components/AnalyticsStatus';

interface SiteAnalyticsData {
  site: {
    id: string;
    name: string;
    domain: string;
    configured: { ga4: boolean; gsc: boolean };
    gscLastSyncedAt: string | null;
  };
  traffic: {
    users: number;
    newUsers: number;
    sessions: number;
    pageviews: number;
    bounceRate: number;
    avgSessionDuration: number;
    engagementRate: number;
    bookings: number;
    revenue: number;
  } | null;
  sources: Array<{
    source: string;
    medium: string;
    users: number;
    sessions: number;
  }> | null;
  devices: Array<{
    device: string;
    users: number;
    sessions: number;
  }> | null;
  search: {
    totals: { clicks: number; impressions: number; ctr: number; position: number };
    topQueries: Array<{
      query: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
    topPages: Array<{
      page: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
  } | null;
  comparison: {
    current: { users: number; sessions: number; clicks: number };
    previous: { users: number; sessions: number; clicks: number };
    changes: {
      usersChange: number;
      sessionsChange: number;
      clicksChange: number;
      impressionsChange: number;
    };
  } | null;
  blockers: Array<{
    page: string;
    bounceRate: number;
    exits: number;
    avgTimeOnPage: number;
    issue: string;
  }>;
  dailyData: Array<{
    date: string;
    users: number;
    sessions: number;
    pageviews: number;
  }>;
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

function _formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export default function SiteAnalyticsPage() {
  const params = useParams();
  const siteId = params?.['id'] as string;

  const [data, setData] = useState<SiteAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState(getDefaultDates);
  const [searchTab, setSearchTab] = useState<'queries' | 'pages'>('queries');

  const fetchData = useCallback(async () => {
    if (!siteId) return;
    try {
      setLoading(true);
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const params = new URLSearchParams({
        startDate: dates.startDate,
        endDate: dates.endDate,
        compare: 'true',
      });
      const response = await fetch(`${basePath}/api/analytics/sites/${siteId}?${params}`);
      if (!response.ok) {
        if (response.status === 404) throw new Error('Site not found');
        throw new Error('Failed to fetch site analytics');
      }
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load site analytics');
    } finally {
      setLoading(false);
    }
  }, [siteId, dates]);

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="h-64 animate-pulse bg-slate-100" />
          <Card className="h-64 animate-pulse bg-slate-100" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
          >
            Retry
          </button>
          <Link
            href="/analytics"
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
          >
            Back to Overview
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { site, traffic, sources, devices, search, comparison, dailyData } = data;

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
            <Link href="/analytics" className="hover:text-sky-600">
              Sites
            </Link>
            <span>/</span>
            <span>{site.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{site.name}</h1>
            <AnalyticsStatus ga4={site.configured.ga4} gsc={site.configured.gsc} />
          </div>
          <p className="text-slate-500 mt-1">{site.domain}</p>
        </div>
        <DateRangePicker
          startDate={dates.startDate}
          endDate={dates.endDate}
          onChange={handleDateChange}
        />
      </div>

      {/* Configuration Warnings */}
      {(!site.configured.ga4 || !site.configured.gsc) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-700">
            {!site.configured.ga4 &&
              !site.configured.gsc &&
              'GA4 and GSC are not configured for this site.'}
            {!site.configured.ga4 && site.configured.gsc && 'GA4 is not configured for this site.'}
            {site.configured.ga4 &&
              !site.configured.gsc &&
              'GSC is not configured for this site.'}{' '}
            <Link
              href={`/sites/${site.id}`}
              className="text-amber-800 underline hover:no-underline"
            >
              Configure now
            </Link>
          </p>
        </div>
      )}

      {/* GA4 Traffic Metrics */}
      {traffic ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              title="Users"
              value={traffic.users}
              change={comparison?.changes.usersChange}
            />
            <MetricCard
              title="Sessions"
              value={traffic.sessions}
              change={comparison?.changes.sessionsChange}
            />
            <MetricCard title="Pageviews" value={traffic.pageviews} />
            <MetricCard title="Bounce Rate" value={traffic.bounceRate * 100} format="percent" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard title="New Users" value={traffic.newUsers} />
            <MetricCard title="Avg Session" value={traffic.avgSessionDuration} format="duration" />
            <MetricCard title="Bookings" value={traffic.bookings} />
            <MetricCard title="Revenue" value={traffic.revenue} format="currency" />
          </div>

          {/* Traffic Sources & Devices */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Traffic Sources */}
            <Card>
              <div className="p-4 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900">Traffic Sources</h2>
              </div>
              <CardContent className="p-4">
                {sources && sources.length > 0 ? (
                  <div className="space-y-3">
                    {sources.slice(0, 8).map((source, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-slate-700">
                            {source.source}
                          </span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-sm text-slate-500">{source.medium}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm text-slate-700">
                            {source.sessions.toLocaleString()} sessions
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-500 py-4">
                    No traffic source data available
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Device Breakdown */}
            <Card>
              <div className="p-4 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900">Device Breakdown</h2>
              </div>
              <CardContent className="p-4">
                {devices && devices.length > 0 ? (
                  <div className="space-y-4">
                    {devices.map((device, i) => {
                      const totalSessions = devices.reduce((sum, d) => sum + d.sessions, 0);
                      const percentage =
                        totalSessions > 0 ? (device.sessions / totalSessions) * 100 : 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="font-medium text-slate-700 capitalize">
                              {device.device}
                            </span>
                            <span className="text-slate-500">{percentage.toFixed(1)}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-sky-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            {device.sessions.toLocaleString()} sessions
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-slate-500 py-4">No device data available</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Daily Trend */}
          {dailyData.length > 0 && (
            <Card>
              <div className="p-4 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900">Daily Traffic Trend</h2>
              </div>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-2">
                          Date
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-2">
                          Users
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-2">
                          Sessions
                        </th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-2">
                          Pageviews
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailyData.map((day, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 text-sm text-slate-700">{day.date}</td>
                          <td className="px-4 py-2 text-right text-sm text-slate-700">
                            {day.users.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right text-sm text-slate-700">
                            {day.sessions.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right text-sm text-slate-700">
                            {day.pageviews.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card className="bg-slate-50">
          <CardContent className="p-8 text-center">
            <p className="text-slate-500">GA4 is not configured for this site.</p>
            <Link
              href={`/sites/${site.id}`}
              className="inline-block mt-4 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
            >
              Configure GA4
            </Link>
          </CardContent>
        </Card>
      )}

      {/* GSC Search Performance */}
      {search ? (
        <Card>
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Search Performance (GSC)</h2>
            {site.gscLastSyncedAt && (
              <p className="text-xs text-slate-400 mt-1">
                Last synced: {new Date(site.gscLastSyncedAt).toLocaleString()}
              </p>
            )}
          </div>

          {/* GSC Summary */}
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-slate-100">
            <div>
              <p className="text-xs text-slate-500">Clicks</p>
              <p className="text-xl font-bold text-slate-900">
                {search.totals.clicks.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Impressions</p>
              <p className="text-xl font-bold text-slate-900">
                {search.totals.impressions.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">CTR</p>
              <p className="text-xl font-bold text-slate-900">{search.totals.ctr.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Avg Position</p>
              <p className="text-xl font-bold text-slate-900">
                {search.totals.position.toFixed(1)}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSearchTab('queries')}
                className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                  searchTab === 'queries'
                    ? 'text-sky-600 border-sky-600'
                    : 'text-slate-500 border-transparent hover:text-slate-700'
                }`}
              >
                Top Queries
              </button>
              <button
                onClick={() => setSearchTab('pages')}
                className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                  searchTab === 'pages'
                    ? 'text-sky-600 border-sky-600'
                    : 'text-slate-500 border-transparent hover:text-slate-700'
                }`}
              >
                Top Pages
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {searchTab === 'queries' ? (
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                      Query
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
                  {search.topQueries.slice(0, 15).map((query, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-900">{query.query}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">
                        {query.clicks.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">
                        {query.impressions.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">
                        {query.ctr.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">
                        {query.position.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  {search.topQueries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No query data available
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
                  {search.topPages.slice(0, 15).map((page, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span
                          className="text-sm text-slate-900 block truncate max-w-md"
                          title={page.page}
                        >
                          {page.page}
                        </span>
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
                      <td className="px-4 py-3 text-right text-sm text-slate-700">
                        {page.position.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  {search.topPages.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No page data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      ) : site.configured.gsc === false ? (
        <Card className="bg-slate-50">
          <CardContent className="p-8 text-center">
            <p className="text-slate-500">GSC is not configured for this site.</p>
            <Link
              href={`/sites/${site.id}`}
              className="inline-block mt-4 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
            >
              Configure GSC
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {/* Loading indicator for refresh */}
      {loading && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-slate-100 z-50">
          <div className="h-full w-1/3 bg-sky-500 animate-pulse" />
        </div>
      )}
    </div>
  );
}
