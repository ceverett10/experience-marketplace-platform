'use client';

import React from 'react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const handlePreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    onChange(
      start.toISOString().split('T')[0]!,
      end.toISOString().split('T')[0]!
    );
  };

  // Calculate which preset is currently active
  const getActiveDays = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const activeDays = getActiveDays();

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.days}
            onClick={() => handlePreset(preset.days)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeDays === preset.days
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <input
          type="date"
          value={startDate}
          onChange={(e) => onChange(e.target.value, endDate)}
          className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
        />
        <span>to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onChange(startDate, e.target.value)}
          className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
        />
      </div>
    </div>
  );
}
