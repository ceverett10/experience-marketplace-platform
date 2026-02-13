'use client';

import { useBrand } from '@/lib/site-context';

interface TrustSignalProps {
  className?: string;
}

interface StatProps {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

function Stat({ value, label, icon }: StatProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {icon && <div className="mb-2 text-teal-600">{icon}</div>}
      <p className="text-2xl font-bold text-gray-900 sm:text-3xl">{value}</p>
      <p className="mt-1 text-sm text-gray-600">{label}</p>
    </div>
  );
}

export function TrustSignals({ className = '' }: TrustSignalProps) {
  // Brand context available for future customization
  const _brand = useBrand();

  return (
    <section className={`py-12 ${className}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <Stat
            value="50,000+"
            label="Happy Travelers"
            icon={
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"
                />
              </svg>
            }
          />
          <Stat
            value="1,000+"
            label="Unique Experiences"
            icon={
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
                />
              </svg>
            }
          />
          <Stat
            value="4.8/5"
            label="Average Rating"
            icon={
              <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
                  clipRule="evenodd"
                />
              </svg>
            }
          />
          <Stat
            value="24/7"
            label="Customer Support"
            icon={
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
            }
          />
        </div>
      </div>
    </section>
  );
}

export function TrustBadges({ className = '' }: TrustSignalProps) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-6 ${className}`}>
      {/* Secure Payment */}
      <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2">
        <svg
          className="h-5 w-5 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
        <span className="text-sm font-medium text-gray-700">Secure Payment</span>
      </div>

      {/* Free Cancellation */}
      <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2">
        <svg
          className="h-5 w-5 text-teal-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z"
          />
        </svg>
        <span className="text-sm font-medium text-gray-700">Free Cancellation</span>
      </div>

      {/* Instant Confirmation */}
      <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2">
        <svg
          className="h-5 w-5 text-purple-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
          />
        </svg>
        <span className="text-sm font-medium text-gray-700">Instant Confirmation</span>
      </div>
    </div>
  );
}

export function ReviewHighlights({
  reviews,
  className = '',
}: {
  reviews: Array<{
    id: string;
    author: string;
    rating: number;
    text: string;
    date: string;
    avatar?: string;
  }>;
  className?: string;
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      {reviews.map((review) => (
        <div key={review.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            {review.avatar ? (
              <img
                src={review.avatar}
                alt={review.author}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                {review.author.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">{review.author}</p>
                <time className="text-xs text-gray-500">{review.date}</time>
              </div>
              <div className="mt-1 flex">
                {[...Array(5)].map((_, i) => (
                  <svg
                    key={i}
                    className={`h-4 w-4 ${i < review.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="mt-2 text-sm text-gray-600 line-clamp-3">{review.text}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LiveActivityIndicator({
  count = 0,
  className = '',
}: {
  count?: number;
  className?: string;
}) {
  if (count < 1) return null;

  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500"></span>
      </span>
      <span className="text-gray-600">
        <strong className="font-medium text-gray-900">{count}</strong>{' '}
        {count === 1 ? 'person is' : 'people are'} viewing this
      </span>
    </div>
  );
}

export function PopularityBadge({
  bookingsLast24h = 0,
  className = '',
}: {
  bookingsLast24h?: number;
  className?: string;
}) {
  if (bookingsLast24h < 5) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-sm ${className}`}
    >
      <svg className="h-4 w-4 text-rose-600" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z"
          clipRule="evenodd"
        />
      </svg>
      <span className="font-medium text-rose-700">
        Booked {bookingsLast24h} times in the last 24 hours
      </span>
    </div>
  );
}
