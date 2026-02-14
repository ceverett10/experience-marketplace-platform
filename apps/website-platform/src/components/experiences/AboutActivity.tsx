function getCancellationDeadline(): string {
  const date = new Date();
  date.setDate(date.getDate() + 6);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface AboutActivityProps {
  duration: string;
  hasFreeCancellation: boolean;
  languages?: string[];
  cancellationPolicy?: string;
}

export function AboutActivity({
  duration,
  hasFreeCancellation,
  languages,
  cancellationPolicy,
}: AboutActivityProps) {
  const cancellationDate = getCancellationDeadline();

  return (
    <section className="mb-8">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">About this activity</h2>
      <div className="space-y-4">
        {/* Free Cancellation */}
        {hasFreeCancellation && (
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50">
              <svg
                className="h-5 w-5 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Free cancellation before {cancellationDate}</p>
              <p className="text-sm text-gray-500">
                {cancellationPolicy || 'Cancel up to 24 hours in advance for a full refund'}
              </p>
            </div>
          </div>
        )}

        {/* Reserve Now Pay Later */}
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <svg
              className="h-5 w-5 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-gray-900">Reserve now & pay later</p>
            <p className="text-sm text-gray-500">
              Keep your travel plans flexible — book your spot and pay nothing today
            </p>
          </div>
        </div>

        {/* Duration */}
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <svg
              className="h-5 w-5 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-gray-900">Duration {duration}</p>
            <p className="text-sm text-gray-500">Check availability to see starting times</p>
          </div>
        </div>

        {/* Languages */}
        {languages && languages.length > 0 && (
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
              <svg
                className="h-5 w-5 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Live tour guide</p>
              <p className="text-sm text-gray-500">{languages.join(', ')}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
