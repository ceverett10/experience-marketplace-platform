'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';
import { DateRangePicker } from '../components/DateRangePicker';
import { MetricCard } from '../components/MetricCard';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface FunnelStep {
  step: string;
  label: string;
  sessions: number;
  events: number;
}

interface FunnelError {
  id: string;
  createdAt: string;
  step: string;
  stepLabel: string;
  siteId: string;
  siteName: string;
  errorCode: string;
  errorMessage: string | null;
  bookingId: string | null;
  productId: string | null;
}

interface FunnelData {
  funnel: FunnelStep[];
  dailyTrend: Array<Record<string, string | number>>;
  recentErrors: FunnelError[];
  summary: {
    totalSearches: number;
    totalCompleted: number;
    overallConversion: number;
    errorRate: number;
    totalErrors: number;
  };
  sites: Array<{ id: string; name: string }>;
  errorsByStep: Array<{ step: string; label: string; errors: number }>;
  dateRange: { from: string; to: string };
}

function getDefaultStartDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().split('T')[0]!;
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split('T')[0]!;
}

const STEP_COLORS: Record<string, string> = {
  AVAILABILITY_SEARCH: '#6366f1',
  BOOKING_CREATED: '#8b5cf6',
  AVAILABILITY_ADDED: '#a78bfa',
  CHECKOUT_LOADED: '#06b6d4',
  QUESTIONS_ANSWERED: '#14b8a6',
  PAYMENT_STARTED: '#f59e0b',
  BOOKING_COMPLETED: '#22c55e',
};

export default function BookingFunnelPage() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [siteId, setSiteId] = useState<string>('');

  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: startDate, to: endDate });
      if (siteId) params.set('siteId', siteId);

      const response = await fetch(`${basePath}/api/analytics/funnel?${params}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const json = await response.json();
      setData(json);
    } catch (error) {
      console.error('Failed to fetch funnel data:', error);
    } finally {
      setLoading(false);
    }
  }, [basePath, startDate, endDate, siteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Booking Funnel</h1>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Booking Funnel</h1>
        <p className="text-slate-500">No funnel data available yet. Data will appear once users start searching for availability.</p>
      </div>
    );
  }

  const maxSessions = Math.max(...data.funnel.map((s) => s.sessions), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Booking Funnel</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Site filter */}
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="">All Sites</option>
            {data.sites.map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={handleDateChange}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          title="Total Searches"
          value={data.summary.totalSearches}
        />
        <MetricCard
          title="Bookings Completed"
          value={data.summary.totalCompleted}
        />
        <MetricCard
          title="Conversion Rate"
          value={data.summary.overallConversion}
          format="percent"
        />
        <MetricCard
          title="Error Rate"
          value={data.summary.errorRate}
          format="percent"
          subtitle={`${data.summary.totalErrors} errors`}
        />
      </div>

      {/* Funnel Visualization */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Conversion Funnel</h2>
          <div className="space-y-3">
            {data.funnel.map((step, index) => {
              const prevSessions = index > 0 ? data.funnel[index - 1]!.sessions : step.sessions;
              const dropOff = prevSessions > 0 && index > 0
                ? ((prevSessions - step.sessions) / prevSessions) * 100
                : 0;
              const widthPercent = maxSessions > 0 ? (step.sessions / maxSessions) * 100 : 0;

              return (
                <div key={step.step} className="flex items-center gap-4">
                  <div className="w-44 flex-shrink-0 text-right">
                    <span className="text-sm font-medium text-slate-700">{step.label}</span>
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-8 bg-slate-100 rounded-lg overflow-hidden">
                      <div
                        className="h-full rounded-lg transition-all duration-500"
                        style={{
                          width: `${Math.max(widthPercent, 1)}%`,
                          backgroundColor: STEP_COLORS[step.step] ?? '#6366f1',
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-20 flex-shrink-0 text-right">
                    <span className="text-sm font-bold text-slate-900">
                      {step.sessions.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-16 flex-shrink-0 text-right">
                    {index > 0 && dropOff > 0 && (
                      <span className="text-xs text-red-500">
                        -{dropOff.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Daily Trend Chart */}
      {data.dailyTrend.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Daily Trends</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickFormatter={(value: string) => {
                    const d = new Date(value);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  labelFormatter={(value: string) => {
                    const d = new Date(value);
                    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="AVAILABILITY_SEARCH"
                  name="Searches"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="BOOKING_CREATED"
                  name="Bookings Created"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="BOOKING_COMPLETED"
                  name="Completed"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Errors by Step */}
      {data.summary.totalErrors > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Errors by Step</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {data.errorsByStep.map((step) => (
                <div key={step.step} className="text-center p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 truncate">{step.label}</p>
                  <p className={`text-lg font-bold mt-1 ${step.errors > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                    {step.errors}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Errors Table */}
      {data.recentErrors.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Errors</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Time</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Step</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Site</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Error</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Booking ID</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentErrors.map((error) => (
                    <tr key={error.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                        {new Date(error.createdAt).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                          style={{ backgroundColor: STEP_COLORS[error.step] ?? '#6366f1' }}
                        >
                          {error.stepLabel}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-600">{error.siteName}</td>
                      <td className="py-2 px-3 text-red-600 max-w-xs truncate" title={error.errorMessage ?? ''}>
                        <span className="font-mono text-xs">{error.errorCode}</span>
                        {error.errorMessage && (
                          <span className="ml-1 text-slate-500">{error.errorMessage.slice(0, 80)}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-400 font-mono text-xs">
                        {error.bookingId ? error.bookingId.slice(0, 12) + '...' : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {data.funnel.every((s) => s.sessions === 0) && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-slate-500">No booking funnel events recorded in this period.</p>
            <p className="text-sm text-slate-400 mt-1">
              Events will appear here once users start searching for availability on your sites.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
