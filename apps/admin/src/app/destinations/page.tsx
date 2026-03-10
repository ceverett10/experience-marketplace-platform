'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface DestinationItem {
  id: string;
  slug: string;
  title: string;
  status: string;
  hasContent: boolean;
  qualityScore: number | null;
  ownerType: 'site' | 'microsite';
  ownerName: string;
  url: string | null;
  createdAt: string;
  publishedAt: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

interface Stats {
  total: number;
  published: number;
  withContent: number;
  sites: number;
  microsites: number;
}

const PAGE_SIZE = 50;

const statusColors: Record<string, string> = {
  PUBLISHED: 'bg-green-100 text-green-800',
  DRAFT: 'bg-gray-100 text-gray-800',
  REVIEW: 'bg-blue-100 text-blue-800',
  ARCHIVED: 'bg-red-100 text-red-800',
};

export default function DestinationsPage() {
  const [items, setItems] = useState<DestinationItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalCount: 0,
    totalPages: 0,
  });
  const [stats, setStats] = useState<Stats>({
    total: 0,
    published: 0,
    withContent: 0,
    sites: 0,
    microsites: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search
  useEffect(() => {
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          pageSize: PAGE_SIZE.toString(),
          status: statusFilter,
          owner: ownerFilter,
          search: debouncedSearch,
        });
        const res = await fetch(`${basePath}/api/destinations?${params}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setItems(data.items || []);
        setPagination(data.pagination);
        setStats(data.stats);
      } catch {
        console.error('Failed to fetch destinations');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentPage, statusFilter, ownerFilter, debouncedSearch, basePath]);

  const destinationName = (slug: string) => slug.replace('destinations/', '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Destination Pages</h1>
          <p className="text-sm text-slate-500 mt-1">
            All destination landing pages across sites and microsites
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-sm text-slate-500">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-green-600">{stats.published}</p>
            <p className="text-sm text-slate-500">Published</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-sky-600">{stats.withContent}</p>
            <p className="text-sm text-slate-500">With Content</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-slate-900">{stats.sites}</p>
            <p className="text-sm text-slate-500">Site Pages</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-slate-900">{stats.microsites}</p>
            <p className="text-sm text-slate-500">Microsite Pages</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search destinations or sites..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="all">All Statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="REVIEW">Review</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select
          value={ownerFilter}
          onChange={(e) => {
            setOwnerFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="all">All Owners</option>
          <option value="sites">Sites Only</option>
          <option value="microsites">Microsites Only</option>
        </select>
        <span className="text-sm text-slate-500">
          {pagination.totalCount} result{pagination.totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-500">Loading destinations...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-500">No destination pages found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-slate-500 border-b border-slate-200">
                    <th className="px-4 py-3 font-medium">Destination</th>
                    <th className="px-4 py-3 font-medium">Site</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Content</th>
                    <th className="px-4 py-3 font-medium text-right">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 text-sm">{item.title}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          /{destinationName(item.slug)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-700">{item.ownerName}</span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              item.ownerType === 'site'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {item.ownerType === 'site' ? 'Site' : 'Micro'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-800'}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.hasContent ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-green-600 text-sm">&#10003;</span>
                            {item.qualityScore !== null && (
                              <span className="text-xs text-slate-500">{item.qualityScore}%</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-800"
                          >
                            Visit
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                              />
                            </svg>
                          </a>
                        ) : (
                          <span className="text-slate-300 text-sm">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {currentPage} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(pagination.totalPages, currentPage + 1))}
            disabled={currentPage === pagination.totalPages}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
