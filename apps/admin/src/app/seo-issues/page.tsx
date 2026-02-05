'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface SEOIssue {
  id: string;
  siteId: string;
  pageId: string | null;
  category: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string;
  estimatedImpact: string;
  status: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
  detectedAt: string;
  detectedBy: string;
  metadata: any;
  site: { name: string; primaryDomain: string | null };
  page: { title: string; slug: string } | null;
}

const SEVERITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const CATEGORY_OPTIONS = ['CONTENT', 'TECHNICAL', 'PERFORMANCE', 'COMPETITOR_GAP'];
const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX'];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function SEOIssuesPage() {
  const [siteId, setSiteId] = useState('');
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);

  const [health, setHealth] = useState<'healthy' | 'degraded' | 'critical'>('healthy');
  const [summary, setSummary] = useState({
    total: 0,
    open: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    resolvedThisWeek: 0,
    byCategory: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
  });
  const [issues, setIssues] = useState<SEOIssue[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch sites for filter dropdown
  useEffect(() => {
    const fetchSites = async () => {
      try {
        const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
        const response = await fetch(`${basePath}/api/sites`);
        if (response.ok) {
          const data = await response.json();
          setSites(data.sites || []);
        }
      } catch (error) {
        console.error('Failed to fetch sites:', error);
      }
    };
    fetchSites();
  }, []);

  const fetchIssues = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (siteId) params.set('siteId', siteId);
      if (severity) params.set('severity', severity);
      if (category) params.set('category', category);
      if (status) params.set('status', status);
      params.set('page', String(page));

      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      const response = await fetch(`${basePath}/api/seo-issues?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      setHealth(data.health);
      setSummary(data.summary);
      setIssues(data.issues || []);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch SEO issues:', error);
    } finally {
      setLoading(false);
    }
  }, [siteId, severity, category, status, page]);

  useEffect(() => {
    setLoading(true);
    fetchIssues();
  }, [fetchIssues]);

  const handleAction = async (issueId: string, action: string, resolution?: string) => {
    setActionLoading(`${action}-${issueId}`);
    try {
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      await fetch(`${basePath}/api/seo-issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, resolution, resolvedBy: 'admin' }),
      });
      fetchIssues();
    } catch (error) {
      console.error('Failed to perform action:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkAction = async (action: string, targetStatus: string) => {
    const issueIds = issues.filter((i) => i.status === 'OPEN').map((i) => i.id);
    if (issueIds.length === 0) return;

    setActionLoading(action);
    try {
      const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';
      await fetch(`${basePath}/api/seo-issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk-update',
          issueIds,
          status: targetStatus,
          resolvedBy: 'admin',
        }),
      });
      fetchIssues();
    } catch (error) {
      console.error('Failed to perform bulk action:', error);
    } finally {
      setActionLoading(null);
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
    CONTENT: 'bg-blue-100 text-blue-800',
    TECHNICAL: 'bg-purple-100 text-purple-800',
    PERFORMANCE: 'bg-green-100 text-green-800',
    COMPETITOR_GAP: 'bg-amber-100 text-amber-800',
  };

  const statusColors: Record<string, string> = {
    OPEN: 'bg-red-100 text-red-800',
    IN_PROGRESS: 'bg-amber-100 text-amber-800',
    RESOLVED: 'bg-green-100 text-green-800',
    WONT_FIX: 'bg-slate-100 text-slate-600',
  };

  if (loading && issues.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-56 bg-slate-100 rounded animate-pulse mt-2" />
          </div>
          <div className="h-10 w-36 bg-slate-200 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-7 w-12 bg-slate-200 rounded animate-pulse mb-1" />
                <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 flex items-start gap-3">
                <div className="h-6 w-16 bg-slate-200 rounded animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
                  <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
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
          <h1 className="text-2xl font-bold text-slate-900">SEO Issues</h1>
          <p className="text-slate-500 mt-1">
            Track and resolve SEO issues detected across all sites
          </p>
        </div>
        <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${healthColors[health]}`}>
          {health.toUpperCase()}
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-700">{summary.open}</p>
            <p className="text-sm text-slate-500">Open Issues</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-red-600">{summary.critical}</p>
            <p className="text-sm text-slate-500">Critical</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-orange-600">{summary.high}</p>
            <p className="text-sm text-slate-500">High</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{summary.medium}</p>
            <p className="text-sm text-slate-500">Medium</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">{summary.resolvedThisWeek}</p>
            <p className="text-sm text-slate-500">Resolved This Week</p>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
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
                    onClick={() => {
                      setCategory(category === cat ? '' : cat);
                      setPage(1);
                    }}
                    className={`flex items-center justify-between w-full p-2 rounded text-sm hover:bg-slate-50 transition-colors ${category === cat ? 'ring-1 ring-sky-400' : ''}`}
                  >
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColors[cat] || ''}`}>
                      {cat.replace(/_/g, ' ')}
                    </span>
                    <span className="font-bold text-slate-700">{count}</span>
                  </button>
                ))}
              {Object.keys(summary.byCategory).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">No issues</p>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">By Status</h3>
            <div className="space-y-1.5">
              {Object.entries(summary.byStatus)
                .sort(([, a], [, b]) => b - a)
                .map(([stat, count]) => (
                  <button
                    key={stat}
                    onClick={() => {
                      setStatus(status === stat ? '' : stat);
                      setPage(1);
                    }}
                    className={`flex items-center justify-between w-full p-2 rounded text-sm hover:bg-slate-50 transition-colors ${status === stat ? 'ring-1 ring-sky-400' : ''}`}
                  >
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[stat] || ''}`}>
                      {stat.replace(/_/g, ' ')}
                    </span>
                    <span className="font-bold text-slate-700">{count}</span>
                  </button>
                ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={siteId}
          onChange={(e) => {
            setSiteId(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Severities</option>
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        {(siteId || severity || category || status) && (
          <button
            onClick={() => {
              setSiteId('');
              setSeverity('');
              setCategory('');
              setStatus('OPEN');
              setPage(1);
            }}
            className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Issues List */}
      <Card className="relative">
        {loading && issues.length > 0 && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-100 overflow-hidden rounded-t-lg z-10">
            <div
              className="h-full w-1/3 bg-sky-500 rounded"
              style={{
                animation: 'shimmer 1s ease-in-out infinite',
                background: 'linear-gradient(90deg, transparent, rgb(14 165 233), transparent)',
              }}
            />
          </div>
        )}
        <div className="divide-y divide-slate-100">
          {issues.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              No SEO issues found matching the current filters
            </div>
          ) : (
            issues.map((issue) => (
              <div key={issue.id}>
                <div
                  className={`p-4 hover:bg-slate-50 cursor-pointer transition-colors ${expandedIssue === issue.id ? 'bg-sky-50' : ''}`}
                  onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`text-xs px-2 py-1 rounded font-medium mt-0.5 ${severityColors[issue.severity] || ''}`}
                    >
                      {issue.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">{issue.title}</span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${categoryColors[issue.category] || ''}`}
                        >
                          {issue.category.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${statusColors[issue.status] || ''}`}
                        >
                          {issue.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-2">{issue.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                        <span>{issue.site.name}</span>
                        {issue.page && <span>{issue.page.title}</span>}
                        <span>Detected by {issue.detectedBy.replace(/_/g, ' ')}</span>
                        <span>{timeAgo(issue.detectedAt)}</span>
                      </div>
                    </div>
                    {issue.status === 'OPEN' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(issue.id, 'update-status', 'IN_PROGRESS');
                          }}
                          disabled={actionLoading !== null}
                          className="px-2 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 rounded transition-colors disabled:opacity-50"
                        >
                          Start
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(issue.id, 'resolve', 'Resolved');
                          }}
                          disabled={actionLoading !== null}
                          className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-800 rounded transition-colors disabled:opacity-50"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(issue.id, 'dismiss', 'Dismissed');
                          }}
                          disabled={actionLoading !== null}
                          className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Detail */}
                {expandedIssue === issue.id && (
                  <div className="px-4 pb-4 bg-slate-50 border-t border-slate-200">
                    <div className="space-y-4 pt-4">
                      {/* Description */}
                      <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-1">Description</h4>
                        <p className="text-sm text-slate-600">{issue.description}</p>
                      </div>

                      {/* Recommendation */}
                      <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-1">Recommendation</h4>
                        <p className="text-sm text-slate-600">{issue.recommendation}</p>
                      </div>

                      {/* Impact */}
                      <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-1">Estimated Impact</h4>
                        <p className="text-sm text-green-600 font-medium">{issue.estimatedImpact}</p>
                      </div>

                      {/* Metadata */}
                      {issue.metadata && Object.keys(issue.metadata).length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-slate-700 mb-1">Details</h4>
                          <pre className="p-3 bg-white border border-slate-200 rounded-lg text-xs overflow-x-auto">
                            {JSON.stringify(issue.metadata, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Links */}
                      <div className="flex items-center gap-3 text-sm">
                        <Link
                          href={`/sites/${issue.siteId}`}
                          className="text-sky-600 hover:text-sky-700"
                        >
                          View Site
                        </Link>
                        {issue.page && (
                          <Link
                            href={`/sites/${issue.siteId}?tab=content`}
                            className="text-sky-600 hover:text-sky-700"
                          >
                            View Page Content
                          </Link>
                        )}
                      </div>

                      {/* Resolution info */}
                      {issue.status === 'RESOLVED' && issue.resolvedAt && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm text-green-800">
                            <strong>Resolved</strong> by {issue.resolvedBy} on{' '}
                            {new Date(issue.resolvedAt).toLocaleDateString()}
                          </p>
                          {issue.resolution && (
                            <p className="text-sm text-green-700 mt-1">{issue.resolution}</p>
                          )}
                        </div>
                      )}
                    </div>
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
    </div>
  );
}
