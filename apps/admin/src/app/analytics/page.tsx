'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';
import { DateRangePicker } from './components/DateRangePicker';
import { MetricCard } from './components/MetricCard';
import { AnalyticsStatus } from './components/AnalyticsStatus';

interface PortfolioData {
  portfolio: {
    totalSites: number;
    sitesWithGA4: number;
    sitesWithGSC: number;
    totalUsers: number;
    totalSessions: number;
    totalPageviews: number;
    totalClicks: number;
    totalImpressions: number;
    avgCTR: number;
    avgPosition: number;
    totalBookings: number;
    totalRevenue: number;
  };
  topSites: Array<{
    id: string;
    name: string;
    domain: string;
    users: number;
    sessions: number;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    configured: { ga4: boolean; gsc: boolean };
  }>;
  trends: {
    usersChange: number;
    sessionsChange: number;
    clicksChange: number;
    impressionsChange: number;
  };
  unconfiguredSites: Array<{
    id: string;
    name: string;
    missingGA4: boolean;
    missingGSC: boolean;
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

export default function AnalyticsOverviewPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
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
      const response = await fetch(`${basePath}/api/analytics/portfolio?${params}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
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
                <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
                <div className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
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

  const { portfolio, topSites, trends, unconfiguredSites } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics Overview</h1>
          <p className="text-slate-500 mt-1">Portfolio-wide traffic and search performance</p>
        </div>
        <DateRangePicker
          startDate={dates.startDate}
          endDate={dates.endDate}
          onChange={handleDateChange}
        />
      </div>

      {/* Configuration Status */}
      <div className="flex items-center gap-4 text-sm text-slate-600">
        <span>{portfolio.totalSites} total sites</span>
        <span className="text-slate-300">|</span>
        <span className="text-sky-600">{portfolio.sitesWithGA4} with GA4</span>
        <span className="text-slate-300">|</span>
        <span className="text-purple-600">{portfolio.sitesWithGSC} with GSC</span>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard title="Total Users" value={portfolio.totalUsers} change={trends.usersChange} />
        <MetricCard
          title="Total Sessions"
          value={portfolio.totalSessions}
          change={trends.sessionsChange}
        />
        <MetricCard
          title="Search Clicks"
          value={portfolio.totalClicks}
          change={trends.clicksChange}
        />
        <MetricCard
          title="Avg Position"
          value={portfolio.avgPosition}
          format="position"
          subtitle="Lower is better"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard title="Pageviews" value={portfolio.totalPageviews} />
        <MetricCard
          title="Impressions"
          value={portfolio.totalImpressions}
          change={trends.impressionsChange}
        />
        <MetricCard title="Avg CTR" value={portfolio.avgCTR} format="percent" />
        <MetricCard
          title="Revenue"
          value={portfolio.totalRevenue}
          format="currency"
          subtitle={`${portfolio.totalBookings} bookings`}
        />
      </div>

      {/* Top Sites Table */}
      <Card>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Top Sites by Traffic</h2>
          <Link href="/sites" className="text-sm text-sky-600 hover:text-sky-700">
            View all sites
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Site
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Users
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Sessions
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Clicks
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  CTR
                </th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topSites.slice(0, 10).map((site) => (
                <tr key={site.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/analytics/sites/${site.id}`}
                      className="text-sm font-medium text-slate-900 hover:text-sky-600"
                    >
                      {site.name}
                    </Link>
                    <p className="text-xs text-slate-500">{site.domain}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {site.users.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {site.sessions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {site.clicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {site.ctr.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    <AnalyticsStatus ga4={site.configured.ga4} gsc={site.configured.gsc} />
                  </td>
                </tr>
              ))}
              {topSites.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No analytics data available for the selected period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Unconfigured Sites Warning */}
      {unconfiguredSites.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="p-4">
            <h3 className="font-semibold text-amber-800 mb-3">
              Sites Missing Analytics ({unconfiguredSites.length})
            </h3>
            <div className="space-y-2">
              {unconfiguredSites.slice(0, 5).map((site) => (
                <div key={site.id} className="flex items-center justify-between text-sm">
                  <Link href={`/sites/${site.id}`} className="text-amber-900 hover:text-amber-700">
                    {site.name}
                  </Link>
                  <div className="flex items-center gap-2">
                    {site.missingGA4 && <span className="text-xs text-amber-700">Missing GA4</span>}
                    {site.missingGSC && <span className="text-xs text-amber-700">Missing GSC</span>}
                  </div>
                </div>
              ))}
              {unconfiguredSites.length > 5 && (
                <p className="text-xs text-amber-600 mt-2">
                  + {unconfiguredSites.length - 5} more sites
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/analytics/traffic">
          <Card className="hover:border-sky-300 transition-colors cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">Traffic</span>
                <div>
                  <p className="font-medium text-slate-900">Traffic Sources</p>
                  <p className="text-sm text-slate-500">View source/medium breakdown</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/analytics/search">
          <Card className="hover:border-sky-300 transition-colors cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">Search</span>
                <div>
                  <p className="font-medium text-slate-900">Search Performance</p>
                  <p className="text-sm text-slate-500">Top queries and pages</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/analytics/blockers">
          <Card className="hover:border-sky-300 transition-colors cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">Blockers</span>
                <div>
                  <p className="font-medium text-slate-900">Flow Blockers</p>
                  <p className="text-sm text-slate-500">High bounce & exit pages</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Loading indicator for refresh */}
      {loading && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-slate-100 z-50">
          <div className="h-full w-1/3 bg-sky-500 animate-pulse" />
        </div>
      )}
    </div>
  );
}
