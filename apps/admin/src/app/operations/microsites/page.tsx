'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface Microsite {
  id: string;
  siteName: string;
  siteTitle: string;
  fullDomain: string;
  entityType: 'SUPPLIER' | 'PRODUCT' | 'OPPORTUNITY';
  status: string;
  layoutType: string;
  cachedProductCount: number;
  pageViews: number;
  createdAt: string;
  sourceName: string;
  keyMetric: { label: string; value: string | number };
  location: string | null;
}

interface MicrositesData {
  microsites: Microsite[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  summary: {
    SUPPLIER: { total: number; active: number };
    OPPORTUNITY: { total: number; active: number };
    PRODUCT: { total: number; active: number };
  };
}

const entityTypeColors: Record<string, string> = {
  SUPPLIER: 'bg-purple-100 text-purple-800',
  OPPORTUNITY: 'bg-emerald-100 text-emerald-800',
  PRODUCT: 'bg-amber-100 text-amber-800',
};

const entityTypeRingColors: Record<string, string> = {
  SUPPLIER: 'ring-purple-500',
  OPPORTUNITY: 'ring-emerald-500',
  PRODUCT: 'ring-amber-500',
};

const layoutColors: Record<string, string> = {
  MARKETPLACE: 'bg-purple-100 text-purple-800',
  CATALOG: 'bg-blue-100 text-blue-800',
  PRODUCT_SPOTLIGHT: 'bg-amber-100 text-amber-800',
  AUTO: 'bg-slate-100 text-slate-800',
};

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  GENERATING: 'bg-blue-100 text-blue-800',
  REVIEW: 'bg-amber-100 text-amber-800',
  DRAFT: 'bg-slate-100 text-slate-800',
  PAUSED: 'bg-orange-100 text-orange-800',
  ARCHIVED: 'bg-red-100 text-red-800',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MicrositesPage() {
  const [data, setData] = useState<MicrositesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', '50');
      if (search) params.set('search', search);
      if (entityTypeFilter) params.set('entityType', entityTypeFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('sort', sortField);
      params.set('order', sortOrder);

      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const response = await fetch(`${basePath}/api/microsites?${params.toString()}`);

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch microsites:', err);
      setError(err instanceof Error ? err.message : 'Failed to load microsites');
    } finally {
      setLoading(false);
    }
  }, [page, search, entityTypeFilter, statusFilter, sortField, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) {
      return <span className="text-slate-300 ml-1">&#8597;</span>;
    }
    return <span className="text-sky-600 ml-1">{sortOrder === 'asc' ? '&#8593;' : '&#8595;'}</span>;
  };

  const hasFilters = search || entityTypeFilter || statusFilter;

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Microsites</h1>
          <p className="text-slate-500 mt-1">
            Manage all microsites across suppliers, opportunities, and products
          </p>
        </div>
        <Card>
          <div className="p-8 text-center">
            <div className="text-4xl mb-4">&#9888;&#65039;</div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Failed to Load</h2>
            <p className="text-sm text-slate-600 mb-4">{error}</p>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
            >
              Retry
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Microsites</h1>
          <p className="text-slate-500 mt-1">
            Manage all microsites across suppliers, opportunities, and products
          </p>
        </div>
        <Link href="/operations" className="text-sm text-sky-600 hover:text-sky-700">
          &#8592; Operations
        </Link>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['SUPPLIER', 'OPPORTUNITY', 'PRODUCT'] as const).map((type) => {
            const stats = data.summary[type];
            const labels: Record<string, { title: string; subtitle: string }> = {
              SUPPLIER: { title: 'Supplier', subtitle: 'From Holibob suppliers' },
              OPPORTUNITY: {
                title: 'Opportunity',
                subtitle: 'From SEO opportunities (score 50-69)',
              },
              PRODUCT: { title: 'Product', subtitle: 'Dedicated product pages' },
            };
            const isActive = entityTypeFilter === type;

            return (
              <Card
                key={type}
                className={`cursor-pointer transition-shadow hover:shadow-md ${isActive ? `ring-2 ${entityTypeRingColors[type]}` : ''}`}
                onClick={() => {
                  setEntityTypeFilter(isActive ? '' : type);
                  setPage(1);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">{labels[type]!.title}</p>
                      <p className="text-xs text-slate-400">{labels[type]!.subtitle}</p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${entityTypeColors[type]}`}
                    >
                      {type}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">
                      {stats.total.toLocaleString()}
                    </span>
                    <span className="text-sm text-green-600">{stats.active} active</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{
                        width: `${stats.total > 0 ? (stats.active / stats.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search microsites..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <select
              value={entityTypeFilter}
              onChange={(e) => {
                setEntityTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Types</option>
              <option value="SUPPLIER">Supplier</option>
              <option value="OPPORTUNITY">Opportunity</option>
              <option value="PRODUCT">Product</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="GENERATING">Generating</option>
              <option value="REVIEW">Review</option>
              <option value="DRAFT">Draft</option>
              <option value="PAUSED">Paused</option>
              <option value="ARCHIVED">Archived</option>
            </select>

            {hasFilters && (
              <button
                onClick={() => {
                  setSearch('');
                  setEntityTypeFilter('');
                  setStatusFilter('');
                  setPage(1);
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
              >
                Clear filters
              </button>
            )}

            {data && (
              <div className="text-sm text-slate-500">
                {data.pagination.totalCount.toLocaleString()} microsites
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Type</th>
                <th
                  className="text-left px-4 py-3 text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                  onClick={() => handleSort('siteName')}
                >
                  Source <SortIcon field="siteName" />
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">
                  Site Title
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Domain</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">Layout</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">
                  Key Metric
                </th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">Status</th>
                <th
                  className="text-right px-4 py-3 text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                  onClick={() => handleSort('createdAt')}
                >
                  Created <SortIcon field="createdAt" />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <div className="h-5 w-20 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="h-5 w-20 bg-slate-100 rounded animate-pulse mx-auto" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-5 w-16 bg-slate-100 rounded animate-pulse ml-auto" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="h-5 w-16 bg-slate-100 rounded animate-pulse mx-auto" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-5 w-20 bg-slate-100 rounded animate-pulse ml-auto" />
                    </td>
                  </tr>
                ))
              ) : data?.microsites.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No microsites found
                  </td>
                </tr>
              ) : (
                data?.microsites.map((ms) => (
                  <tr key={ms.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${entityTypeColors[ms.entityType] || 'bg-slate-100 text-slate-600'}`}
                      >
                        {ms.entityType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{ms.sourceName}</div>
                      {ms.location && (
                        <div className="text-xs text-slate-500 mt-0.5">{ms.location}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="text-sm text-slate-700 truncate max-w-[280px]"
                        title={ms.siteTitle}
                      >
                        {ms.siteTitle}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://${ms.fullDomain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-600 hover:text-sky-700 text-sm truncate block max-w-[250px]"
                      >
                        {ms.fullDomain}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${layoutColors[ms.layoutType] || 'bg-slate-100 text-slate-600'}`}
                      >
                        {ms.layoutType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm text-slate-900 font-medium">{ms.keyMetric.value}</div>
                      <div className="text-xs text-slate-500">{ms.keyMetric.label}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${statusColors[ms.status] || 'bg-slate-100 text-slate-600'}`}
                      >
                        {ms.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-500">
                      {formatDate(ms.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <div className="text-sm text-slate-500">
              Page {data.pagination.page} of {data.pagination.totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(data.pagination.totalPages, page + 1))}
                disabled={page === data.pagination.totalPages}
                className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
