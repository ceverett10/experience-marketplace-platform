'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

type Status = 'NEW' | 'READ' | 'REPLIED' | 'ARCHIVED';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  domain: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  site: { id: string; name: string; domain: string } | null;
  microsite: { id: string; domain: string } | null;
}

interface Stats {
  total: number;
  new: number;
  read: number;
  replied: number;
  archived: number;
  newThisWeek: number;
}

interface Filters {
  sites: Array<{ id: string; name: string }>;
  statuses: string[];
  subjects: string[];
}

const statusColors: Record<Status, string> = {
  NEW: 'bg-amber-100 text-amber-800',
  READ: 'bg-sky-100 text-sky-800',
  REPLIED: 'bg-green-100 text-green-800',
  ARCHIVED: 'bg-slate-100 text-slate-600',
};

const NEXT_STATUS: Record<Status, Status[]> = {
  NEW: ['READ', 'REPLIED', 'ARCHIVED'],
  READ: ['REPLIED', 'ARCHIVED', 'NEW'],
  REPLIED: ['ARCHIVED', 'NEW'],
  ARCHIVED: ['NEW'],
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

export default function ContactMessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('NEW');
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

  const fetchMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (siteFilter) params.set('siteId', siteFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (subjectFilter !== 'ALL') params.set('subject', subjectFilter);
      if (search) params.set('search', search);
      params.set('page', page.toString());

      const response = await fetch(`${basePath}/api/contact-messages?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch contact messages');

      const data = await response.json();
      setMessages(data.messages);
      setPagination(data.pagination);
      setStats(data.stats);
      if (data.filters) setFilters(data.filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [basePath, siteFilter, statusFilter, subjectFilter, search, page]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleFilterChange = (setter: (val: string) => void) => (val: string) => {
    setter(val);
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const updateStatus = async (id: string, newStatus: Status) => {
    try {
      setUpdatingId(id);
      const response = await fetch(`${basePath}/api/contact-messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      // Optimistically update local state, then refresh stats
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: newStatus } : m)));
      fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const markAsRead = async (id: string, currentStatus: Status) => {
    if (currentStatus === 'NEW') {
      await updateStatus(id, 'READ');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Contact Messages</h1>
        <p className="text-sm text-slate-500 mt-1">
          Messages submitted via the contact forms on sites and microsites
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-slate-900">{stats.total.toLocaleString()}</p>
              <p className="text-sm text-slate-500">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-amber-600">{stats.new.toLocaleString()}</p>
              <p className="text-sm text-slate-500">New (unread)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-green-600">{stats.replied.toLocaleString()}</p>
              <p className="text-sm text-slate-500">Replied</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-slate-600">{stats.archived.toLocaleString()}</p>
              <p className="text-sm text-slate-500">Archived</p>
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
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => handleFilterChange(setStatusFilter)(e.target.value)}
              className="rounded border border-slate-200 px-3 py-1.5 text-sm"
            >
              {filters?.statuses.map((s) => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All Statuses' : s}
                </option>
              ))}
            </select>

            <select
              value={subjectFilter}
              onChange={(e) => handleFilterChange(setSubjectFilter)(e.target.value)}
              className="rounded border border-slate-200 px-3 py-1.5 text-sm"
            >
              {filters?.subjects.map((s) => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All Subjects' : s}
                </option>
              ))}
            </select>

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

            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, email, message…"
                className="rounded border border-slate-200 px-3 py-1.5 text-sm w-64"
              />
              <button
                type="submit"
                className="rounded border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Search
              </button>
            </form>

            {(siteFilter || statusFilter !== 'NEW' || subjectFilter !== 'ALL' || search) && (
              <button
                onClick={() => {
                  setSiteFilter('');
                  setStatusFilter('NEW');
                  setSubjectFilter('ALL');
                  setSearch('');
                  setSearchInput('');
                  setPage(1);
                }}
                className="text-sm text-sky-600 hover:text-sky-800"
              >
                Reset filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-red-600 mb-2">{error}</p>
            <button onClick={fetchMessages} className="text-sm text-sky-600 hover:text-sky-800">
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {/* Messages list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-12 text-center text-slate-400">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="px-4 py-12 text-center text-slate-400">
              No messages match the current filters
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {messages.map((m) => {
                const isExpanded = expandedId === m.id;
                const sourceLabel = m.site?.name || m.microsite?.domain || m.domain;
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => {
                        setExpandedId(isExpanded ? null : m.id);
                        if (!isExpanded) markAsRead(m.id, m.status);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span
                              className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${statusColors[m.status]}`}
                            >
                              {m.status}
                            </span>
                            <span className="font-medium text-slate-900">{m.name}</span>
                            <span className="text-sm text-slate-500">{m.email}</span>
                            {m.phone && <span className="text-sm text-slate-400">{m.phone}</span>}
                          </div>
                          <div className="mt-1 text-sm text-slate-700">
                            <span className="font-medium">{m.subject}</span>
                            <span className="text-slate-400"> — </span>
                            <span className="text-slate-600">
                              {m.message.replace(/\s+/g, ' ').slice(0, 140)}
                              {m.message.length > 140 ? '…' : ''}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-400 flex items-center gap-3 flex-wrap">
                            <span title={new Date(m.createdAt).toLocaleString()}>
                              {timeAgo(m.createdAt)}
                            </span>
                            <span>·</span>
                            <span className="truncate max-w-[300px]">{sourceLabel}</span>
                          </div>
                        </div>
                        <span className="text-slate-300 text-xs mt-1">
                          {isExpanded ? '▾' : '▸'}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 -mt-1 bg-slate-50/60">
                        <div className="rounded border border-slate-200 bg-white p-4 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-400">From</p>
                              <p className="text-slate-900 font-medium">{m.name}</p>
                              <a
                                href={`mailto:${m.email}?subject=Re: ${encodeURIComponent(m.subject)}`}
                                className="text-sky-600 hover:text-sky-800"
                              >
                                {m.email}
                              </a>
                              {m.phone && (
                                <p className="text-slate-600 mt-1">
                                  <a
                                    href={`tel:${m.phone}`}
                                    className="text-sky-600 hover:text-sky-800"
                                  >
                                    {m.phone}
                                  </a>
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-400">
                                Submitted on
                              </p>
                              <p className="text-slate-900">{m.domain}</p>
                              {m.site && (
                                <p className="text-slate-500 text-xs">Site: {m.site.name}</p>
                              )}
                              {m.microsite && (
                                <p className="text-slate-500 text-xs">
                                  Microsite: {m.microsite.domain}
                                </p>
                              )}
                              <p className="text-slate-500 text-xs mt-1">
                                {new Date(m.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>

                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                              Subject
                            </p>
                            <p className="text-slate-900">{m.subject}</p>
                          </div>

                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                              Message
                            </p>
                            <p className="text-slate-700 whitespace-pre-wrap text-sm">
                              {m.message}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                            <span className="text-xs uppercase tracking-wide text-slate-400 mr-1">
                              Mark as
                            </span>
                            {NEXT_STATUS[m.status].map((next) => (
                              <button
                                key={next}
                                disabled={updatingId === m.id}
                                onClick={() => updateStatus(m.id, next)}
                                className="text-xs px-3 py-1 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
                              >
                                {next === 'NEW'
                                  ? 'Unread'
                                  : next.charAt(0) + next.slice(1).toLowerCase()}
                              </button>
                            ))}
                            <a
                              href={`mailto:${m.email}?subject=Re: ${encodeURIComponent(m.subject)}`}
                              className="ml-auto text-xs px-3 py-1 rounded bg-sky-600 text-white hover:bg-sky-700"
                            >
                              Reply via email
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

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
