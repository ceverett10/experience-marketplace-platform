'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface Subscriber {
  id: string;
  email: string;
  domain: string;
  site: { id: string; name: string; domain: string } | null;
  consentSource: string;
  marketingConsent: boolean;
  marketingStatus: string;
  prizeDrawStatus: string;
  createdAt: string;
  unsubscribedAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Stats {
  total: number;
  withConsent: number;
  consentRate: number;
  newThisWeek: number;
  unsubscribed: number;
}

interface FiltersData {
  sites: Array<{ id: string; name: string }>;
  consentSources: string[];
  marketingStatuses: string[];
}

const marketingStatusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-green-100 text-green-800',
  UNSUBSCRIBED: 'bg-red-100 text-red-800',
  BOUNCED: 'bg-slate-100 text-slate-800',
};

const prizeDrawColors: Record<string, string> = {
  ENTERED: 'bg-sky-100 text-sky-800',
  WINNER: 'bg-emerald-100 text-emerald-800',
  NOT_SELECTED: 'bg-slate-100 text-slate-600',
};

const sourceColors: Record<string, string> = {
  popup: 'bg-purple-100 text-purple-800',
  footer: 'bg-blue-100 text-blue-800',
  checkout: 'bg-amber-100 text-amber-800',
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState<FiltersData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [siteFilter, setSiteFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

  const fetchSubscribers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (siteFilter) params.set('siteId', siteFilter);
      if (sourceFilter !== 'ALL') params.set('consentSource', sourceFilter);
      if (statusFilter !== 'ALL') params.set('marketingStatus', statusFilter);
      params.set('page', page.toString());

      const response = await fetch(`${basePath}/api/subscribers?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch subscribers');

      const data = await response.json();
      setSubscribers(data.subscribers);
      setPagination(data.pagination);
      setStats(data.stats);
      if (data.filters) setFilters(data.filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [basePath, siteFilter, sourceFilter, statusFilter, page]);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  const handleFilterChange = (setter: (val: string) => void) => (val: string) => {
    setter(val);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Subscribers</h1>
        <p className="text-sm text-slate-500 mt-1">
          Email subscribers collected via popup, footer, and checkout forms
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-slate-900">{stats.total.toLocaleString()}</p>
              <p className="text-sm text-slate-500">Total Subscribers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-green-600">{stats.consentRate}%</p>
              <p className="text-sm text-slate-500">
                Marketing Consent ({stats.withConsent.toLocaleString()})
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-sky-600">
                {stats.newThisWeek.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500">New This Week</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-red-600">
                {stats.unsubscribed.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500">Unsubscribed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={siteFilter}
              onChange={(e) => handleFilterChange(setSiteFilter)(e.target.value)}
              className="rounded border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="">All Sites</option>
              {filters?.sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => handleFilterChange(setSourceFilter)(e.target.value)}
              className="rounded border border-slate-200 px-3 py-1.5 text-sm"
            >
              {filters?.consentSources.map((source) => (
                <option key={source} value={source}>
                  {source === 'ALL' ? 'All Sources' : source}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => handleFilterChange(setStatusFilter)(e.target.value)}
              className="rounded border border-slate-200 px-3 py-1.5 text-sm"
            >
              {filters?.marketingStatuses.map((status) => (
                <option key={status} value={status}>
                  {status === 'ALL' ? 'All Statuses' : status}
                </option>
              ))}
            </select>

            {(siteFilter || sourceFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSiteFilter('');
                  setSourceFilter('ALL');
                  setStatusFilter('ALL');
                  setPage(1);
                }}
                className="text-sm text-sky-600 hover:text-sky-800"
              >
                Clear filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-red-600 mb-2">{error}</p>
            <button onClick={fetchSubscribers} className="text-sm text-sky-600 hover:text-sky-800">
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Site</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Source</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Marketing</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Prize Draw</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      Loading...
                    </td>
                  </tr>
                ) : subscribers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      No subscribers found
                    </td>
                  </tr>
                ) : (
                  subscribers.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        <span title={new Date(sub.createdAt).toLocaleString()}>
                          {timeAgo(sub.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{sub.email}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="truncate max-w-[200px]">{sub.site?.name || sub.domain}</div>
                        <div className="text-xs text-slate-400 truncate max-w-[200px]">
                          {sub.domain}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${sourceColors[sub.consentSource] || 'bg-slate-100 text-slate-600'}`}
                        >
                          {sub.consentSource}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {sub.marketingConsent ? (
                          <span className="text-green-600" title="Opted in">
                            Yes
                          </span>
                        ) : (
                          <span className="text-slate-400" title="Not opted in">
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${marketingStatusColors[sub.marketingStatus] || 'bg-slate-100 text-slate-600'}`}
                        >
                          {sub.marketingStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${prizeDrawColors[sub.prizeDrawStatus] || 'bg-slate-100 text-slate-600'}`}
                        >
                          {sub.prizeDrawStatus.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <p className="text-sm text-slate-500">
                Showing {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="rounded border border-slate-200 px-3 py-1 text-sm disabled:opacity-50 hover:bg-slate-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="rounded border border-slate-200 px-3 py-1 text-sm disabled:opacity-50 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
