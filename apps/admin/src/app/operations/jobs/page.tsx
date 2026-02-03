'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface Job {
  id: string;
  type: string;
  queue: string;
  status: string;
  siteId: string | null;
  siteName: string | null;
  priority: number;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  hasResult: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

interface JobDetail extends Job {
  payload: any;
  result: any;
  scheduledFor: string | null;
  errorLogs: Array<{
    id: string;
    errorName: string;
    errorMessage: string;
    errorCategory: string;
    errorSeverity: string;
    stackTrace: string | null;
    context: any;
    attemptNumber: number;
    createdAt: string;
  }>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Stats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const STATUS_OPTIONS = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SCHEDULED', 'CANCELLED'];

const JOB_TYPES = [
  'SITE_CREATE', 'SITE_UPDATE', 'GSC_SYNC', 'SEO_ANALYZE', 'SEO_OPTIMIZE',
  'SEO_OPPORTUNITY_SCAN', 'CONTENT_GENERATE', 'CONTENT_OPTIMIZE', 'CONTENT_PUBLISH',
  'DOMAIN_VERIFY', 'DOMAIN_SSL', 'METRICS_AGGREGATE', 'PERFORMANCE_REPORT',
  'ABTEST_CREATE', 'ABTEST_REBALANCE', 'ABTEST_ANALYZE',
  'LINK_OPPORTUNITY_SCAN', 'LINK_BACKLINK_MONITOR', 'LINK_OUTREACH_GENERATE', 'LINK_ASSET_GENERATE',
];

const QUEUES = ['content', 'seo', 'gsc', 'site', 'domain', 'analytics', 'abtest'];

export default function JobExplorerPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-slate-500">Loading job explorer...</div></div>}>
      <JobExplorerContent />
    </Suspense>
  );
}

function JobExplorerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Filters from URL
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [type, setType] = useState(searchParams.get('type') || '');
  const [queue, setQueue] = useState(searchParams.get('queue') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));
  const [limit, setLimit] = useState(parseInt(searchParams.get('limit') || '25'));

  const [jobs, setJobs] = useState<Job[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<Stats>({ pending: 0, running: 0, completed: 0, failed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      if (queue) params.set('queue', queue);
      if (search) params.set('search', search);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const response = await fetch(`/admin/api/operations/jobs?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setJobs(data.jobs || []);
      setPagination(data.pagination);
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setLoading(false);
    }
  }, [status, type, queue, search, page, limit]);

  useEffect(() => {
    setLoading(true);
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (queue) params.set('queue', queue);
    if (search) params.set('search', search);
    if (page > 1) params.set('page', String(page));
    if (limit !== 25) params.set('limit', String(limit));
    const newUrl = `/operations/jobs${params.toString() ? `?${params.toString()}` : ''}`;
    router.replace(newUrl, { scroll: false });
  }, [status, type, queue, search, page, limit, router]);

  const fetchJobDetail = async (jobId: string) => {
    setDetailLoading(true);
    try {
      const response = await fetch('/admin/api/operations/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-detail', jobId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setJobDetail(data);
    } catch (error) {
      console.error('Failed to fetch job detail:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRowClick = (jobId: string) => {
    if (expandedJob === jobId) {
      setExpandedJob(null);
      setJobDetail(null);
    } else {
      setExpandedJob(jobId);
      fetchJobDetail(jobId);
    }
  };

  const handleRetry = async (jobId: string) => {
    setActionLoading(true);
    try {
      await fetch('/admin/api/operations/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', jobId }),
      });
      fetchJobs();
    } catch (error) {
      console.error('Failed to retry job:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkRetry = async () => {
    if (!confirm('Retry all failed jobs matching current filters?')) return;
    setActionLoading(true);
    try {
      const filter: any = {};
      if (type) filter.type = type;
      await fetch('/admin/api/operations/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk-retry', filter }),
      });
      fetchJobs();
    } catch (error) {
      console.error('Failed to bulk retry:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const clearFilters = () => {
    setStatus('');
    setType('');
    setQueue('');
    setSearch('');
    setPage(1);
  };

  const statusColors: Record<string, string> = {
    PENDING: 'bg-slate-100 text-slate-800',
    SCHEDULED: 'bg-purple-100 text-purple-800',
    RUNNING: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-slate-100 text-slate-600',
    RETRYING: 'bg-amber-100 text-amber-800',
  };

  const durationColor = (ms: number | null) => {
    if (ms === null) return '';
    if (ms < 30000) return 'text-green-600';
    if (ms < 120000) return 'text-amber-600';
    return 'text-red-600';
  };

  const severityColors: Record<string, string> = {
    LOW: 'bg-slate-100 text-slate-700',
    MEDIUM: 'bg-amber-100 text-amber-800',
    HIGH: 'bg-orange-100 text-orange-800',
    CRITICAL: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Explorer</h1>
          <p className="text-slate-500 mt-1">Search, filter, and inspect all jobs</p>
        </div>
        <div className="flex items-center gap-2">
          {stats.failed > 0 && (
            <button
              onClick={handleBulkRetry}
              disabled={actionLoading}
              className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Retry All Failed ({stats.failed})
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-700', filter: '' },
          { label: 'Pending', value: stats.pending, color: 'text-slate-600', filter: 'PENDING' },
          { label: 'Running', value: stats.running, color: 'text-blue-600', filter: 'RUNNING' },
          { label: 'Completed', value: stats.completed, color: 'text-green-600', filter: 'COMPLETED' },
          { label: 'Failed', value: stats.failed, color: 'text-red-600', filter: 'FAILED' },
        ].map((s) => (
          <Card
            key={s.label}
            className={`cursor-pointer hover:shadow-md transition-shadow ${status === s.filter ? 'ring-2 ring-sky-500' : ''}`}
            onClick={() => { setStatus(s.filter); setPage(1); }}
          >
            <CardContent className="p-3">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Types</option>
              {JOB_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>

            <select
              value={queue}
              onChange={(e) => { setQueue(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Queues</option>
              {QUEUES.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by job ID..."
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 w-48"
            />

            {(status || type || queue || search) && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Clear filters
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-500">Per page:</span>
              <select
                value={limit}
                onChange={(e) => { setLimit(parseInt(e.target.value)); setPage(1); }}
                className="px-2 py-1 border border-slate-200 rounded text-sm"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Site</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Attempts</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Error</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    Loading jobs...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    No jobs match your filters
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <React.Fragment key={job.id}>
                    <tr
                      className={`hover:bg-slate-50 cursor-pointer transition-colors ${expandedJob === job.id ? 'bg-sky-50' : ''}`}
                      onClick={() => handleRowClick(job.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">
                          {job.type.replace(/_/g, ' ')}
                        </div>
                        <div className="text-xs text-slate-400">{job.queue}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {job.siteName || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${statusColors[job.status] || ''}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {timeAgo(job.createdAt)}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium ${durationColor(job.durationMs)}`}>
                        {formatDuration(job.durationMs)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {job.attempts}/{job.maxAttempts}
                      </td>
                      <td className="px-4 py-3">
                        {job.error && (
                          <span className="text-xs text-red-600 line-clamp-1 max-w-[200px] block">
                            {job.error}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {job.status === 'FAILED' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetry(job.id);
                            }}
                            disabled={actionLoading}
                            className="px-2 py-1 text-xs bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors disabled:opacity-50"
                          >
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Expanded Detail */}
                    {expandedJob === job.id && (
                      <tr>
                        <td colSpan={8} className="px-4 py-4 bg-slate-50 border-t border-slate-200">
                          {detailLoading ? (
                            <div className="text-center py-4 text-slate-500">Loading details...</div>
                          ) : jobDetail ? (
                            <div className="space-y-4">
                              {/* Timeline */}
                              <div className="flex flex-wrap gap-6 text-sm">
                                <div>
                                  <span className="text-slate-500">Created:</span>{' '}
                                  <span className="font-medium">{formatDate(jobDetail.createdAt)}</span>
                                </div>
                                {jobDetail.startedAt && (
                                  <div>
                                    <span className="text-slate-500">Started:</span>{' '}
                                    <span className="font-medium">{formatDate(jobDetail.startedAt)}</span>
                                  </div>
                                )}
                                {jobDetail.completedAt && (
                                  <div>
                                    <span className="text-slate-500">Completed:</span>{' '}
                                    <span className="font-medium">{formatDate(jobDetail.completedAt)}</span>
                                  </div>
                                )}
                                {jobDetail.durationMs !== null && (
                                  <div>
                                    <span className="text-slate-500">Duration:</span>{' '}
                                    <span className={`font-medium ${durationColor(jobDetail.durationMs)}`}>
                                      {formatDuration(jobDetail.durationMs)}
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-slate-500">ID:</span>{' '}
                                  <span className="font-mono text-xs">{jobDetail.id}</span>
                                </div>
                              </div>

                              {/* Payload */}
                              {jobDetail.payload && (
                                <div>
                                  <h4 className="text-sm font-medium text-slate-700 mb-1">Payload</h4>
                                  <pre className="p-3 bg-white border border-slate-200 rounded-lg text-xs overflow-x-auto max-h-40">
                                    {JSON.stringify(jobDetail.payload, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* Result */}
                              {jobDetail.result && (
                                <div>
                                  <h4 className="text-sm font-medium text-slate-700 mb-1">Result</h4>
                                  <pre className="p-3 bg-white border border-slate-200 rounded-lg text-xs overflow-x-auto max-h-40">
                                    {JSON.stringify(jobDetail.result, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* Error (full) */}
                              {jobDetail.error && (
                                <div>
                                  <h4 className="text-sm font-medium text-red-700 mb-1">Error</h4>
                                  <pre className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 overflow-x-auto max-h-40 whitespace-pre-wrap">
                                    {jobDetail.error}
                                  </pre>
                                </div>
                              )}

                              {/* Error Logs */}
                              {jobDetail.errorLogs && jobDetail.errorLogs.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium text-slate-700 mb-2">
                                    Error History ({jobDetail.errorLogs.length})
                                  </h4>
                                  <div className="space-y-2">
                                    {jobDetail.errorLogs.map((el) => (
                                      <div key={el.id} className="p-3 bg-white border border-slate-200 rounded-lg">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${severityColors[el.errorSeverity] || ''}`}>
                                            {el.errorSeverity}
                                          </span>
                                          <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                            {el.errorCategory}
                                          </span>
                                          <span className="text-xs text-slate-500">
                                            Attempt {el.attemptNumber} · {formatDate(el.createdAt)}
                                          </span>
                                        </div>
                                        <p className="text-sm font-medium text-slate-900">{el.errorName}</p>
                                        <p className="text-xs text-slate-600 mt-0.5">{el.errorMessage}</p>
                                        {el.stackTrace && (
                                          <details className="mt-2">
                                            <summary className="text-xs text-sky-600 cursor-pointer">
                                              Stack trace
                                            </summary>
                                            <pre className="mt-1 p-2 bg-slate-50 rounded text-xs overflow-x-auto max-h-32 whitespace-pre-wrap">
                                              {el.stackTrace}
                                            </pre>
                                          </details>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <div className="text-sm text-slate-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                disabled={page >= pagination.totalPages}
                className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
