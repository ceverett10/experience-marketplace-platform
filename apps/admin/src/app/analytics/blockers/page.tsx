'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';
import { DateRangePicker } from '../components/DateRangePicker';

interface BlockersData {
  highBounce: Array<{
    siteId: string;
    siteName: string;
    pagePath: string;
    pageTitle: string;
    bounceRate: number;
    entrances: number;
    avgTimeOnPage: number;
    severity: 'critical' | 'warning' | 'info';
  }>;
  highExit: Array<{
    siteId: string;
    siteName: string;
    pagePath: string;
    pageTitle: string;
    exitRate: number;
    exits: number;
    pageviews: number;
    severity: 'critical' | 'warning' | 'info';
  }>;
  lowEngagement: Array<{
    siteId: string;
    siteName: string;
    pagePath: string;
    avgTimeOnPage: number;
    pageviews: number;
  }>;
  lowCTR?: Array<{
    siteId: string;
    siteName: string;
    pagePath: string;
    pageTitle: string;
    ctr: number;
    impressions: number;
    position: number;
    severity: 'critical' | 'warning' | 'info';
  }>;
  summary: {
    totalBlockers: number;
    criticalCount: number;
    warningCount: number;
    topAffectedSites: string[];
  };
  dateRange: { startDate: string; endDate: string };
  note?: string;
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

function SeverityBadge({ severity }: { severity: 'critical' | 'warning' | 'info' }) {
  const colors = {
    critical: 'bg-red-100 text-red-700',
    warning: 'bg-amber-100 text-amber-700',
    info: 'bg-slate-100 text-slate-700',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${colors[severity]}`}>
      {severity}
    </span>
  );
}

export default function BlockersPage() {
  const [data, setData] = useState<BlockersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState(getDefaultDates);
  const [activeTab, setActiveTab] = useState<'bounce' | 'exit' | 'engagement' | 'ctr'>('bounce');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const params = new URLSearchParams({
        startDate: dates.startDate,
        endDate: dates.endDate,
      });
      const response = await fetch(`${basePath}/api/analytics/blockers?${params}`);
      if (!response.ok) throw new Error('Failed to fetch blockers data');
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load blockers data');
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
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

  const { highBounce, highExit, lowEngagement, summary } = data;

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
            <span>Blockers</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Flow Blockers</h1>
          <p className="text-slate-500 mt-1">
            Pages with high bounce rates, exit rates, or low engagement
          </p>
        </div>
        <DateRangePicker
          startDate={dates.startDate}
          endDate={dates.endDate}
          onChange={handleDateChange}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Total Blockers</p>
            <p className="text-2xl font-bold text-slate-900">{summary.totalBlockers}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-sm text-red-600">Critical Issues</p>
            <p className="text-2xl font-bold text-red-700">{summary.criticalCount}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <p className="text-sm text-amber-600">Warnings</p>
            <p className="text-2xl font-bold text-amber-700">{summary.warningCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Affected Sites */}
      {summary.topAffectedSites.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500 mb-2">Most Affected Sites</p>
            <div className="flex flex-wrap gap-2">
              {summary.topAffectedSites.map((site, i) => (
                <span
                  key={i}
                  className="px-3 py-1 bg-slate-100 rounded-full text-sm text-slate-700"
                >
                  {site}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Note */}
      {data.note && (
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
          <p className="text-sm text-sky-700">{data.note}</p>
        </div>
      )}

      {/* Blockers Tabs */}
      <Card>
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('bounce')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                activeTab === 'bounce'
                  ? 'text-sky-600 border-sky-600'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              High Bounce ({highBounce.length})
            </button>
            <button
              onClick={() => setActiveTab('exit')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                activeTab === 'exit'
                  ? 'text-sky-600 border-sky-600'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              High Exit ({highExit.length})
            </button>
            <button
              onClick={() => setActiveTab('engagement')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                activeTab === 'engagement'
                  ? 'text-sky-600 border-sky-600'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              Low Engagement ({lowEngagement.length})
            </button>
            <button
              onClick={() => setActiveTab('ctr')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                activeTab === 'ctr'
                  ? 'text-sky-600 border-sky-600'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              Low CTR ({data.lowCTR?.length || 0})
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {activeTab === 'bounce' && (
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
                    Bounce Rate
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Entrances
                  </th>
                  <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Severity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {highBounce.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-900">{item.pageTitle}</span>
                      <p className="text-xs text-slate-500">{item.pagePath}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/analytics/sites/${item.siteId}`}
                        className="text-sm text-slate-600 hover:text-sky-600"
                      >
                        {item.siteName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-sm font-medium ${
                          item.bounceRate > 85
                            ? 'text-red-600'
                            : item.bounceRate > 70
                              ? 'text-amber-600'
                              : 'text-slate-700'
                        }`}
                      >
                        {item.bounceRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {item.entrances.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <SeverityBadge severity={item.severity} />
                    </td>
                  </tr>
                ))}
                {highBounce.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No high bounce rate pages detected - great job!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'exit' && (
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
                    Exit Rate
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Exits
                  </th>
                  <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Severity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {highExit.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-900">{item.pageTitle}</span>
                      <p className="text-xs text-slate-500">{item.pagePath}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/analytics/sites/${item.siteId}`}
                        className="text-sm text-slate-600 hover:text-sky-600"
                      >
                        {item.siteName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-sm font-medium ${
                          item.exitRate > 75
                            ? 'text-red-600'
                            : item.exitRate > 60
                              ? 'text-amber-600'
                              : 'text-slate-700'
                        }`}
                      >
                        {item.exitRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {item.exits.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <SeverityBadge severity={item.severity} />
                    </td>
                  </tr>
                ))}
                {highExit.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No high exit rate pages detected - great job!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'engagement' && (
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
                    Avg Time on Page
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Pageviews
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lowEngagement.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-900">{item.pagePath}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/analytics/sites/${item.siteId}`}
                        className="text-sm text-slate-600 hover:text-sky-600"
                      >
                        {item.siteName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {item.avgTimeOnPage > 0 ? `${Math.round(item.avgTimeOnPage)}s` : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {item.pageviews.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {lowEngagement.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No low engagement pages detected
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'ctr' && (
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
                    CTR
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Impressions
                  </th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Avg Position
                  </th>
                  <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                    Severity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.lowCTR || []).map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-900">{item.pageTitle}</span>
                      <p className="text-xs text-slate-500 truncate max-w-xs">{item.pagePath}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/analytics/sites/${item.siteId}`}
                        className="text-sm text-slate-600 hover:text-sky-600"
                      >
                        {item.siteName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-sm font-medium ${
                          item.ctr < 1
                            ? 'text-red-600'
                            : item.ctr < 2
                              ? 'text-amber-600'
                              : 'text-slate-700'
                        }`}
                      >
                        {item.ctr.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {item.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {item.position.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <SeverityBadge severity={item.severity} />
                    </td>
                  </tr>
                ))}
                {(!data.lowCTR || data.lowCTR.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No low CTR pages detected
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
