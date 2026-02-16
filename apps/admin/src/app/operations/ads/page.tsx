'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirect from the old Ad Performance page to the unified Paid Traffic dashboard.
 * Performance data is now on the "Performance" tab.
 */
export default function AdPerformanceRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/operations/bidding');
  }, [router]);
  return (
    <div className="p-8 text-center text-slate-500">Redirecting to Paid Traffic dashboard...</div>
  );
}
