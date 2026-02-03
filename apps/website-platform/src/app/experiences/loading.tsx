export default function ExperiencesLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-gray-50">
      {/* Page Header skeleton */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <div className="mb-4 flex items-center gap-2">
            <div className="h-4 w-12 rounded bg-gray-200" />
            <div className="h-4 w-4 rounded bg-gray-100" />
            <div className="h-4 w-24 rounded bg-gray-200" />
          </div>
          {/* Title */}
          <div className="h-9 w-72 rounded bg-gray-200" />
          <div className="mt-2 h-6 w-96 rounded bg-gray-100" />
          {/* Search bar skeleton */}
          <div className="mt-6 h-14 w-full rounded-full bg-gray-200" />
          {/* Trust badges */}
          <div className="mt-6 flex gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-5 w-32 rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </header>

      {/* Grid skeleton */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="aspect-[4/3] bg-gray-200" />
              <div className="space-y-3 p-4">
                <div className="h-3 w-20 rounded bg-gray-200" />
                <div className="h-5 w-full rounded bg-gray-200" />
                <div className="h-4 w-3/4 rounded bg-gray-100" />
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, j) => (
                    <div key={j} className="h-3.5 w-3.5 rounded bg-gray-200" />
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <div className="h-4 w-16 rounded bg-gray-200" />
                  <div className="h-5 w-20 rounded bg-gray-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
