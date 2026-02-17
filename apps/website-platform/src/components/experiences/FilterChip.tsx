'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface FilterChipProps {
  label: string;
  /** Number of active selections for this filter group */
  activeCount: number;
  /** Whether the dropdown is open */
  isOpen: boolean;
  /** Toggle dropdown open/closed */
  onToggle: () => void;
  /** Brand primary color for active state */
  primaryColor?: string;
  children: React.ReactNode;
}

/**
 * Individual filter pill button that opens a dropdown panel.
 * Shows filter name + active count badge. Styled with brand primaryColor when active.
 */
export function FilterChip({
  label,
  activeCount,
  isOpen,
  onToggle,
  primaryColor = '#0F766E',
  children,
}: FilterChipProps) {
  const chipRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        chipRef.current &&
        !chipRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onToggle();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onToggle();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onToggle]);

  const isActive = activeCount > 0;

  return (
    <div ref={chipRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all ${
          isActive
            ? 'border-transparent text-white shadow-sm'
            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
        }`}
        style={isActive ? { backgroundColor: primaryColor } : undefined}
      >
        {label}
        {isActive && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-xs">
            {activeCount}
          </span>
        )}
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full z-30 mt-2 min-w-[240px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}
