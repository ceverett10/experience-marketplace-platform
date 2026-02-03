'use client';

import { useEffect } from 'react';
import { trackViewItem } from '@/lib/analytics';

interface TrackViewItemProps {
  id: string;
  name: string;
  price?: number;
  currency?: string;
}

/**
 * Invisible component that fires a GA4 view_item event on mount.
 * Use on server-rendered experience detail pages.
 */
export function TrackViewItem({ id, name, price, currency }: TrackViewItemProps) {
  useEffect(() => {
    trackViewItem({ id, name, price, currency });
  }, [id, name, price, currency]);

  return null;
}
