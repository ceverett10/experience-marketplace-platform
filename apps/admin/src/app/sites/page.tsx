'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface Site {
  id: string;
  name: string;
  slug: string;
  status: 'DRAFT' | 'REVIEW' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  domain: string | null;
  isAutomatic: boolean;
  createdAt: string;
  publishedAt: string | null;

  // Metrics
  monthlyVisitors: number;
  monthlyBookings: number;
  monthlyRevenue: number;
  contentCount: number;

  // Brand
  brandName: string;
  brandColor: string;
}

// Mock data - in production, fetch from API
const mockSites: Site[] = [
  {
    id: '1',
    name: 'London Food Tours',
    slug: 'london-food-tours',
    status: 'ACTIVE',
    domain: 'london-food-tours.com',
    isAutomatic: true,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    publishedAt: new Date(Date.now() - 23 * 86400000).toISOString(),
    monthlyVisitors: 12450,
    monthlyBookings: 89,
    monthlyRevenue: 4235.50,
    contentCount: 24,
    brandName: 'London Food Tours',
    brandColor: '#6366f1',
  },
  {
    id: '2',
    name: 'Paris Walking Tours',
    slug: 'paris-walking-tours',
    status: 'ACTIVE',
    domain: 'paris-walking-tours.com',
    isAutomatic: true,
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    publishedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    monthlyVisitors: 8920,
    monthlyBookings: 56,
    monthlyRevenue: 2841.00,
    contentCount: 18,
    brandName: 'Paris Walking Tours',
    brandColor: '#8b5cf6',
  },
  {
    id: '3',
    name: 'Barcelona Wine Tours',
    slug: 'barcelona-wine-tours',
    status: 'REVIEW',
    domain: null,
    isAutomatic: true,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    publishedAt: null,
    monthlyVisitors: 0,
    monthlyBookings: 0,
    monthlyRevenue: 0,
    contentCount: 12,
    brandName: 'Barcelona Wine Tours',
    brandColor: '#ec4899',
  },
];

export default function SitesPage() {
  const [sites] = useState<Site[]>(mockSites);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredSites = sites.filter(
    (site) => statusFilter === 'all' || site.status === statusFilter
  );

  const stats = {
    total: sites.length,
    active: sites.filter((s) => s.status === 'ACTIVE').length,
    draft: sites.filter((s) => s.status === 'DRAFT' || s.status === 'REVIEW').length,
    totalVisitors: sites.reduce((sum, s) => sum + s.monthlyVisitors, 0),
    totalRevenue: sites.reduce((sum, s) => sum + s.monthlyRevenue, 0),
  };

  const getStatusBadge = (status: Site['status']) => {
    const styles = {
      DRAFT: 'bg-gray-100 text-gray-800',
      REVIEW: 'bg-amber-100 text-amber-800',
      ACTIVE: 'bg-green-100 text-green-800',
      PAUSED: 'bg-blue-100 text-blue-800',
      ARCHIVED: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`${styles[status]} text-xs px-2 py-1 rounded font-medium`}>{status}</span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Site Portfolio</h1>
          <p className="text-slate-500 mt-1">Manage your multi-site marketplace network</p>
        </div>
        <button className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium transition-colors">
          Create Site
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-sm text-slate-500">Total Sites</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            <p className="text-sm text-slate-500">Active</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{stats.draft}</p>
            <p className="text-sm text-slate-500">In Progress</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">
              {(stats.totalVisitors / 1000).toFixed(1)}k
            </p>
            <p className="text-sm text-slate-500">Monthly Visitors</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-purple-600">
              ${(stats.totalRevenue / 1000).toFixed(1)}k
            </p>
            <p className="text-sm text-slate-500">Monthly Revenue</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="all">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="REVIEW">In Review</option>
          <option value="DRAFT">Draft</option>
          <option value="PAUSED">Paused</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {/* Sites grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredSites.map((site) => (
          <Card key={site.id} className="overflow-hidden hover:shadow-lg transition-all">
            <div
              className="h-2"
              style={{ backgroundColor: site.brandColor }}
            />
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-slate-900">{site.name}</h3>
                    {getStatusBadge(site.status)}
                  </div>
                  {site.domain ? (
                    <a
                      href={`https://${site.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-sky-600 hover:underline flex items-center gap-1"
                    >
                      {site.domain}
                      <span className="text-xs">↗</span>
                    </a>
                  ) : (
                    <p className="text-sm text-slate-500">No domain configured</p>
                  )}
                </div>
                {site.isAutomatic && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                    🤖 Auto
                  </span>
                )}
              </div>

              {/* Metrics */}
              {site.status === 'ACTIVE' ? (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <div className="text-lg font-bold text-slate-900">
                      {(site.monthlyVisitors / 1000).toFixed(1)}k
                    </div>
                    <div className="text-xs text-slate-500">Visitors/mo</div>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <div className="text-lg font-bold text-slate-900">{site.monthlyBookings}</div>
                    <div className="text-xs text-slate-500">Bookings/mo</div>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <div className="text-lg font-bold text-slate-900">
                      ${(site.monthlyRevenue / 1000).toFixed(1)}k
                    </div>
                    <div className="text-xs text-slate-500">Revenue/mo</div>
                  </div>
                </div>
              ) : (
                <div className="mb-4 p-3 bg-amber-50 rounded-lg">
                  <div className="text-sm text-amber-800">
                    {site.status === 'REVIEW' && '⏳ Site pending review and approval'}
                    {site.status === 'DRAFT' && '📝 Site in draft mode'}
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                <span>{site.contentCount} pages</span>
                <span>Created {new Date(site.createdAt).toLocaleDateString()}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button className="flex-1 px-3 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors">
                  View Details
                </button>
                <button className="flex-1 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium transition-colors">
                  Manage
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredSites.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-4xl mb-4">🌐</div>
            <h3 className="text-lg font-medium text-slate-900">No sites found</h3>
            <p className="text-slate-500 mt-1">Try adjusting your filters or create a new site</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
