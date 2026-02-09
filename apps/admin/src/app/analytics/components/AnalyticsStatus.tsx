'use client';

import React from 'react';

interface AnalyticsStatusProps {
  ga4: boolean;
  gsc: boolean;
  size?: 'sm' | 'md';
}

export function AnalyticsStatus({ ga4, gsc, size = 'sm' }: AnalyticsStatusProps) {
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  if (ga4 && gsc) {
    return (
      <span className={`${sizeClasses} rounded bg-green-100 text-green-800 font-medium`}>
        GA4 + GSC
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {ga4 ? (
        <span className={`${sizeClasses} rounded bg-sky-100 text-sky-800 font-medium`}>GA4</span>
      ) : (
        <span className={`${sizeClasses} rounded bg-slate-100 text-slate-500 font-medium`}>No GA4</span>
      )}
      {gsc ? (
        <span className={`${sizeClasses} rounded bg-purple-100 text-purple-800 font-medium`}>GSC</span>
      ) : (
        <span className={`${sizeClasses} rounded bg-slate-100 text-slate-500 font-medium`}>No GSC</span>
      )}
    </div>
  );
}
