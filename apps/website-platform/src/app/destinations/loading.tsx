export default function DestinationsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <div className="mx-auto h-8 w-48 animate-pulse rounded-lg bg-gray-200" />
        <div className="mx-auto mt-3 h-5 w-80 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="aspect-[4/3] animate-pulse bg-gray-200" />
            <div className="p-4">
              <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
              <div className="mt-2 h-4 w-full animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
