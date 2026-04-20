export default function BlogLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <div className="mx-auto h-8 w-32 animate-pulse rounded-lg bg-gray-200" />
        <div className="mx-auto mt-3 h-5 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="aspect-[16/9] animate-pulse bg-gray-200" />
            <div className="p-5">
              <div className="h-5 w-3/4 animate-pulse rounded bg-gray-200" />
              <div className="mt-2 h-4 w-full animate-pulse rounded bg-gray-100" />
              <div className="mt-1 h-4 w-2/3 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
