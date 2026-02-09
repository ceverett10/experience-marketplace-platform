'use client';

import React from 'react';
import { Card, CardContent } from '@experience-marketplace/ui-components';
import { TrendIndicator } from './TrendIndicator';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  subtitle?: string;
  format?: 'number' | 'percent' | 'currency' | 'position' | 'duration';
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function MetricCard({ title, value, change, subtitle, format = 'number' }: MetricCardProps) {
  const formatValue = (val: string | number): string => {
    if (typeof val === 'string') return val;

    switch (format) {
      case 'percent':
        return `${val.toFixed(1)}%`;
      case 'currency':
        return new Intl.NumberFormat('en-GB', {
          style: 'currency',
          currency: 'GBP',
          maximumFractionDigits: 0,
        }).format(val);
      case 'position':
        return val.toFixed(1);
      case 'duration':
        return formatDuration(val);
      default:
        return new Intl.NumberFormat('en-GB').format(val);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">{title}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatValue(value)}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
          </div>
          {change !== undefined && (
            <TrendIndicator value={change} inverted={format === 'position'} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
