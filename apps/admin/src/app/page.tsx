"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@experience-marketplace/ui-components";

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

interface RecentActivity {
  id: string;
  type: "site_created" | "content_approved" | "booking" | "seo_update";
  message: string;
  timestamp: string;
}

// Mock data - would be fetched from API
const mockStats: DashboardStats = {
  totalSites: 12,
  activeSites: 8,
  totalBookings: 156,
  totalRevenue: 28450.0,
  contentPending: 5,
  conversionRate: 4.2,
  changes: {
    sites: 25,
    bookings: 8,
    revenue: 15,
  },
};

const mockRecentActivity: RecentActivity[] = [
  {
    id: "1",
    type: "site_created",
    message: "New site 'Barcelona Adventures' created",
    timestamp: "2 hours ago",
  },
  {
    id: "2",
    type: "booking",
    message: "New booking on 'London Explorer'",
    timestamp: "4 hours ago",
  },
  {
    id: "3",
    type: "content_approved",
    message: "Content approved for 'Paris Highlights'",
    timestamp: "6 hours ago",
  },
  {
    id: "4",
    type: "seo_update",
    message: "SEO meta updated for 'Tokyo Food Tours'",
    timestamp: "1 day ago",
  },
];

export default function AdminDashboardPage() {
  const [stats] = useState<DashboardStats>(mockStats);
  const [activity] = useState<RecentActivity[]>(mockRecentActivity);
  const [isLoading, setIsLoading] = useState(false);

  const refreshData = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
  };

  const getActivityIcon = (type: RecentActivity["type"]) => {
    switch (type) {
      case "site_created":
        return "🌐";
      case "content_approved":
        return "✅";
      case "booking":
        return "📅";
      case "seo_update":
        return "🔍";
    }
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Overview of your Experience Marketplace platform
          </p>
        </div>
        <button
          onClick={refreshData}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <span className={isLoading ? "animate-spin" : ""}>🔄</span>
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
          subvalue="This month"
          change={stats.changes.bookings}
          icon="📅"
        />
        <StatCard
          title="Total Revenue"
          value={`£${stats.totalRevenue.toLocaleString()}`}
          subvalue="This month"
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
                {stats.contentPending} content item{stats.contentPending > 1 ? "s" : ""} pending review
              </p>
              <p className="text-sm text-amber-700">
                Review and approve AI-generated content
              </p>
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

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Top Sites */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Top Performing Sites</CardTitle>
            <Link
              href="/sites"
              className="text-sm text-sky-600 hover:underline"
            >
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
                  {[
                    { name: "London Explorer", domain: "london.example.com", bookings: 45, revenue: 8250 },
                    { name: "Paris Highlights", domain: "paris.example.com", bookings: 32, revenue: 5840 },
                    { name: "Barcelona Adventures", domain: "barcelona.example.com", bookings: 28, revenue: 4920 },
                  ].map((site, index) => (
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
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activity.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <div className="mt-0.5">{getActivityIcon(item.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 leading-snug">{item.message}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

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
          <span className="text-slate-400 group-hover:text-sky-600 group-hover:translate-x-0.5 transition-all">→</span>
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
          <span className="text-slate-400 group-hover:text-cyan-600 group-hover:translate-x-0.5 transition-all">→</span>
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
          <span className="text-slate-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all">→</span>
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
    <div className={`bg-white rounded-xl border border-slate-200 p-6 ${href ? "hover:border-sky-300 hover:shadow-sm transition-all cursor-pointer" : ""}`}>
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
                change >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {change >= 0 ? "↑" : "↓"} {Math.abs(change)}%
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
