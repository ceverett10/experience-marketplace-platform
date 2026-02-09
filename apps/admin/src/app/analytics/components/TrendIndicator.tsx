'use client';

import React from 'react';

interface TrendIndicatorProps {
  value: number;
  inverted?: boolean; // For metrics where lower is better (e.g., position)
}

export function TrendIndicator({ value, inverted = false }: TrendIndicatorProps) {
  const isPositive = inverted ? value < 0 : value > 0;
  const isNeutral = value === 0;

  const colorClass = isNeutral
    ? 'text-slate-500 bg-slate-100'
    : isPositive
    ? 'text-green-700 bg-green-100'
    : 'text-red-700 bg-red-100';

  const arrow = isNeutral ? '' : isPositive ? '↑' : '↓';
  const displayValue = Math.abs(value);

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${colorClass}`}>
      {arrow && <span>{arrow}</span>}
      <span>{displayValue.toFixed(0)}%</span>
    </span>
  );
}
