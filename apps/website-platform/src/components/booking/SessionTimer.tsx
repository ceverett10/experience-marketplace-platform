'use client';

import { useState, useEffect, useCallback } from 'react';

interface SessionTimerProps {
  /** When the session started */
  startTime: Date;
  /** Session duration in minutes (default: 15) */
  durationMinutes?: number;
  /** Callback when timer expires */
  onExpire?: () => void;
  /** Visual variant */
  variant?: 'inline' | 'banner';
}

/**
 * SessionTimer component
 * Shows countdown for booking session expiry with color-coded warnings
 * - Normal: Gray text
 * - Warning (5 min): Yellow/amber
 * - Critical (2 min): Red
 */
export function SessionTimer({
  startTime,
  durationMinutes = 15,
  onExpire,
  variant = 'inline',
}: SessionTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const expiresAt = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
    return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  });

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) {
      onExpire?.();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          clearInterval(timer);
          onExpire?.();
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onExpire]);

  // Don't render if expired
  if (timeLeft <= 0) {
    return null;
  }

  // Determine urgency level for styling
  const isWarning = timeLeft <= 5 * 60; // 5 minutes
  const isCritical = timeLeft <= 2 * 60; // 2 minutes

  const getColors = () => {
    if (isCritical) {
      return {
        bg: 'bg-red-50',
        text: 'text-red-700',
        icon: 'text-red-500',
        border: 'border-red-200',
      };
    }
    if (isWarning) {
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        icon: 'text-amber-500',
        border: 'border-amber-200',
      };
    }
    return {
      bg: 'bg-gray-50',
      text: 'text-gray-600',
      icon: 'text-gray-400',
      border: 'border-gray-200',
    };
  };

  const colors = getColors();

  if (variant === 'banner') {
    return (
      <div
        className={`flex items-center justify-center gap-2 px-4 py-2 ${colors.bg} ${colors.text} ${colors.border} border-b`}
      >
        <svg
          className={`h-4 w-4 ${colors.icon} ${isCritical ? 'animate-pulse' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-sm font-medium">Complete your booking in {formatTime(timeLeft)}</span>
      </div>
    );
  }

  // Inline variant
  return (
    <div className={`flex items-center gap-1.5 ${colors.text}`}>
      <svg
        className={`h-4 w-4 ${colors.icon} ${isCritical ? 'animate-pulse' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="2"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className="text-sm">{formatTime(timeLeft)}</span>
    </div>
  );
}
