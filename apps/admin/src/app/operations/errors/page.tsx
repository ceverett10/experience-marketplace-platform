'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface ErrorEntry {
  id: string;
  jobId: string;
  jobType: string;
  siteId: string | null;
  siteName: string | null;
  errorName: string;
  errorMessage: string;
  errorCategory: string;
  errorSeverity: string;
  attemptNumber: number;
  retryable: boolean;
  createdAt: string;
}

interface ErrorDetail extends ErrorEntry {
  stackTrace: string | null;
  context: any;
  job: {
    id: string;
    type: string;
    status: string;
    attempts: number;
    payload: any;
    result: any;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  };
}

interface CircuitBreakerStatus {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  metrics: {
    failures: number;
    successes: number;
    lastFailureTime: number;
    lastSuccessTime: number;
    recentFailures: number[];
  };
  nextAttemptTime: number;
}

const TIME_WINDOWS = [
  { value: 3600000, label: 'Last 1 hour' },
  { value: 21600000, label: 'Last 6 hours' },
  { value: 86400000, label: 'Last 24 hours' },
  { value: 604800000, label: 'Last 7 days' },
];

const SEVERITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const CATEGORY_OPTIONS = [
  'EXTERNAL_API', 'DATABASE', 'CONFIGURATION', 'NOT_FOUND',
  'RATE_LIMIT', 'NETWORK', 'UNKNOWN',
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function ErrorLogPage() {
  const [timeWindow, setTimeWindow] = useState(86400000);
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [jobType, setJobType] = useState('');
  const [page, setPage] = useState(1);

  const [health, setHealth] = useState<'healthy' | 'degraded' | 'critical'>('healthy');
  const [summary, setSummary] = useState({
    totalErrors: 0,
    criticalCount: 0,
    retryableCount: 0,
    errorRate: 0,
    byCategory: {} as Record<string, number>,
    byType: {} as Record<string, number>,
    timeWindowHours: 24,
  });
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [circuitBreakers, setCircuitBreakers] = useState<Record<string, CircuitBreakerStatus>>({});
  const [loading, setLoading] = useState(true);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<ErrorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchErrors = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('timeWindow', String(timeWindow));
      if (severity) params.set('severity', severity);
      if (category) params.set('category', category);
      if (jobType) params.set('jobType', jobType);
      params.set('page', String(page));

      const response = await fetch(`/admin/api/operations/errors?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      setHealth(data.health);
      setSummary(data.summary);
      setErrors(data.errors || []);
      setPagination(data.pagination);
      setCircuitBreakers(data.circuitBreakers || {});
    } catch (error) {
      console.error('Failed to fetch errors:', error);
    } finally {
      setLoading(false);
    }
  }, [timeWindow, severity, category, jobType, page]);

  useEffect(() => {
    setLoading(true);
    fetchErrors();
    const interval = setInterval(fetchErrors, 10000);
    return () => clearInterval(interval);
  }, [fetchErrors]);

  const fetchErrorDetail = async (errorId: string) => {
    setDetailLoading(true);
    try {
      const response = await fetch(`/admin/api/operations/errors?id=${errorId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setErrorDetail(data);
    } catch (error) {
      console.error('Failed to fetch error detail:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExpandError = (errorId: string) => {
    if (expandedError === errorId) {
      setExpandedError(null);
      setErrorDetail(null);
    } else {
      setExpandedError(errorId);
      fetchErrorDetail(errorId);
    }
  };

  const handleAction = async (action: string, service?: string) => {
    try {
      await fetch('/admin/api/operations/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, service }),
      });
      fetchErrors();
    } catch (error) {
      console.error('Failed to perform action:', error);
    }
  };

  const healthColors = {
    healthy: 'bg-green-100 text-green-800',
    degraded: 'bg-amber-100 text-amber-800',
    critical: 'bg-red-100 text-red-800',
  };

  const severityColors: Record<string, string> = {
    LOW: 'bg-slate-100 text-slate-700',
    MEDIUM: 'bg-amber-100 text-amber-800',
    HIGH: 'bg-orange-100 text-orange-800',
    CRITICAL: 'bg-red-100 text-red-800',
  };

  const categoryColors: Record<string, string> = {
    EXTERNAL_API: 'bg-purple-100 text-purple-800',
    DATABASE: 'bg-blue-100 text-blue-800',
    CONFIGURATION: 'bg-red-100 text-red-800',
    NOT_FOUND: 'bg-slate-100 text-slate-700',
    RATE_LIMIT: 'bg-amber-100 text-amber-800',
    NETWORK: 'bg-orange-100 text-orange-800',
    UNKNOWN: 'bg-slate-100 text-slate-600',
  };

  const circuitStateColors: Record<string, string> = {
    CLOSED: 'bg-green-100 text-green-800',
    HALF_OPEN: 'bg-amber-100 text-amber-800',
    OPEN: 'bg-red-100 text-red-800',
  };

  if (loading && errors.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading error log...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Error Log</h1>
          <p className="text-slate-500 mt-1">Investigate errors with full stack traces</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${healthColors[health]}`}>
            {health.toUpperCase()}
          </span>
          <select
            value={timeWindow}
            onChange={(e) => { setTimeWindow(parseInt(e.target.value)); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {TIME_WINDOWS.map((tw) => (
              <option key={tw.value} value={tw.value}>{tw.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-700">{summary.totalErrors}</p>
            <p className="text-sm text-slate-500">Total Errors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-red-600">{summary.criticalCount}</p>
            <p className="text-sm text-slate-500">Critical</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{summary.errorRate}</p>
            <p className="text-sm text-slate-500">Errors/Hour</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-600">
              {Object.entries(summary.byCategory).sort(([, a], [, b]) => b - a)[0]?.[0]?.replace(/_/g, ' ') || 'None'}
            </p>
            <p className="text-sm text-slate-500">Top Category</p>
          </CardContent>
        </Card>
      </div>

      {/* Category + Type Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">By Category</h3>
            <div className="space-y-1.5">
              {Object.entries(summary.byCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, count]) => (
                  <button
                    key={cat}
                    onClick={() => { setCategory(category === cat ? '' : cat); setPage(1); }}
                    className={`flex items-center justify-between w-full p-2 rounded text-sm hover:bg-slate-50 transition-colors ${category === cat ? 'ring-1 ring-sky-400' : ''}`}
                  >
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColors[cat] || ''}`}>
                      {cat.replace(/_/g, ' ')}
                    </span>
                    <span className="font-bold text-slate-700">{count}</span>
                  </button>
                ))}
              {Object.keys(summary.byCategory).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">No errors</p>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">By Job Type</h3>
            <div className="space-y-1.5">
              {Object.entries(summary.byType)
                .sort(([, a], [, b]) => b - a)
                .map(([typ, count]) => (
                  <button
                    key={typ}
                    onClick={() => { setJobType(jobType === typ ? '' : typ); setPage(1); }}
                    className={`flex items-center justify-between w-full p-2 rounded text-sm hover:bg-slate-50 transition-colors ${jobType === typ ? 'ring-1 ring-sky-400' : ''}`}
                  >
                    <span className="text-slate-700">{typ.replace(/_/g, ' ')}</span>
                    <span className="font-bold text-slate-700">{count}</span>
                  </button>
                ))}
              {Object.keys(summary.byType).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">No errors</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Severities</option>
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
          ))}
        </select>
        {(severity || category || jobType) && (
          <button
            onClick={() => { setSeverity(''); setCategory(''); setJobType(''); setPage(1); }}
            className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Clear filters
          </button>
        )}
        <button
          onClick={() => handleAction('cleanup-old-errors')}
          className="ml-auto px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          Cleanup Old Errors
        </button>
      </div>

      {/* Error List */}
      <Card>
        <div className="divide-y divide-slate-100">
          {errors.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              No errors in the selected time window
            </div>
          ) : (
            errors.map((err) => (
              <div key={err.id}>
                <div
                  className={`p-4 hover:bg-slate-50 cursor-pointer transition-colors ${expandedError === err.id ? 'bg-sky-50' : ''}`}
                  onClick={() => handleExpandError(err.id)}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-xs px-2 py-1 rounded font-medium mt-0.5 ${severityColors[err.errorSeverity] || ''}`}>
                      {err.errorSeverity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-900">{err.errorName}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${categoryColors[err.errorCategory] || ''}`}>
                          {err.errorCategory.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 truncate">{err.errorMessage}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span>{err.jobType.replace(/_/g, ' ')}</span>
                        {err.siteName && <span>{err.siteName}</span>}
                        <span>Attempt {err.attemptNumber}</span>
                        <span>{timeAgo(err.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Detail */}
                {expandedError === err.id && (
                  <div className="px-4 pb-4 bg-slate-50 border-t border-slate-200">
                    {detailLoading ? (
                      <div className="text-center py-4 text-slate-500">Loading details...</div>
                    ) : errorDetail ? (
                      <div className="space-y-4 pt-4">
                        {/* Full error message */}
                        <div>
                          <h4 className="text-sm font-medium text-slate-700 mb-1">Error Message</h4>
                          <pre className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 whitespace-pre-wrap">
                            {errorDetail.errorMessage}
                          </pre>
                        </div>

                        {/* Stack trace */}
                        {errorDetail.stackTrace && (
                          <div>
                            <h4 className="text-sm font-medium text-slate-700 mb-1">Stack Trace</h4>
                            <pre className="p-3 bg-white border border-slate-200 rounded-lg text-xs overflow-x-auto max-h-48 whitespace-pre-wrap">
                              {errorDetail.stackTrace}
                            </pre>
                          </div>
                        )}

                        {/* Context */}
                        {errorDetail.context && (
                          <div>
                            <h4 className="text-sm font-medium text-slate-700 mb-1">Context</h4>
                            <pre className="p-3 bg-white border border-slate-200 rounded-lg text-xs overflow-x-auto max-h-32">
                              {JSON.stringify(errorDetail.context, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Link to job */}
                        <div className="flex items-center gap-3 text-sm">
                          <Link
                            href={`/operations/jobs?search=${errorDetail.jobId}`}
                            className="text-sky-600 hover:text-sky-700"
                          >
                            View Job {errorDetail.jobId.substring(0, 8)}...
                          </Link>
                          <span className="text-slate-400">
                            {formatDate(errorDetail.createdAt)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <div className="text-sm text-slate-500">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                disabled={page >= pagination.totalPages}
                className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Circuit Breakers */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Circuit Breakers</h2>
            <button
              onClick={() => handleAction('reset-all-circuit-breakers')}
              className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
            >
              Reset All
            </button>
          </div>
          <div className="space-y-3">
            {Object.entries(circuitBreakers).length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">No circuit breakers active</p>
            ) : (
              Object.entries(circuitBreakers).map(([service, status]) => (
                <div key={service} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded font-medium ${circuitStateColors[status.state]}`}>
                      {status.state}
                    </span>
                    <span className="font-medium text-slate-900 capitalize">
                      {service.replace(/-/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-red-600">{status.metrics.failures} failures</span>
                    <span className="text-green-600">{status.metrics.successes} successes</span>
                    {status.state !== 'CLOSED' && (
                      <button
                        onClick={() => handleAction('reset-circuit-breaker', service)}
                        className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
