'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface DashboardData {
  health: 'healthy' | 'degraded' | 'critical';
  metrics: {
    activeNow: number;
    completedToday: number;
    failedToday: number;
    successRate: number;
    avgDurationMs: number;
    throughputPerHour: number;
  };
  queues: Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
    health: string;
  }>;
  queueTotals: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  recentFailures: Array<{
    id: string;
    type: string;
    error: string | null;
    attempts: number;
    siteName: string | null;
    failedAt: string;
  }>;
  scheduledJobs: Array<{
    jobType: string;
    schedule: string;
    description: string;
    lastRun: {
      status: string;
      createdAt: string;
      completedAt: string | null;
    } | null;
  }>;
  circuitBreakers: Record<
    string,
    {
      state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
      metrics: { failures: number; successes: number };
    }
  >;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function OperationsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
        const response = await fetch(`${basePath}/api/operations/dashboard`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${response.status}`);
        }
        const json = await response.json();
        setData(json);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch dashboard:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-48 bg-slate-100 rounded animate-pulse mt-2" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-10 w-40 bg-slate-200 rounded-lg animate-pulse" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-slate-300 rounded-full animate-pulse" />
              <div className="h-4 w-8 bg-slate-100 rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-7 w-12 bg-slate-200 rounded animate-pulse mb-1" />
                <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div>
          <div className="h-6 w-28 bg-slate-200 rounded animate-pulse mb-3" />
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-4 w-14 bg-slate-200 rounded animate-pulse" />
                    <div className="h-4 w-14 bg-slate-100 rounded animate-pulse" />
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div key={j}>
                        <div className="h-4 w-5 mx-auto bg-slate-200 rounded animate-pulse mb-1" />
                        <div className="h-3 w-6 mx-auto bg-slate-100 rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <div className="p-6">
                <div className="h-6 w-36 bg-slate-200 rounded animate-pulse mb-4" />
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operations Dashboard</h1>
          <p className="text-slate-500 mt-1">System health and job pipeline overview</p>
        </div>
        <Card>
          <div className="p-8 text-center">
            <div className="text-4xl mb-4">&#9888;&#65039;</div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Dashboard Unavailable</h2>
            <p className="text-sm text-slate-600 mb-4">{error}</p>
            <p className="text-xs text-slate-400">Retrying automatically every 5 seconds...</p>
          </div>
        </Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/operations/jobs">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6 text-center">
                <h3 className="font-medium text-slate-900">Job Explorer</h3>
                <p className="text-sm text-slate-500 mt-1">Search, filter, and inspect all jobs</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/operations/errors">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6 text-center">
                <h3 className="font-medium text-slate-900">Error Log</h3>
                <p className="text-sm text-slate-500 mt-1">Investigate errors with stack traces</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/operations/schedules">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6 text-center">
                <h3 className="font-medium text-slate-900">Scheduled Jobs</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Monitor cron jobs and trigger manually
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const healthColors = {
    healthy: 'bg-green-100 text-green-800 border-green-200',
    degraded: 'bg-amber-100 text-amber-800 border-amber-200',
    critical: 'bg-red-100 text-red-800 border-red-200',
  };

  const queueHealthColors: Record<string, string> = {
    healthy: 'text-green-600 bg-green-50',
    warning: 'text-amber-600 bg-amber-50',
    critical: 'text-red-600 bg-red-50',
    paused: 'text-slate-600 bg-slate-100',
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      COMPLETED: 'bg-green-100 text-green-800',
      FAILED: 'bg-red-100 text-red-800',
      RUNNING: 'bg-blue-100 text-blue-800',
      PENDING: 'bg-slate-100 text-slate-800',
    };
    return (
      <span
        className={`text-xs px-2 py-0.5 rounded font-medium ${colors[status] || 'bg-slate-100 text-slate-800'}`}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operations Dashboard</h1>
          <p className="text-slate-500 mt-1">System health and job pipeline overview</p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-4 py-2 rounded-lg border font-medium ${healthColors[data.health]}`}>
            System {data.health.toUpperCase()}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-slate-500">Live</span>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{data.metrics.activeNow}</p>
            <p className="text-sm text-slate-500">Active Now</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-emerald-600">{data.metrics.completedToday}</p>
            <p className="text-sm text-slate-500">Completed Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-red-600">{data.metrics.failedToday}</p>
            <p className="text-sm text-slate-500">Failed Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-sky-600">{data.metrics.successRate}%</p>
            <p className="text-sm text-slate-500">Success Rate (24h)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-purple-600">
              {formatDuration(data.metrics.avgDurationMs)}
            </p>
            <p className="text-sm text-slate-500">Avg Duration</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-700">{data.metrics.throughputPerHour}</p>
            <p className="text-sm text-slate-500">Jobs/Hour</p>
          </CardContent>
        </Card>
      </div>

      {/* Queue Health Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Queue Health</h2>
          <Link href="/operations/jobs" className="text-sm text-sky-600 hover:text-sky-700">
            View all jobs
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {data.queues.map((q) => (
            <Link key={q.name} href={`/operations/jobs?queue=${q.name}`} className="block">
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-slate-900 capitalize">{q.name}</h3>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${queueHealthColors[q.health] || ''}`}
                    >
                      {q.paused ? 'paused' : q.health}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center text-xs">
                    <div>
                      <div className="font-bold text-blue-600">{q.waiting}</div>
                      <div className="text-slate-400">wait</div>
                    </div>
                    <div>
                      <div className="font-bold text-green-600">{q.active}</div>
                      <div className="text-slate-400">run</div>
                    </div>
                    <div>
                      <div className="font-bold text-red-600">{q.failed}</div>
                      <div className="text-slate-400">fail</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Two-column: Recent Failures + Scheduled Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Failures */}
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Recent Failures</h2>
              <Link
                href="/operations/jobs?status=FAILED"
                className="text-sm text-sky-600 hover:text-sky-700"
              >
                View all
              </Link>
            </div>
            <div className="space-y-3">
              {data.recentFailures.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">No recent failures</p>
              ) : (
                data.recentFailures.map((f) => (
                  <div key={f.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-900">
                          {f.type.replace(/_/g, ' ')}
                        </span>
                        {f.siteName && <span className="text-xs text-slate-500">{f.siteName}</span>}
                      </div>
                      {f.error && <p className="text-xs text-red-600 truncate">{f.error}</p>}
                      <div className="text-xs text-slate-400 mt-1">
                        {timeAgo(f.failedAt)} · Attempt {f.attempts}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        {/* Scheduled Jobs */}
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Scheduled Jobs</h2>
              <Link
                href="/operations/schedules"
                className="text-sm text-sky-600 hover:text-sky-700"
              >
                View details
              </Link>
            </div>
            <div className="space-y-3">
              {data.scheduledJobs.map((sj) => (
                <div
                  key={sj.jobType}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900">
                      {sj.jobType.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{sj.schedule}</div>
                  </div>
                  <div className="text-right ml-3">
                    {sj.lastRun ? (
                      <>
                        {statusBadge(sj.lastRun.status)}
                        <div className="text-xs text-slate-400 mt-1">
                          {timeAgo(sj.lastRun.createdAt)}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Never run</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Circuit Breakers (only shown if any are not CLOSED) */}
      {Object.values(data.circuitBreakers).some((cb) => cb.state !== 'CLOSED') && (
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Circuit Breakers</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(data.circuitBreakers)
                .filter(([, status]) => status.state !== 'CLOSED')
                .map(([service, status]) => {
                  const stateColors: Record<string, string> = {
                    OPEN: 'bg-red-100 text-red-800',
                    HALF_OPEN: 'bg-amber-100 text-amber-800',
                  };
                  return (
                    <div key={service} className="p-4 border border-slate-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-slate-900 capitalize">
                          {service.replace(/-/g, ' ')}
                        </h3>
                        <span
                          className={`text-xs px-2 py-1 rounded font-medium ${stateColors[status.state] || ''}`}
                        >
                          {status.state}
                        </span>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <div>
                          <span className="text-slate-500">Failures:</span>{' '}
                          <span className="font-medium text-red-600">
                            {status.metrics.failures}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Successes:</span>{' '}
                          <span className="font-medium text-green-600">
                            {status.metrics.successes}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </Card>
      )}

      {/* Quick Navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/operations/jobs">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6 text-center">
              <div className="text-2xl mb-2">&#128269;</div>
              <h3 className="font-medium text-slate-900">Job Explorer</h3>
              <p className="text-sm text-slate-500 mt-1">Search, filter, and inspect all jobs</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/operations/errors">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6 text-center">
              <div className="text-2xl mb-2">&#128680;</div>
              <h3 className="font-medium text-slate-900">Error Log</h3>
              <p className="text-sm text-slate-500 mt-1">Investigate errors with stack traces</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/operations/schedules">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6 text-center">
              <div className="text-2xl mb-2">&#128339;</div>
              <h3 className="font-medium text-slate-900">Scheduled Jobs</h3>
              <p className="text-sm text-slate-500 mt-1">Monitor cron jobs and trigger manually</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
