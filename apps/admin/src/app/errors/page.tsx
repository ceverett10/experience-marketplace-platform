'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';

interface ErrorMetrics {
  totalErrors: number;
  errorRate: number;
  criticalErrors: number;
  retryableErrors: number;
  openCircuits: number;
  timeWindowHours: number;
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

export default function ErrorsPage() {
  const [health, setHealth] = useState<'healthy' | 'degraded' | 'critical'>('healthy');
  const [metrics, setMetrics] = useState<ErrorMetrics>({
    totalErrors: 0,
    errorRate: 0,
    criticalErrors: 0,
    retryableErrors: 0,
    openCircuits: 0,
    timeWindowHours: 24,
  });
  const [errorsByCategory, setErrorsByCategory] = useState<Record<string, number>>({});
  const [errorsByType, setErrorsByType] = useState<Record<string, number>>({});
  const [circuitBreakers, setCircuitBreakers] = useState<Record<string, CircuitBreakerStatus>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState(86400000); // 24 hours

  useEffect(() => {
    const fetchErrorStats = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/errors?timeWindow=${timeWindow}`);
        const data = await response.json();

        setHealth(data.health);
        setMetrics(data.metrics);
        setErrorsByCategory(data.errorsByCategory || {});
        setErrorsByType(data.errorsByType || {});
        setCircuitBreakers(data.circuitBreakers || {});
      } catch (error) {
        console.error('Failed to fetch error stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchErrorStats();
    const interval = setInterval(fetchErrorStats, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [timeWindow]);

  const handleAction = async (action: string, service?: string) => {
    try {
      const response = await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, service }),
      });

      if (response.ok) {
        // Refresh data
        const data = await fetch(`/api/errors?timeWindow=${timeWindow}`).then((r) => r.json());
        setHealth(data.health);
        setMetrics(data.metrics);
        setCircuitBreakers(data.circuitBreakers);
      }
    } catch (error) {
      console.error('Failed to perform action:', error);
    }
  };

  const getHealthColor = (healthStatus: string) => {
    if (healthStatus === 'healthy') return 'text-green-600 bg-green-50';
    if (healthStatus === 'degraded') return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const getCircuitStateColor = (state: string) => {
    if (state === 'CLOSED') return 'text-green-600 bg-green-50';
    if (state === 'HALF_OPEN') return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading error monitoring...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Error Monitoring</h1>
          <p className="text-slate-500 mt-1">System health, errors, and circuit breakers</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={timeWindow}
            onChange={(e) => setTimeWindow(parseInt(e.target.value))}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value={3600000}>Last 1 hour</option>
            <option value={21600000}>Last 6 hours</option>
            <option value={86400000}>Last 24 hours</option>
            <option value={604800000}>Last 7 days</option>
          </select>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-slate-500">Live updates</span>
          </div>
        </div>
      </div>

      {/* Overall health */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">System Health</h2>
              <span className={`inline-block px-4 py-2 rounded-lg font-medium ${getHealthColor(health)}`}>
                {health.toUpperCase()}
              </span>
            </div>
            <button
              onClick={() => handleAction('cleanup-old-errors')}
              className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cleanup Old Errors
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Error metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-700">{metrics.totalErrors}</p>
            <p className="text-sm text-slate-500">Total Errors</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{metrics.errorRate}</p>
            <p className="text-sm text-slate-500">Errors/Hour</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-red-600">{metrics.criticalErrors}</p>
            <p className="text-sm text-slate-500">Critical</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{metrics.retryableErrors}</p>
            <p className="text-sm text-slate-500">Retryable</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-orange-600">{metrics.openCircuits}</p>
            <p className="text-sm text-slate-500">Open Circuits</p>
          </CardContent>
        </Card>
      </div>

      {/* Errors by category */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Errors by Category</h2>
          <div className="space-y-2">
            {Object.entries(errorsByCategory).length === 0 ? (
              <p className="text-slate-500 text-center py-4">No errors in selected time window</p>
            ) : (
              Object.entries(errorsByCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="font-medium text-slate-700">{category.replace(/_/g, ' ')}</span>
                    <span className="px-3 py-1 bg-slate-200 rounded-full text-sm font-bold">{count}</span>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Errors by job type */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Errors by Job Type</h2>
          <div className="space-y-2">
            {Object.entries(errorsByType).length === 0 ? (
              <p className="text-slate-500 text-center py-4">No errors in selected time window</p>
            ) : (
              Object.entries(errorsByType)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="font-medium text-slate-700">{type.replace(/_/g, ' ')}</span>
                    <span className="px-3 py-1 bg-slate-200 rounded-full text-sm font-bold">{count}</span>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Circuit breakers */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Circuit Breakers</h2>
            <button
              onClick={() => handleAction('reset-all-circuit-breakers')}
              className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
            >
              Reset All Circuits
            </button>
          </div>
          <div className="space-y-4">
            {Object.entries(circuitBreakers).length === 0 ? (
              <p className="text-slate-500 text-center py-4">No circuit breakers active</p>
            ) : (
              Object.entries(circuitBreakers).map(([service, status]) => (
                <div key={service} className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-slate-900 capitalize">{service.replace(/-/g, ' ')}</h3>
                      <span className={`inline-block mt-1 px-3 py-1 rounded-lg text-sm font-medium ${getCircuitStateColor(status.state)}`}>
                        {status.state}
                      </span>
                    </div>
                    {status.state !== 'CLOSED' && (
                      <button
                        onClick={() => handleAction('reset-circuit-breaker', service)}
                        className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Failures</p>
                      <p className="font-bold text-red-600">{status.metrics.failures}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Successes</p>
                      <p className="font-bold text-green-600">{status.metrics.successes}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Recent Failures</p>
                      <p className="font-bold text-slate-700">{status.metrics.recentFailures.length}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Last Activity</p>
                      <p className="font-bold text-slate-700">
                        {status.metrics.lastFailureTime > 0
                          ? new Date(status.metrics.lastFailureTime).toLocaleTimeString()
                          : 'None'}
                      </p>
                    </div>
                  </div>

                  {status.state === 'OPEN' && status.nextAttemptTime > 0 && (
                    <div className="mt-3 p-2 bg-amber-50 rounded text-sm text-amber-800">
                      Next retry attempt: {new Date(status.nextAttemptTime).toLocaleString()}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
