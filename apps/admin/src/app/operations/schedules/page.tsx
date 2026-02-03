'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface ScheduleExecution {
  id: string;
  status: string;
  siteName: string | null;
  error: string | null;
  createdAt: string;
  durationMs: number | null;
}

interface ScheduledJob {
  jobType: string;
  schedule: string;
  description: string;
  lastExecution: {
    id: string;
    status: string;
    error: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
  } | null;
  recentHistory: ScheduleExecution[];
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

/**
 * Parse a cron expression into a human-readable description
 */
function cronToHuman(cron: string): string {
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  if (hour === '*' && minute === '0') return 'Every hour';
  if (hour?.startsWith('*/')) return `Every ${hour.replace('*/', '')} hours`;

  const dayNames: Record<string, string> = {
    '0': 'Sundays',
    '1': 'Mondays',
    '4': 'Thursdays',
    '1,4': 'Mon & Thu',
  };

  const timeStr = `${hour?.padStart(2, '0')}:${minute?.padStart(2, '0')}`;

  if (dayOfWeek !== '*') {
    const dayName = dayNames[dayOfWeek!] || `day ${dayOfWeek}`;
    return `${dayName} at ${timeStr}`;
  }

  if (dayOfMonth !== '*') return `Day ${dayOfMonth} at ${timeStr}`;

  return `Daily at ${timeStr}`;
}

export default function ScheduledJobsPage() {
  const [schedules, setSchedules] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
        const response = await fetch(`${basePath}/api/operations/schedules`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setSchedules(data.schedules || []);
      } catch (error) {
        console.error('Failed to fetch schedules:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedules();
    const interval = setInterval(fetchSchedules, 15000);
    return () => clearInterval(interval);
  }, []);

  const triggerJob = async (jobType: string) => {
    setTriggerLoading(jobType);
    try {
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const response = await fetch(`${basePath}/api/operations/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger', jobType }),
      });
      const data = await response.json();
      if (data.success) {
        // Refresh to show the new job
        const res = await fetch(`${basePath}/api/operations/schedules`);
        const refreshed = await res.json();
        setSchedules(refreshed.schedules || []);
      }
    } catch (error) {
      console.error('Failed to trigger job:', error);
    } finally {
      setTriggerLoading(null);
    }
  };

  const statusColors: Record<string, string> = {
    COMPLETED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    RUNNING: 'bg-blue-100 text-blue-800',
    PENDING: 'bg-slate-100 text-slate-800',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-72 bg-slate-100 rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-7 w-10 bg-slate-200 rounded animate-pulse mb-1" />
                <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3">
                    <div className="h-3 w-8 bg-slate-200 rounded animate-pulse" />
                  </th>
                  <th className="px-4 py-3">
                    <div className="h-3 w-16 bg-slate-200 rounded animate-pulse" />
                  </th>
                  <th className="px-4 py-3">
                    <div className="h-3 w-16 bg-slate-200 rounded animate-pulse" />
                  </th>
                  <th className="px-4 py-3">
                    <div className="h-3 w-12 bg-slate-200 rounded animate-pulse" />
                  </th>
                  <th className="px-4 py-3">
                    <div className="h-3 w-16 bg-slate-200 rounded animate-pulse" />
                  </th>
                  <th className="px-4 py-3">
                    <div className="h-3 w-12 bg-slate-200 rounded animate-pulse" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-4">
                      <div className="h-4 w-32 bg-slate-200 rounded mb-1" />
                      <div className="h-3 w-48 bg-slate-100 rounded" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-24 bg-slate-200 rounded mb-1" />
                      <div className="h-3 w-20 bg-slate-100 rounded" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-16 bg-slate-200 rounded" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-5 w-20 bg-slate-200 rounded" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-12 bg-slate-200 rounded" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-7 w-16 bg-slate-200 rounded" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Scheduled Jobs</h1>
        <p className="text-slate-500 mt-1">
          Monitor automated cron jobs and trigger manual executions
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-700">{schedules.length}</p>
            <p className="text-sm text-slate-500">Total Schedules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">
              {schedules.filter((s) => s.lastExecution?.status === 'COMPLETED').length}
            </p>
            <p className="text-sm text-slate-500">Last Run OK</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-red-600">
              {schedules.filter((s) => s.lastExecution?.status === 'FAILED').length}
            </p>
            <p className="text-sm text-slate-500">Last Run Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-500">
              {schedules.filter((s) => !s.lastExecution).length}
            </p>
            <p className="text-sm text-slate-500">Never Run</p>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Job
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Schedule
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Last Run
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedules.map((sj) => (
                <React.Fragment key={sj.jobType}>
                  <tr
                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${expandedJob === sj.jobType ? 'bg-sky-50' : ''}`}
                    onClick={() => setExpandedJob(expandedJob === sj.jobType ? null : sj.jobType)}
                  >
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-slate-900">
                        {sj.jobType.replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{sj.description}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-slate-900">{cronToHuman(sj.schedule)}</div>
                      <div className="text-xs text-slate-400 font-mono">{sj.schedule}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      {sj.lastExecution ? timeAgo(sj.lastExecution.createdAt) : 'Never'}
                    </td>
                    <td className="px-4 py-4">
                      {sj.lastExecution ? (
                        <span
                          className={`text-xs px-2 py-1 rounded font-medium ${statusColors[sj.lastExecution.status] || ''}`}
                        >
                          {sj.lastExecution.status}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      {formatDuration(sj.lastExecution?.durationMs ?? null)}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerJob(sj.jobType);
                        }}
                        disabled={triggerLoading !== null}
                        className="px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {triggerLoading === sj.jobType && (
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                        )}
                        {triggerLoading === sj.jobType ? 'Triggering...' : 'Run Now'}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded: Execution History */}
                  {expandedJob === sj.jobType && sj.recentHistory.length > 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 bg-slate-50 border-t border-slate-200">
                        <h4 className="text-sm font-medium text-slate-700 mb-3">
                          Recent Executions ({sj.recentHistory.length})
                        </h4>
                        <div className="space-y-2">
                          {sj.recentHistory.map((exec) => (
                            <div
                              key={exec.id}
                              className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded font-medium ${statusColors[exec.status] || ''}`}
                                >
                                  {exec.status}
                                </span>
                                <span className="text-sm text-slate-600">
                                  {formatDate(exec.createdAt)}
                                </span>
                                {exec.siteName && (
                                  <span className="text-xs text-slate-400">{exec.siteName}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-slate-600">
                                  {formatDuration(exec.durationMs)}
                                </span>
                                {exec.error && (
                                  <span className="text-xs text-red-600 max-w-[200px] truncate">
                                    {exec.error}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}

                  {expandedJob === sj.jobType && sj.recentHistory.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-4 bg-slate-50 border-t border-slate-200 text-center text-sm text-slate-500"
                      >
                        No execution history available
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
