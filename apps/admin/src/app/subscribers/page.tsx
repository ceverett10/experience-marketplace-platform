'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

// ─── Shared types ───────────────────────────────────────────────────────────

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

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

// ─── Subscribers types ──────────────────────────────────────────────────────

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

interface SubscriberStats {
  total: number;
  withConsent: number;
  consentRate: number;
  newThisWeek: number;
  unsubscribed: number;
}

interface SubscriberFilters {
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

// ─── Exit Feedback types ────────────────────────────────────────────────────

interface ExitFeedbackEvent {
  id: string;
  reason: string;
  reasonLabel: string;
  comment: string | null;
  siteId: string;
  siteName: string;
  landingPage: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  createdAt: string;
}

interface ExitFeedbackStats {
  total: number;
  thisWeek: number;
  thisMonth: number;
  reasons: Array<{ reason: string; label: string; count: number }>;
}

interface ExitFeedbackFilters {
  sites: Array<{ id: string; name: string }>;
  reasons: string[];
}

const reasonColors: Record<string, string> = {
  JUST_BROWSING: 'bg-slate-100 text-slate-700',
  TOO_EXPENSIVE: 'bg-red-100 text-red-800',
  WRONG_DESTINATION: 'bg-amber-100 text-amber-800',
  DATES_UNAVAILABLE: 'bg-purple-100 text-purple-800',
  NEED_MORE_INFO: 'bg-blue-100 text-blue-800',
  DONT_TRUST_SITE: 'bg-red-100 text-red-800',
  OTHER: 'bg-slate-100 text-slate-600',
};

const REASON_LABELS: Record<string, string> = {
  ALL: 'All Reasons',
  JUST_BROWSING: 'Just browsing',
  TOO_EXPENSIVE: 'Too expensive',
  WRONG_DESTINATION: 'Wrong destination',
  DATES_UNAVAILABLE: 'Dates unavailable',
  NEED_MORE_INFO: 'Need more info',
  DONT_TRUST_SITE: "Doesn't trust site",
  OTHER: 'Other',
};

// ─── Tab type ───────────────────────────────────────────────────────────────

type Tab = 'subscribers' | 'exit-feedback';

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function SubscribersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('subscribers');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Subscribers</h1>
        <p className="text-sm text-slate-500 mt-1">
          Email subscribers and exit intent feedback from visitors
        </p>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('subscribers')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'subscribers'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Email Subscribers
          </button>
          <button
            onClick={() => setActiveTab('exit-feedback')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'exit-feedback'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Exit Feedback
          </button>
        </div>
      </div>

      {activeTab === 'subscribers' ? <SubscribersTab /> : <ExitFeedbackTab />}
    </div>
  );
}

// ─── Subscribers Tab ────────────────────────────────────────────────────────

function SubscribersTab() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<SubscriberStats | null>(null);
  const [filters, setFilters] = useState<SubscriberFilters | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <>
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
    </>
  );
}

// ─── Exit Feedback Tab ──────────────────────────────────────────────────────

function ExitFeedbackTab() {
  const [events, setEvents] = useState<ExitFeedbackEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<ExitFeedbackStats | null>(null);
  const [filters, setFilters] = useState<ExitFeedbackFilters | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [siteFilter, setSiteFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

  const fetchFeedback = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (siteFilter) params.set('siteId', siteFilter);
      if (reasonFilter !== 'ALL') params.set('reason', reasonFilter);
      params.set('page', page.toString());

      const response = await fetch(`${basePath}/api/exit-feedback?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch exit feedback');

      const data = await response.json();
      setEvents(data.events);
      setPagination(data.pagination);
      setStats(data.stats);
      if (data.filters) setFilters(data.filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [basePath, siteFilter, reasonFilter, page]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const handleFilterChange = (setter: (val: string) => void) => (val: string) => {
    setter(val);
    setPage(1);
  };

  // Top reason for display
  const topReason = stats?.reasons[0];

  return (
    <>
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-slate-900">{stats.total.toLocaleString()}</p>
              <p className="text-sm text-slate-500">Total Responses</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-sky-600">{stats.thisWeek.toLocaleString()}</p>
              <p className="text-sm text-slate-500">This Week</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-slate-600">
                {stats.thisMonth.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500">This Month</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-amber-600">{topReason?.label || '-'}</p>
              <p className="text-sm text-slate-500">
                Top Reason{topReason ? ` (${topReason.count})` : ''}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reason Breakdown */}
      {stats && stats.reasons.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">Reason Breakdown</p>
            <div className="space-y-2">
              {stats.reasons.map((r) => {
                const pct = stats.total > 0 ? Math.round((r.count / stats.total) * 100) : 0;
                return (
                  <div key={r.reason} className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 w-40 shrink-0">{r.label}</span>
                    <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-slate-500 w-16 text-right">
                      {r.count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
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
              value={reasonFilter}
              onChange={(e) => handleFilterChange(setReasonFilter)(e.target.value)}
              className="rounded border border-slate-200 px-3 py-1.5 text-sm"
            >
              {filters?.reasons.map((reason) => (
                <option key={reason} value={reason}>
                  {REASON_LABELS[reason] || reason}
                </option>
              ))}
            </select>

            {(siteFilter || reasonFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSiteFilter('');
                  setReasonFilter('ALL');
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
            <button onClick={fetchFeedback} className="text-sm text-sky-600 hover:text-sky-800">
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
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Reason</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Comment</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Site</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Landing Page</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      Loading...
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      No exit feedback yet. Feedback is collected from PPC visitors via the exit
                      intent popup.
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        <span title={new Date(event.createdAt).toLocaleString()}>
                          {timeAgo(event.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${reasonColors[event.reason] || 'bg-slate-100 text-slate-600'}`}
                        >
                          {event.reasonLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {event.comment ? (
                          <span className="truncate max-w-[300px] block" title={event.comment}>
                            {event.comment}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="truncate max-w-[150px]">{event.siteName}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {event.landingPage ? (
                          <span
                            className="truncate max-w-[200px] block text-xs"
                            title={event.landingPage}
                          >
                            {event.landingPage}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {event.utmSource || event.utmMedium ? (
                          <span>
                            {[event.utmSource, event.utmMedium].filter(Boolean).join(' / ')}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
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
    </>
  );
}
