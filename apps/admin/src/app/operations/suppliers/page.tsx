'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface Supplier {
  id: string;
  holibobSupplierId: string;
  name: string;
  slug: string;
  productCount: number;
  rating: number | null;
  reviewCount: number;
  cities: string[];
  categories: string[];
  createdAt: string;
  lastSyncedAt: string | null;
  hasMicrosite: boolean;
  micrositeUrl: string | null;
  micrositeStatus: string | null;
  layoutType: string;
  micrositeCreatedAt: string | null;
}

interface SupplierData {
  suppliers: Supplier[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  summary: {
    MARKETPLACE: { total: number; launched: number };
    CATALOG: { total: number; launched: number };
    PRODUCT_SPOTLIGHT: { total: number; launched: number };
  };
}

const layoutColors: Record<string, string> = {
  MARKETPLACE: 'bg-purple-100 text-purple-800',
  CATALOG: 'bg-blue-100 text-blue-800',
  PRODUCT_SPOTLIGHT: 'bg-amber-100 text-amber-800',
};

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  GENERATING: 'bg-blue-100 text-blue-800',
  REVIEW: 'bg-amber-100 text-amber-800',
  DRAFT: 'bg-slate-100 text-slate-800',
  ARCHIVED: 'bg-red-100 text-red-800',
};

export default function SuppliersPage() {
  const [data, setData] = useState<SupplierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [layoutFilter, setLayoutFilter] = useState('');
  const [launchedFilter, setLaunchedFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState('productCount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', '50');
      if (search) params.set('search', search);
      if (layoutFilter) params.set('layout', layoutFilter);
      if (launchedFilter) params.set('launched', launchedFilter);
      params.set('sort', sortField);
      params.set('order', sortOrder);

      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const response = await fetch(`${basePath}/api/suppliers?${params.toString()}`);

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch suppliers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [page, search, layoutFilter, launchedFilter, sortField, sortOrder]);

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

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-slate-500 mt-1">Manage Holibob suppliers and their microsites</p>
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
          <h1 className="text-2xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-slate-500 mt-1">Manage Holibob suppliers and their microsites</p>
        </div>
        <Link href="/operations" className="text-sm text-sky-600 hover:text-sky-700">
          &#8592; Operations
        </Link>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card
            className={`cursor-pointer transition-shadow hover:shadow-md ${layoutFilter === 'MARKETPLACE' ? 'ring-2 ring-purple-500' : ''}`}
            onClick={() => {
              setLayoutFilter(layoutFilter === 'MARKETPLACE' ? '' : 'MARKETPLACE');
              setPage(1);
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">MARKETPLACE</p>
                  <p className="text-xs text-slate-400">51+ products</p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${layoutColors['MARKETPLACE']}`}
                >
                  51+
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {data.summary.MARKETPLACE.total.toLocaleString()}
                </span>
                <span className="text-sm text-green-600">
                  {data.summary.MARKETPLACE.launched} launched
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{
                    width: `${
                      data.summary.MARKETPLACE.total > 0
                        ? (data.summary.MARKETPLACE.launched / data.summary.MARKETPLACE.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-shadow hover:shadow-md ${layoutFilter === 'CATALOG' ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => {
              setLayoutFilter(layoutFilter === 'CATALOG' ? '' : 'CATALOG');
              setPage(1);
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">CATALOG</p>
                  <p className="text-xs text-slate-400">2-50 products</p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${layoutColors['CATALOG']}`}
                >
                  2-50
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {data.summary.CATALOG.total.toLocaleString()}
                </span>
                <span className="text-sm text-green-600">
                  {data.summary.CATALOG.launched} launched
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{
                    width: `${
                      data.summary.CATALOG.total > 0
                        ? (data.summary.CATALOG.launched / data.summary.CATALOG.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-shadow hover:shadow-md ${layoutFilter === 'PRODUCT_SPOTLIGHT' ? 'ring-2 ring-amber-500' : ''}`}
            onClick={() => {
              setLayoutFilter(layoutFilter === 'PRODUCT_SPOTLIGHT' ? '' : 'PRODUCT_SPOTLIGHT');
              setPage(1);
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">PRODUCT SPOTLIGHT</p>
                  <p className="text-xs text-slate-400">1 product</p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${layoutColors['PRODUCT_SPOTLIGHT']}`}
                >
                  1
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {data.summary.PRODUCT_SPOTLIGHT.total.toLocaleString()}
                </span>
                <span className="text-sm text-green-600">
                  {data.summary.PRODUCT_SPOTLIGHT.launched} launched
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{
                    width: `${
                      data.summary.PRODUCT_SPOTLIGHT.total > 0
                        ? (data.summary.PRODUCT_SPOTLIGHT.launched /
                            data.summary.PRODUCT_SPOTLIGHT.total) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search suppliers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Launched Filter */}
            <select
              value={launchedFilter}
              onChange={(e) => {
                setLaunchedFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Status</option>
              <option value="true">Launched</option>
              <option value="false">Not Launched</option>
            </select>

            {/* Clear Filters */}
            {(search || layoutFilter || launchedFilter) && (
              <button
                onClick={() => {
                  setSearch('');
                  setLayoutFilter('');
                  setLaunchedFilter('');
                  setPage(1);
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
              >
                Clear filters
              </button>
            )}

            {/* Total Count */}
            {data && (
              <div className="text-sm text-slate-500">
                {data.pagination.totalCount.toLocaleString()} suppliers
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
                <th
                  className="text-left px-4 py-3 text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                  onClick={() => handleSort('name')}
                >
                  Supplier Name <SortIcon field="name" />
                </th>
                <th
                  className="text-right px-4 py-3 text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                  onClick={() => handleSort('productCount')}
                >
                  Products <SortIcon field="productCount" />
                </th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">Layout</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">
                  Microsite URL
                </th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">
                  Launched
                </th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-5 w-12 bg-slate-100 rounded animate-pulse ml-auto" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="h-5 w-20 bg-slate-100 rounded animate-pulse mx-auto" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="h-5 w-8 bg-slate-100 rounded animate-pulse mx-auto" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="h-5 w-16 bg-slate-100 rounded animate-pulse mx-auto" />
                    </td>
                  </tr>
                ))
              ) : data?.suppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No suppliers found
                  </td>
                </tr>
              ) : (
                data?.suppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{supplier.name}</div>
                      {supplier.cities.length > 0 && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {supplier.cities.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium text-slate-900">
                        {supplier.productCount.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${layoutColors[supplier.layoutType] || 'bg-slate-100 text-slate-600'}`}
                      >
                        {supplier.layoutType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {supplier.micrositeUrl ? (
                        <a
                          href={supplier.micrositeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-600 hover:text-sky-700 text-sm truncate block max-w-[250px]"
                        >
                          {supplier.micrositeUrl.replace('https://', '')}
                        </a>
                      ) : (
                        <span className="text-slate-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {supplier.hasMicrosite ? (
                        <span className="text-green-600 font-medium">Yes</span>
                      ) : (
                        <span className="text-slate-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {supplier.micrositeStatus ? (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${statusColors[supplier.micrositeStatus] || 'bg-slate-100 text-slate-600'}`}
                        >
                          {supplier.micrositeStatus}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
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
