import { headers } from 'next/headers';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSiteFromHostname } from '@/lib/tenant';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

/**
 * Generate SEO metadata
 */
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  return {
    title: 'Unsubscribed',
    description: 'You have been unsubscribed from marketing emails.',
    robots: {
      index: false,
      follow: false,
    },
  };
}

/**
 * Unsubscribed confirmation page
 * Shows after user clicks unsubscribe link in email
 */
export default async function UnsubscribedPage({ searchParams }: PageProps) {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);
  const resolvedParams = await searchParams;
  const error = resolvedParams.error;

  const primaryColor = site.brand?.primaryColor ?? '#6366f1';

  // Error states
  if (error === 'invalid' || error === 'not_found') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
            <svg
              className="h-8 w-8 text-yellow-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Invalid Unsubscribe Link</h1>
          <p className="mt-4 text-gray-600">
            This unsubscribe link is invalid or has already been used. If you&apos;re still
            receiving marketing emails and want to unsubscribe, please contact us.
          </p>
          <Link
            href="/"
            className="mt-8 inline-block rounded-lg px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  if (error === 'failed') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Something Went Wrong</h1>
          <p className="mt-4 text-gray-600">
            We couldn&apos;t process your unsubscribe request. Please try again later or contact us
            for assistance.
          </p>
          <Link
            href="/"
            className="mt-8 inline-block rounded-lg px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">You&apos;ve Been Unsubscribed</h1>
        <p className="mt-4 text-gray-600">
          You will no longer receive marketing emails from Holibob.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Don&apos;t worry - you remain entered in any active prize draws.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-lg px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Return to Homepage
        </Link>
      </div>
    </div>
  );
}

// Dynamic rendering
export const dynamic = 'force-dynamic';
