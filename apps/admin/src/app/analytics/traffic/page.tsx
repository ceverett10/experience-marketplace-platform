'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';
import { DateRangePicker } from '../components/DateRangePicker';
import { MetricCard } from '../components/MetricCard';

interface TrafficData {
  sources: Array<{
    source: string;
    medium: string;
    users: number;
    sessions: number;
    bounceRate: number;
    sites: number;
  }>;
  byMedium: Array<{
    medium: string;
    users: number;
    sessions: number;
    percentage: number;
  }>;
  organic: {
    totalUsers: number;
    totalSessions: number;
    percentageOfTotal: number;
    topLandingPages: Array<{ page: string; sessions: number; siteName: string }>;
  };
  totals: {
    users: number;
    sessions: number;
    pageviews: number;
    avgSessionDuration: number;
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

const MEDIUM_COLORS: Record<string, string> = {
  organic: 'bg-green-500',
  cpc: 'bg-blue-500',
  referral: 'bg-purple-500',
  email: 'bg-amber-500',
  social: 'bg-pink-500',
  direct: 'bg-slate-500',
  '(none)': 'bg-slate-400',
};

export default function TrafficPage() {
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState(getDefaultDates);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const params = new URLSearchParams({
        startDate: dates.startDate,
        endDate: dates.endDate,
      });
      const response = await fetch(`${basePath}/api/analytics/traffic?${params}`);
      if (!response.ok) throw new Error('Failed to fetch traffic data');
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load traffic data');
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <div className="p-4">
              <div className="h-6 w-32 bg-slate-200 rounded animate-pulse mb-4" />
              <div className="h-48 bg-slate-100 rounded animate-pulse" />
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="h-6 w-32 bg-slate-200 rounded animate-pulse mb-4" />
              <div className="h-48 bg-slate-100 rounded animate-pulse" />
            </div>
          </Card>
        </div>
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

  const { sources, byMedium, organic, totals } = data;

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
            <span>Traffic</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Traffic Sources</h1>
          <p className="text-slate-500 mt-1">Where your visitors are coming from</p>
        </div>
        <DateRangePicker
          startDate={dates.startDate}
          endDate={dates.endDate}
          onChange={handleDateChange}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard title="Total Users" value={totals.users} />
        <MetricCard title="Total Sessions" value={totals.sessions} />
        <MetricCard title="Pageviews" value={totals.pageviews} />
        <MetricCard
          title="Organic Traffic"
          value={organic.percentageOfTotal}
          format="percent"
          subtitle={`${organic.totalUsers.toLocaleString()} users`}
        />
      </div>

      {/* Traffic by Medium */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Medium Breakdown */}
        <Card>
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Traffic by Medium</h2>
          </div>
          <CardContent className="p-4">
            {byMedium.length > 0 ? (
              <div className="space-y-4">
                {byMedium.map((medium) => (
                  <div key={medium.medium}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700 capitalize">
                        {medium.medium === '(none)' ? 'Direct / None' : medium.medium}
                      </span>
                      <span className="text-slate-500">{medium.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${MEDIUM_COLORS[medium.medium] || 'bg-slate-400'}`}
                        style={{ width: `${medium.percentage}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                      <span>{medium.users.toLocaleString()} users</span>
                      <span>{medium.sessions.toLocaleString()} sessions</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-500 py-8">
                No traffic data available for the selected period
              </p>
            )}
          </CardContent>
        </Card>

        {/* Organic Traffic Details */}
        <Card>
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Organic Search Traffic</h2>
          </div>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs text-green-600 font-medium">Organic Users</p>
                  <p className="text-xl font-bold text-green-700">
                    {organic.totalUsers.toLocaleString()}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs text-green-600 font-medium">Organic Sessions</p>
                  <p className="text-xl font-bold text-green-700">
                    {organic.totalSessions.toLocaleString()}
                  </p>
                </div>
              </div>

              {organic.topLandingPages.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Top Landing Pages</p>
                  <div className="space-y-2">
                    {organic.topLandingPages.slice(0, 5).map((page, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="truncate flex-1 mr-2">
                          <span className="text-slate-700">{page.page}</span>
                          <span className="text-xs text-slate-400 ml-2">({page.siteName})</span>
                        </div>
                        <span className="text-slate-500 text-xs">
                          {page.sessions.toLocaleString()} sessions
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Source/Medium Table */}
      <Card>
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">All Traffic Sources</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Source / Medium
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Users
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Sessions
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Bounce Rate
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Sites
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sources.slice(0, 20).map((source, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-slate-900">{source.source}</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="text-sm text-slate-600">{source.medium}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {source.users.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {source.sessions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {source.bounceRate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-500">{source.sites}</td>
                </tr>
              ))}
              {sources.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No traffic source data available for the selected period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
