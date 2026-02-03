export default function ExperienceDetailLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-gray-50">
      {/* Breadcrumb skeleton */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="h-4 w-12 rounded bg-gray-200" />
            <div className="h-4 w-4 rounded bg-gray-100" />
            <div className="h-4 w-24 rounded bg-gray-200" />
          </div>
        </div>
      </div>

      {/* Gallery skeleton */}
      <div className="bg-white">
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
          <div className="grid gap-2 overflow-hidden rounded-xl sm:grid-cols-4 sm:grid-rows-2">
            <div className="h-64 bg-gray-200 sm:col-span-2 sm:row-span-2 sm:h-80" />
            <div className="hidden h-40 bg-gray-200 sm:block" />
            <div className="hidden h-40 bg-gray-200 sm:block" />
            <div className="hidden h-40 bg-gray-200 sm:block" />
            <div className="hidden h-40 bg-gray-200 sm:block" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-3 lg:gap-12">
          {/* Left column */}
          <div className="lg:col-span-2">
            {/* Title */}
            <div className="mb-8">
              <div className="h-9 w-3/4 rounded bg-gray-200" />
              <div className="mt-4 flex flex-wrap gap-4">
                <div className="h-7 w-20 rounded-md bg-gray-200" />
                <div className="h-5 w-24 rounded bg-gray-200" />
                <div className="h-5 w-32 rounded bg-gray-200" />
                <div className="h-5 w-28 rounded bg-gray-200" />
              </div>
            </div>

            {/* Description */}
            <div className="mb-8 space-y-3">
              <div className="h-6 w-48 rounded bg-gray-200" />
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-4 w-full rounded bg-gray-100" />
                ))}
                <div className="h-4 w-2/3 rounded bg-gray-100" />
              </div>
            </div>

            {/* Highlights */}
            <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
              <div className="h-6 w-32 rounded bg-gray-200" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded-full bg-gray-200" />
                    <div className="h-4 w-40 rounded bg-gray-100" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column - Booking widget */}
          <div className="mt-8 lg:mt-0">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
              <div className="mb-4 space-y-2">
                <div className="h-4 w-12 rounded bg-gray-200" />
                <div className="h-9 w-32 rounded bg-gray-200" />
              </div>
              <div className="h-14 w-full rounded-xl bg-gray-200" />
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded-full bg-gray-200" />
                  <div className="h-4 w-40 rounded bg-gray-100" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded-full bg-gray-200" />
                  <div className="h-4 w-48 rounded bg-gray-100" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
