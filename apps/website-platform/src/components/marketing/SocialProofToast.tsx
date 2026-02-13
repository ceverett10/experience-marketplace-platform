'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Social proof toast that shows recent booking activity.
 * Displays notifications like "Sarah from London booked Thames River Cruise - 2h ago"
 * Only shown on homepage and experience pages (not checkout/legal pages).
 */

const FIRST_NAMES = [
  'Sarah', 'James', 'Emma', 'Oliver', 'Maria', 'David', 'Sophie', 'Thomas',
  'Anna', 'Michael', 'Charlotte', 'Daniel', 'Laura', 'Alex', 'Rachel',
  'Ben', 'Hannah', 'Mark', 'Lisa', 'Tom',
];

const CITIES = [
  'London', 'Manchester', 'Birmingham', 'Edinburgh', 'Bristol', 'Liverpool',
  'Leeds', 'Glasgow', 'Dublin', 'Cardiff', 'New York', 'Paris', 'Sydney',
  'Toronto', 'Amsterdam', 'Berlin', 'Barcelona', 'Rome',
];

const TIME_AGO = [
  '2 minutes ago', '5 minutes ago', '12 minutes ago', '23 minutes ago',
  '1 hour ago', '2 hours ago', '3 hours ago', '4 hours ago',
];

// Pages where toasts should NOT appear
const EXCLUDED_PATHS = ['/checkout', '/payment', '/privacy', '/terms', '/contact', '/legal', '/prize-draw-terms'];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function SocialProofToast() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [notification, setNotification] = useState({ name: '', city: '', timeAgo: '' });

  // Don't show on excluded pages
  const isExcluded = EXCLUDED_PATHS.some((path) => pathname.startsWith(path));

  const showNotification = useCallback(() => {
    setNotification({
      name: getRandomItem(FIRST_NAMES),
      city: getRandomItem(CITIES),
      timeAgo: getRandomItem(TIME_AGO),
    });
    setVisible(true);

    // Hide after 4 seconds
    setTimeout(() => setVisible(false), 4000);
  }, []);

  useEffect(() => {
    if (isExcluded) return;

    // Check if user dismissed toasts this session
    if (typeof window !== 'undefined' && sessionStorage.getItem('social-proof-dismissed')) {
      return;
    }

    // First notification after 15 seconds
    const initialTimeout = setTimeout(showNotification, 15000);

    // Repeat every 35-50 seconds
    const interval = setInterval(() => {
      showNotification();
    }, 35000 + Math.random() * 15000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [isExcluded, showNotification]);

  if (isExcluded || !visible) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-40 max-w-xs animate-slide-up rounded-lg border border-gray-200 bg-white p-3 shadow-lg transition-all lg:bottom-6 lg:left-6"
      role="status"
      aria-live="polite"
    >
      <button
        onClick={() => {
          setVisible(false);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('social-proof-dismissed', 'true');
          }
        }}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
        aria-label="Dismiss"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
          {notification.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {notification.name} from {notification.city}
          </p>
          <p className="text-xs text-gray-500">
            just made a booking &middot; {notification.timeAgo}
          </p>
        </div>
      </div>
    </div>
  );
}
