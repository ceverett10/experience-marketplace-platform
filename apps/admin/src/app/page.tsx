'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@experience-marketplace/ui-components';

interface DashboardStats {
  totalSites: number;
  activeSites: number;
  totalBookings: number;
  totalRevenue: number;
  contentPending: number;
  conversionRate: number;
  changes: {
    sites: number;
    bookings: number;
    revenue: number;
  };
}

interface TopSite {
  id: string;
  name: string;
  domain: string;
  bookings: number;
  revenue: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topSites, setTopSites] = useState<TopSite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const response = await fetch(`${basePath}/api/dashboard`);

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const data = await response.json();
      setStats(data.stats);
      setTopSites(data.topSites || []);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const refreshData = async () => {
    await fetchData();
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={refreshData}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Overview of your Experience Marketplace platform</p>
        </div>
        <button
          onClick={refreshData}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <span className={isLoading ? 'animate-spin' : ''}>🔄</span>
          Refresh
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Sites"
          value={stats.totalSites.toString()}
          subvalue={`${stats.activeSites} active`}
          change={stats.changes.sites}
          icon="🌐"
          href="/sites"
        />
        <StatCard
          title="Total Bookings"
          value={stats.totalBookings.toString()}
          subvalue="Last 30 days"
          change={stats.changes.bookings}
          icon="📅"
        />
        <StatCard
          title="Total Revenue"
          value={`£${stats.totalRevenue.toLocaleString()}`}
          subvalue="Last 30 days"
          change={stats.changes.revenue}
          icon="💰"
        />
        <StatCard
          title="Conversion Rate"
          value={`${stats.conversionRate}%`}
          subvalue="Click to booking"
          icon="📈"
          neutral
        />
      </div>

      {/* Pending content alert */}
      {stats.contentPending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-amber-100 rounded-lg flex items-center justify-center">
              ⏳
            </div>
            <div>
              <p className="font-medium text-amber-900">
                {stats.contentPending} content item{stats.contentPending > 1 ? 's' : ''} pending
                review
              </p>
              <p className="text-sm text-amber-700">Review and approve AI-generated content</p>
            </div>
          </div>
          <Link
            href="/content"
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Review Content
          </Link>
        </div>
      )}

      {/* Top Sites */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Top Performing Sites</CardTitle>
          <Link href="/sites" className="text-sm text-sky-600 hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-slate-500 border-b border-slate-100">
                  <th className="pb-3 font-medium">Site</th>
                  <th className="pb-3 font-medium text-right">Bookings</th>
                  <th className="pb-3 font-medium text-right">Revenue</th>
                  <th className="pb-3 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topSites.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      No sites found. Create your first site to get started.
                    </td>
                  </tr>
                ) : (
                  topSites.map((site, index) => (
                    <tr key={site.domain} className="hover:bg-slate-50">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 bg-gradient-to-br from-sky-500 to-sky-400 rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{site.name}</p>
                            <p className="text-xs text-slate-500">{site.domain}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-right text-slate-900 font-medium tabular-nums">
                        {site.bookings}
                      </td>
                      <td className="py-3 text-right text-slate-900 font-medium tabular-nums">
                        £{site.revenue.toLocaleString()}
                      </td>
                      <td className="py-3 text-right">
                        <a
                          href={`https://${site.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-sky-600"
                        >
                          🔗
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Link
          href="/sites"
          className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-sky-300 hover:shadow-sm transition-all group"
        >
          <div className="h-12 w-12 bg-sky-50 rounded-xl flex items-center justify-center text-2xl">
            🌐
          </div>
          <div className="flex-1">
            <p className="font-medium text-slate-900">Manage Sites</p>
            <p className="text-sm text-slate-500">Create & configure storefronts</p>
          </div>
          <span className="text-slate-400 group-hover:text-sky-600 group-hover:translate-x-0.5 transition-all">
            →
          </span>
        </Link>

        <Link
          href="/content"
          className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-sky-300 hover:shadow-sm transition-all group"
        >
          <div className="h-12 w-12 bg-cyan-50 rounded-xl flex items-center justify-center text-2xl">
            📝
          </div>
          <div className="flex-1">
            <p className="font-medium text-slate-900">Content Management</p>
            <p className="text-sm text-slate-500">Review AI-generated content</p>
          </div>
          <span className="text-slate-400 group-hover:text-cyan-600 group-hover:translate-x-0.5 transition-all">
            →
          </span>
        </Link>

        <Link
          href="/settings"
          className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-sky-300 hover:shadow-sm transition-all group"
        >
          <div className="h-12 w-12 bg-purple-50 rounded-xl flex items-center justify-center text-2xl">
            ⚙️
          </div>
          <div className="flex-1">
            <p className="font-medium text-slate-900">Platform Settings</p>
            <p className="text-sm text-slate-500">Configure global settings</p>
          </div>
          <span className="text-slate-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all">
            →
          </span>
        </Link>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subvalue: string;
  change?: number;
  icon: string;
  href?: string;
  neutral?: boolean;
}

function StatCard({ title, value, subvalue, change, icon, href, neutral }: StatCardProps) {
  const content = (
    <div
      className={`bg-white rounded-xl border border-slate-200 p-6 ${href ? 'hover:border-sky-300 hover:shadow-sm transition-all cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        <div className="h-10 w-10 bg-sky-50 rounded-xl flex items-center justify-center text-xl">
          {icon}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">{subvalue}</span>
          {change !== undefined && !neutral && (
            <span
              className={`flex items-center text-sm font-medium ${
                change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
