import { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

interface ConfirmationPageProps {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ session_id?: string }>;
}

export async function generateMetadata({ params }: ConfirmationPageProps): Promise<Metadata> {
  const { bookingId } = await params;
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const site = await getSiteFromHostname(host);

  return {
    title: `Booking Confirmed - ${site.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function ConfirmationPage({ params, searchParams }: ConfirmationPageProps) {
  const { bookingId } = await params;
  const { session_id } = await searchParams;
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const site = await getSiteFromHostname(host);

  // Get Holibob client
  const client = getHolibobClient(site);

  // Fetch booking
  let booking;
  try {
    booking = await client.getBooking(bookingId);
  } catch (error) {
    console.error('Error fetching booking:', error);
    notFound();
  }

  if (!booking) {
    notFound();
  }

  // Format price
  const formatPrice = (amount: number, currency: string): string => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  };

  // Format date
  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const item = booking.items?.[0];
  const totalGuests = item?.guests.length ?? 0;
  const bookingCurrency = booking.currency ?? 'GBP';

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto max-w-2xl px-4">
        {/* Success Header */}
        <div className="rounded-xl bg-white p-8 text-center shadow-lg">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: `${site.brand?.primaryColor ?? '#6366f1'}20` }}
          >
            <svg
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke={site.brand?.primaryColor ?? '#6366f1'}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Booking Confirmed!</h1>
          <p className="mb-6 text-gray-600">
            Your booking reference is <span className="font-semibold">{bookingId}</span>
          </p>
          <p className="text-sm text-gray-500">
            A confirmation email has been sent to {booking.customerEmail}
          </p>
        </div>

        {/* Booking Details */}
        <div className="mt-6 rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Booking Details</h2>

          {item && (
            <div className="space-y-4">
              {/* Experience */}
              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="font-medium text-gray-900">{item.productName}</h3>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                      />
                    </svg>
                    {formatDate(item.date)}
                  </div>
                  {item.startTime && (
                    <div className="flex items-center gap-2">
                      <svg
                        className="h-4 w-4"
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
                      {item.startTime}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4"
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
                    {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
                  </div>
                </div>
              </div>

              {/* Guests */}
              <div>
                <h3 className="mb-3 font-medium text-gray-900">Guests</h3>
                <div className="space-y-2">
                  {item.guests.map((guest, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
                    >
                      <div>
                        <span className="font-medium text-gray-900">
                          {guest.firstName} {guest.lastName}
                        </span>
                        {index === 0 && (
                          <span className="ml-2 text-xs text-gray-500">(Lead guest)</span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500 capitalize">{guest.guestTypeId}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Summary */}
              <div>
                <h3 className="mb-3 font-medium text-gray-900">Payment Summary</h3>
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">
                        {formatPrice(item.unitPrice, item.currency)} × {totalGuests} guests
                      </span>
                      <span className="font-medium text-gray-900">
                        {formatPrice(item.totalPrice, item.currency)}
                      </span>
                    </div>

                    {booking.fees !== undefined && booking.fees > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Service fee</span>
                        <span className="font-medium text-gray-900">
                          {formatPrice(booking.fees, bookingCurrency)}
                        </span>
                      </div>
                    )}

                    <div className="border-t border-gray-200 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">Total paid</span>
                        <span className="text-lg font-bold text-gray-900">
                          {formatPrice(booking.total ?? 0, bookingCurrency)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* What's Next */}
        <div className="mt-6 rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">What&apos;s Next?</h2>
          <div className="space-y-4 text-sm text-gray-600">
            <div className="flex items-start gap-3">
              <div
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: site.brand?.primaryColor ?? '#6366f1' }}
              >
                1
              </div>
              <div>
                <p className="font-medium text-gray-900">Check your email</p>
                <p>
                  We&apos;ve sent your booking confirmation and e-ticket to {booking.customerEmail}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: site.brand?.primaryColor ?? '#6366f1' }}
              >
                2
              </div>
              <div>
                <p className="font-medium text-gray-900">Save your booking reference</p>
                <p>
                  Keep your reference number <span className="font-semibold">{bookingId}</span>{' '}
                  handy for check-in
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: site.brand?.primaryColor ?? '#6366f1' }}
              >
                3
              </div>
              <div>
                <p className="font-medium text-gray-900">Arrive on time</p>
                <p>Please arrive at least 15 minutes before your scheduled time</p>
              </div>
            </div>
          </div>
        </div>

        {/* Cancellation Policy Reminder */}
        <div className="mt-6 rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Cancellation Policy</h2>
          <div className="flex items-start gap-3 text-sm text-gray-600">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-medium text-gray-900">
                Free cancellation up to 24 hours in advance
              </p>
              <p className="mt-1">
                If you need to cancel, please do so at least 24 hours before your scheduled
                experience time for a full refund.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/experiences"
            className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: site.brand?.primaryColor ?? '#6366f1' }}
          >
            Browse More Experiences
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
              />
            </svg>
            Print Confirmation
          </button>
        </div>

        {/* Support */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Need help? Contact us at{' '}
            <a
              href={`mailto:support@${host}`}
              className="font-medium hover:underline"
              style={{ color: site.brand?.primaryColor ?? '#6366f1' }}
            >
              support@{host}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
