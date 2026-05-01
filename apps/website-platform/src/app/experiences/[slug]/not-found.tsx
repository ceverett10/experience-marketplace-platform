import Link from 'next/link';

export default function ExperienceNotFound() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
        <div className="max-w-lg text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <svg
              className="h-8 w-8 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-gray-900 sm:text-3xl">
            This experience is no longer available
          </h1>
          <p className="mt-3 text-base text-gray-600">
            It may have been removed or is currently unavailable. Browse our other experiences — we
            have plenty of similar options you might enjoy.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/experiences"
              className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
            >
              Browse all experiences
            </Link>
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:w-auto"
            >
              Go to homepage
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
