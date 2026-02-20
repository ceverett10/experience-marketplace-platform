'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@experience-marketplace/ui-components';

interface Booking {
  id: string;
  holibobBookingId: string;
  status: string;
  totalAmount: number;
  currency: string;
  commissionAmount: number | null;
  commissionRate: number | null;
  site: {
    id: string;
    name: string;
    domain: string;
  };
  source: string;
  sourceDetail: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    gclid: boolean;
    fbclid: boolean;
  };
  landingPage: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SourceSummary {
  source: string;
  count: number;
}

interface FiltersData {
  sites: Array<{ id: string; name: string }>;
  statuses: string[];
  sources: string[];
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-sky-100 text-sky-800',
  CANCELLED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-purple-100 text-purple-800',
};

const sourceIcons: Record<string, string> = {
  Facebook: 'fb',
  Google: 'g',
  Organic: 'org',
  Direct: 'dir',
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [sourceSummary, setSourceSummary] = useState<SourceSummary[]>([]);
  const [filters, setFilters] = useState<FiltersData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [siteFilter, setSiteFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(1);

  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

  const fetchBookings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (siteFilter) params.set('siteId', siteFilter);
      if (sourceFilter) params.set('source', sourceFilter);
      params.set('page', page.toString());

      const response = await fetch(`${basePath}/api/bookings?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch bookings');

      const data = await response.json();
      setBookings(data.bookings);
      setPagination(data.pagination);
      setSourceSummary(data.sourceSummary || []);
      if (data.filters) setFilters(data.filters);
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setError('Failed to load bookings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [basePath, statusFilter, siteFilter, sourceFilter, page]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const totalBookings = sourceSummary.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bookings</h1>
        <p className="text-slate-500 mt-1">All bookings with site and traffic source attribution</p>
      </div>

      {/* Source summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {sourceSummary.map((s) => (
          <button
            key={s.source}
            onClick={() => {
              setSourceFilter(sourceFilter === s.source ? '' : s.source);
              setPage(1);
            }}
            className={`p-4 rounded-xl border text-left transition-all ${
              sourceFilter === s.source
                ? 'border-sky-300 bg-sky-50 ring-1 ring-sky-200'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-sm font-medium text-slate-500 capitalize">{s.source}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{s.count}</p>
            <p className="text-xs text-slate-400 mt-1">
              {totalBookings > 0 ? ((s.count / totalBookings) * 100).toFixed(1) : 0}%
            </p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {(filters?.statuses || ['ALL']).map((s) => (
                  <option key={s} value={s}>
                    {s === 'ALL' ? 'All Statuses' : s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Site</label>
              <select
                value={siteFilter}
                onChange={(e) => {
                  setSiteFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                <option value="">All Sites</option>
                {(filters?.sites || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Source</label>
              <select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                <option value="">All Sources</option>
                {(filters?.sources || []).map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {(statusFilter !== 'ALL' || siteFilter || sourceFilter) && (
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setStatusFilter('ALL');
                    setSiteFilter('');
                    setSourceFilter('');
                    setPage(1);
                  }}
                  className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchBookings}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Bookings table */}
      <Card>
        <CardHeader>
          <CardTitle>{pagination ? `${pagination.total} Bookings` : 'Bookings'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin text-3xl mb-3">...</div>
                <p className="text-slate-500 text-sm">Loading bookings...</p>
              </div>
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No bookings found matching your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-slate-500 border-b border-slate-100">
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Site</th>
                    <th className="pb-3 font-medium">Source</th>
                    <th className="pb-3 font-medium">Campaign</th>
                    <th className="pb-3 font-medium text-right">Amount</th>
                    <th className="pb-3 font-medium text-right">Commission</th>
                    <th className="pb-3 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-slate-50">
                      <td className="py-3 text-sm">
                        <p className="text-slate-900">
                          {new Date(booking.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(booking.createdAt).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </td>
                      <td className="py-3 text-sm">
                        <p className="font-medium text-slate-900">{booking.site.name}</p>
                        <p className="text-xs text-slate-400">{booking.site.domain}</p>
                      </td>
                      <td className="py-3 text-sm">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            booking.source === 'Facebook'
                              ? 'bg-blue-100 text-blue-800'
                              : booking.source === 'Google'
                                ? 'bg-emerald-100 text-emerald-800'
                                : booking.source === 'Organic'
                                  ? 'bg-green-100 text-green-800'
                                  : booking.source === 'Direct'
                                    ? 'bg-slate-100 text-slate-700'
                                    : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          <span className="font-bold text-[10px]">
                            {sourceIcons[booking.source] || 'oth'}
                          </span>
                          {booking.source}
                        </span>
                        {booking.sourceDetail.utmMedium && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {booking.sourceDetail.utmMedium}
                          </p>
                        )}
                      </td>
                      <td className="py-3 text-sm">
                        {booking.sourceDetail.utmCampaign ? (
                          <p
                            className="text-slate-600 truncate max-w-[200px]"
                            title={booking.sourceDetail.utmCampaign}
                          >
                            {booking.sourceDetail.utmCampaign}
                          </p>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 text-sm text-right font-medium text-slate-900 tabular-nums">
                        {booking.currency === 'GBP' ? '\u00A3' : booking.currency}{' '}
                        {booking.totalAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-3 text-sm text-right tabular-nums">
                        {booking.commissionAmount !== null ? (
                          <span className="text-slate-600">
                            {booking.currency === 'GBP' ? '\u00A3' : booking.currency}{' '}
                            {booking.commissionAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                            {booking.commissionRate !== null && (
                              <span className="text-xs text-slate-400 ml-1">
                                ({booking.commissionRate}%)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                            statusColors[booking.status] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {booking.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                Showing {(pagination.page - 1) * pagination.limit + 1} -{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                  disabled={page >= pagination.totalPages}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
