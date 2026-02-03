export default function CheckoutLoading() {
  return (
    <main className="min-h-screen animate-pulse bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <div className="mb-6 h-5 w-32 rounded bg-gray-200" />

        <div className="grid gap-8 lg:grid-cols-5">
          {/* Left column */}
          <div className="space-y-6 lg:col-span-3">
            {/* Booking details */}
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <div className="h-6 w-40 rounded bg-gray-200" />
              <div className="mt-4 space-y-3">
                <div className="h-4 w-full rounded bg-gray-100" />
                <div className="h-4 w-3/4 rounded bg-gray-100" />
                <div className="h-4 w-1/2 rounded bg-gray-100" />
              </div>
            </div>

            {/* Guest details form */}
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <div className="h-6 w-48 rounded bg-gray-200" />
              <div className="mt-4 space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i}>
                    <div className="mb-1 h-4 w-24 rounded bg-gray-200" />
                    <div className="h-10 w-full rounded-lg bg-gray-100" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column - Order summary */}
          <div className="lg:col-span-2">
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <div className="h-6 w-32 rounded bg-gray-200" />
              <div className="mt-4 space-y-3">
                <div className="flex justify-between">
                  <div className="h-4 w-24 rounded bg-gray-100" />
                  <div className="h-4 w-16 rounded bg-gray-100" />
                </div>
                <div className="flex justify-between">
                  <div className="h-4 w-20 rounded bg-gray-100" />
                  <div className="h-4 w-16 rounded bg-gray-100" />
                </div>
                <div className="border-t border-gray-200 pt-3">
                  <div className="flex justify-between">
                    <div className="h-5 w-16 rounded bg-gray-200" />
                    <div className="h-5 w-20 rounded bg-gray-200" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
