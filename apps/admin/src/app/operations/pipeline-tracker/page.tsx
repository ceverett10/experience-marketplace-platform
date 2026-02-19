'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface PipelineTask {
  id: string;
  phase: number;
  taskNumber: string;
  title: string;
  description: string;
  fixRefs: string[];
  keyFiles: string[];
  status: string;
  severity: string;
  implementedAt: string | null;
  testedAt: string | null;
  deployedAt: string | null;
  verifiedAt: string | null;
  verificationQuery: string | null;
  verificationTarget: string | null;
  lastCheckResult: string | null;
  lastCheckAt: string | null;
  lastCheckPassed: boolean | null;
  prUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PhaseSummary {
  total: number;
  verified: number;
  inProgress: number;
  blocked: number;
  failed: number;
}

interface HealthCheck {
  taskId: string;
  taskNumber: string;
  title: string;
  phase: number;
  expected: string | null;
  actual: string | null;
  passed: boolean | null;
  checkedAt: string | null;
}

interface TaskEvent {
  id: string;
  taskId: string;
  taskNumber?: string;
  taskTitle?: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
}

interface PipelineData {
  tasks: PipelineTask[];
  phases: Record<number, PhaseSummary>;
  healthChecks: HealthCheck[];
  events: TaskEvent[];
  overall: { total: number; verified: number; deployed: number; percentage: number };
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const PHASE_NAMES: Record<number, string> = {
  1: 'Foundation & Data Quality',
  2: 'Campaign Quality',
  3: 'Campaign Lifecycle',
  4: 'Global Expansion & Polish',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  IMPLEMENTED: 'bg-amber-100 text-amber-800',
  TESTING: 'bg-purple-100 text-purple-800',
  DEPLOYED: 'bg-sky-100 text-sky-800',
  VERIFIED: 'bg-green-100 text-green-800',
  BLOCKED: 'bg-red-100 text-red-800',
  FAILED: 'bg-red-100 text-red-800',
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH: 'bg-amber-50 text-amber-700 border-amber-200',
  MEDIUM: 'bg-slate-50 text-slate-600 border-slate-200',
};

const ALL_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'IMPLEMENTED',
  'TESTING',
  'DEPLOYED',
  'VERIFIED',
  'BLOCKED',
  'FAILED',
];

type Tab = 'overview' | 'tasks' | 'verification' | 'timeline';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════════════════════════════════

export default function PipelineTrackerPage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [filterPhase, setFilterPhase] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const basePath = typeof window !== 'undefined' ? window.location.origin : '';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${basePath}/api/operations/pipeline-tracker`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const triggerAction = async (action: string, payload: Record<string, unknown> = {}) => {
    try {
      setActionMessage('Running...');
      const res = await fetch(`${basePath}/api/operations/pipeline-tracker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await res.json();
      setActionMessage(
        result.success ? result.message || `${action} completed` : result.error || 'Action failed'
      );
      setTimeout(fetchData, 1000);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const filteredTasks = useMemo(() => {
    if (!data) return [];
    return data.tasks.filter((t) => {
      if (filterPhase !== null && t.phase !== filterPhase) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      return true;
    });
  }, [data, filterPhase, filterStatus]);

  // ─────────────────────────────────────────────────────────────────────
  // Loading / Error
  // ─────────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Pipeline Optimization Tracker</h1>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-slate-100 rounded-xl" />
          <div className="h-64 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Pipeline Optimization Tracker</h1>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  // ─────────────────────────────────────────────────────────────────────
  // Overview Tab
  // ─────────────────────────────────────────────────────────────────────

  const renderOverview = () => {
    const criticalTasks = data.tasks.filter((t) => t.status === 'FAILED' || t.status === 'BLOCKED');
    const inProgressTasks = data.tasks.filter(
      (t) => t.status === 'IN_PROGRESS' || t.status === 'IMPLEMENTED' || t.status === 'TESTING'
    );
    const healthPassing = data.healthChecks.filter((h) => h.passed === true).length;
    const healthTotal = data.healthChecks.filter((h) => h.passed !== null).length;

    return (
      <div className="space-y-6">
        {/* Overall Progress */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-sky-600">{data.overall.percentage}%</div>
              <div className="text-sm text-slate-500 mt-1">Overall Progress</div>
              <div className="text-xs text-slate-400">
                {data.overall.verified}/{data.overall.total} verified
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{data.overall.deployed}</div>
              <div className="text-sm text-slate-500 mt-1">Deployed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{inProgressTasks.length}</div>
              <div className="text-sm text-slate-500 mt-1">In Progress</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div
                className={`text-3xl font-bold ${healthTotal > 0 && healthPassing === healthTotal ? 'text-green-600' : 'text-amber-600'}`}
              >
                {healthTotal > 0 ? `${healthPassing}/${healthTotal}` : '—'}
              </div>
              <div className="text-sm text-slate-500 mt-1">Health Checks</div>
            </CardContent>
          </Card>
        </div>

        {/* Phase Progress Bars */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">Phase Progress</h3>
            <div className="space-y-4">
              {[1, 2, 3, 4].map((phase) => {
                const summary = data.phases[phase] || {
                  total: 0,
                  verified: 0,
                  inProgress: 0,
                  blocked: 0,
                  failed: 0,
                };
                const pct =
                  summary.total > 0 ? Math.round((summary.verified / summary.total) * 100) : 0;
                return (
                  <div key={phase}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        Phase {phase}: {PHASE_NAMES[phase]}
                      </span>
                      <span className="text-sm text-slate-500">
                        {summary.verified}/{summary.total} tasks
                        {summary.inProgress > 0 && (
                          <span className="text-blue-600 ml-2">({summary.inProgress} active)</span>
                        )}
                        {summary.blocked > 0 && (
                          <span className="text-red-600 ml-2">({summary.blocked} blocked)</span>
                        )}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3">
                      <div
                        className="bg-green-500 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Critical Items */}
        {criticalTasks.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold text-red-700 mb-3">
                Needs Attention ({criticalTasks.length})
              </h3>
              <div className="space-y-2">
                {criticalTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200"
                  >
                    <div>
                      <span className="font-mono text-sm text-red-600 mr-2">{t.taskNumber}</span>
                      <span className="text-sm font-medium">{t.title}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[t.status]}`}
                    >
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Currently In Progress */}
        {inProgressTasks.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold text-blue-700 mb-3">
                Currently Active ({inProgressTasks.length})
              </h3>
              <div className="space-y-2">
                {inProgressTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200"
                  >
                    <div>
                      <span className="font-mono text-sm text-blue-600 mr-2">{t.taskNumber}</span>
                      <span className="text-sm font-medium">{t.title}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[t.status]}`}
                    >
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────
  // Tasks Tab
  // ─────────────────────────────────────────────────────────────────────

  const renderTasks = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={filterPhase ?? ''}
          onChange={(e) => setFilterPhase(e.target.value ? parseInt(e.target.value) : null)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white"
        >
          <option value="">All Phases</option>
          {[1, 2, 3, 4].map((p) => (
            <option key={p} value={p}>
              Phase {p}: {PHASE_NAMES[p]}
            </option>
          ))}
        </select>
        <select
          value={filterStatus ?? ''}
          onChange={(e) => setFilterStatus(e.target.value || null)}
          className="px-3 py-1.5 border rounded-lg text-sm bg-white"
        >
          <option value="">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500 ml-auto">{filteredTasks.length} tasks</span>
      </div>

      {/* Task Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                  Phase
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                  #
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                  Task
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                  Severity
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                  PR
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                  Verified
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => (
                <React.Fragment key={task.id}>
                  <tr
                    className="border-b hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                  >
                    <td className="px-4 py-3 text-sm text-slate-500">{task.phase}</td>
                    <td className="px-4 py-3 text-sm font-mono">{task.taskNumber}</td>
                    <td className="px-4 py-3 text-sm font-medium">{task.title}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium border ${SEVERITY_COLORS[task.severity]}`}
                      >
                        {task.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[task.status]}`}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {task.prUrl ? (
                        <a
                          href={task.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          PR
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {task.lastCheckPassed === true && (
                        <span className="text-green-600">Pass</span>
                      )}
                      {task.lastCheckPassed === false && <span className="text-red-600">Fail</span>}
                      {task.lastCheckPassed === null && <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                  {expandedTask === task.id && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50 px-6 py-4 border-b">
                        <div className="space-y-3">
                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase">
                              Description
                            </span>
                            <p className="text-sm mt-1">{task.description}</p>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <span className="text-xs font-medium text-slate-500 uppercase">
                                Fix Refs
                              </span>
                              <p className="text-sm mt-1 font-mono">
                                {task.fixRefs.join(', ') || '—'}
                              </p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-slate-500 uppercase">
                                Key Files
                              </span>
                              <div className="text-sm mt-1 font-mono">
                                {task.keyFiles.map((f, i) => (
                                  <div key={i} className="text-xs text-slate-600 truncate">
                                    {f}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-slate-500 uppercase">
                                Milestones
                              </span>
                              <div className="text-xs mt-1 space-y-1">
                                <div>Implemented: {formatDate(task.implementedAt)}</div>
                                <div>Tested: {formatDate(task.testedAt)}</div>
                                <div>Deployed: {formatDate(task.deployedAt)}</div>
                                <div>Verified: {formatDate(task.verifiedAt)}</div>
                              </div>
                            </div>
                          </div>
                          {task.verificationQuery && (
                            <div>
                              <span className="text-xs font-medium text-slate-500 uppercase">
                                Verification
                              </span>
                              <pre className="text-xs bg-white p-2 rounded border mt-1 overflow-x-auto">
                                {task.verificationQuery}
                              </pre>
                              <div className="flex items-center gap-4 mt-1 text-xs">
                                <span>
                                  Target:{' '}
                                  <code className="bg-slate-100 px-1 rounded">
                                    {task.verificationTarget}
                                  </code>
                                </span>
                                <span>
                                  Last result:{' '}
                                  <code className="bg-slate-100 px-1 rounded">
                                    {task.lastCheckResult || '—'}
                                  </code>
                                </span>
                                <span>Checked: {timeAgo(task.lastCheckAt)}</span>
                              </div>
                            </div>
                          )}
                          {task.notes && (
                            <div>
                              <span className="text-xs font-medium text-slate-500 uppercase">
                                Notes
                              </span>
                              <pre className="text-xs bg-white p-2 rounded border mt-1 whitespace-pre-wrap">
                                {task.notes}
                              </pre>
                            </div>
                          )}
                          {/* Status Update Buttons */}
                          <div className="flex items-center gap-2 pt-2 border-t">
                            <span className="text-xs text-slate-500 mr-2">Move to:</span>
                            {ALL_STATUSES.filter((s) => s !== task.status).map((s) => (
                              <button
                                key={s}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerAction('update_status', { taskId: task.id, status: s });
                                }}
                                className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[s]} hover:opacity-80 transition-opacity`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // Verification Tab
  // ─────────────────────────────────────────────────────────────────────

  const renderVerification = () => {
    const checksByPhase: Record<number, HealthCheck[]> = {};
    for (const check of data.healthChecks) {
      if (!checksByPhase[check.phase]) checksByPhase[check.phase] = [];
      checksByPhase[check.phase]!.push(check);
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Verification Checks</h3>
          <button
            onClick={() => triggerAction('run_verification')}
            className="px-4 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors"
          >
            Run All Checks
          </button>
        </div>

        {[1, 2, 3, 4].map((phase) => {
          const checks = checksByPhase[phase] || [];
          if (checks.length === 0) return null;
          const passing = checks.filter((c) => c.passed === true).length;
          const total = checks.filter((c) => c.passed !== null).length;

          return (
            <Card key={phase}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">
                    Phase {phase}: {PHASE_NAMES[phase]}
                  </h4>
                  {total > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${passing === total ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                    >
                      {passing}/{total} passing
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {checks.map((check) => (
                    <div
                      key={check.taskId}
                      className={`flex items-center justify-between p-2 rounded border ${
                        check.passed === true
                          ? 'bg-green-50 border-green-200'
                          : check.passed === false
                            ? 'bg-red-50 border-red-200'
                            : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">
                          {check.passed === true ? '✓' : check.passed === false ? '✗' : '○'}
                        </span>
                        <div>
                          <span className="text-sm font-medium">
                            {check.taskNumber}: {check.title}
                          </span>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Expected:{' '}
                            <code className="bg-white px-1 rounded">{check.expected || '—'}</code> |
                            Actual:{' '}
                            <code className="bg-white px-1 rounded">
                              {check.actual ? check.actual.substring(0, 80) : '—'}
                            </code>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">{timeAgo(check.checkedAt)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {data.healthChecks.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-slate-500">
              No verification checks configured yet. Checks will appear as tasks are implemented.
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────
  // Timeline Tab
  // ─────────────────────────────────────────────────────────────────────

  const renderTimeline = () => (
    <div className="space-y-4">
      <h3 className="font-semibold">Recent Activity</h3>
      {data.events.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-slate-500">
            No activity yet. Events will appear as tasks are updated.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.events.map((event) => (
                <div key={event.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-shrink-0 w-2 h-2 rounded-full bg-sky-400 mt-2" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-mono text-sky-600">{event.taskNumber}</span>{' '}
                      <span className="font-medium">{event.taskTitle}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {event.fromStatus && (
                        <>
                          <span
                            className={`px-1.5 py-0.5 rounded ${STATUS_COLORS[event.fromStatus]}`}
                          >
                            {event.fromStatus}
                          </span>
                          <span className="mx-1">→</span>
                        </>
                      )}
                      <span className={`px-1.5 py-0.5 rounded ${STATUS_COLORS[event.toStatus]}`}>
                        {event.toStatus}
                      </span>
                      {event.note && <span className="ml-2 text-slate-400">— {event.note}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {formatDateTime(event.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Pipeline Optimization Tracker</h1>
          <p className="text-slate-500 mt-1">
            Tracking {data.overall.total} tasks across 4 phases — {data.overall.percentage}%
            verified
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => triggerAction('run_verification')}
            className="px-3 py-1.5 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors"
          >
            Run Verification
          </button>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 border text-sm rounded-lg hover:bg-slate-50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Action Message */}
      {actionMessage && (
        <div className="mb-4 px-4 py-2 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-800 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-sky-600 hover:text-sky-800"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <nav className="flex gap-1 mb-6 border-b">
        {(
          [
            { key: 'overview', label: 'Overview' },
            { key: 'tasks', label: 'Tasks' },
            { key: 'verification', label: 'Verification' },
            { key: 'timeline', label: 'Timeline' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'tasks' && renderTasks()}
      {activeTab === 'verification' && renderVerification()}
      {activeTab === 'timeline' && renderTimeline()}
    </div>
  );
}
