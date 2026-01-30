import { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

interface ConfirmationPageProps {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ pending?: string }>;
}

export async function generateMetadata({ params }: ConfirmationPageProps): Promise<Metadata> {
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
  const { pending } = await searchParams;
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const site = await getSiteFromHostname(host);
  const primaryColor = site.brand?.primaryColor ?? '#0d9488';

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

  // Format date
  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Get first availability for display
  const firstAvailability = booking.availabilityList?.nodes?.[0];
  const totalGuests = booking.availabilityList?.nodes?.reduce(
    (sum: number, avail: { personList?: { nodes: unknown[] } }) =>
      sum + (avail.personList?.nodes?.length ?? 0),
    0
  ) ?? 0;

  const isPending = pending === 'true' || booking.state === 'PENDING';
  const isConfirmed = booking.state === 'CONFIRMED';

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto max-w-2xl px-4">
        {/* Success/Pending Header */}
        <div className="rounded-xl bg-white p-8 text-center shadow-lg">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: `${primaryColor}20` }}
          >
            {isPending ? (
              <svg className="h-8 w-8 animate-pulse" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke={primaryColor}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke={primaryColor}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">
            {isPending ? 'Booking Processing...' : 'Booking Confirmed!'}
          </h1>
          <p className="mb-2 text-gray-600">
            Your booking reference is <span className="font-semibold">{booking.code ?? bookingId}</span>
          </p>
          {isPending && (
            <p className="text-sm text-amber-600">
              Your booking is being confirmed with the supplier. This usually takes a few minutes.
            </p>
          )}
          {booking.leadPassengerName && (
            <p className="mt-2 text-sm text-gray-500">
              Lead guest: {booking.leadPassengerName}
            </p>
          )}
        </div>

        {/* Voucher Download (if available) */}
        {booking.voucherUrl && isConfirmed && (
          <div className="mt-6 rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Your Voucher</h2>
            <p className="mb-4 text-sm text-gray-600">
              Download your voucher to present at the experience. You can also access it anytime from the confirmation email.
            </p>
            <a
              href={booking.voucherUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download Voucher (PDF)
            </a>
          </div>
        )}

        {/* Booking Details */}
        <div className="mt-6 rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Booking Details</h2>

          {firstAvailability && (
            <div className="space-y-4">
              {/* Experience */}
              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="font-medium text-gray-900">
                  {firstAvailability.product?.name ?? 'Experience'}
                </h3>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                    {formatDate(firstAvailability.date)}
                  </div>
                  {firstAvailability.startTime && (
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {firstAvailability.startTime}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                    {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
                  </div>
                </div>
              </div>

              {/* Guests */}
              {booking.availabilityList?.nodes?.map((avail: { id: string; personList?: { nodes: Array<{ id: string; pricingCategoryLabel?: string }> } }) => (
                avail.personList?.nodes?.map((person: { id: string; pricingCategoryLabel?: string }, index: number) => (
                  <div key={person.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <span className="font-medium text-gray-900">
                      Guest {index + 1}
                      {index === 0 && <span className="ml-2 text-xs text-gray-500">(Lead guest)</span>}
                    </span>
                    <span className="text-sm text-gray-500">{person.pricingCategoryLabel}</span>
                  </div>
                ))
              ))}

              {/* Payment Summary */}
              <div>
                <h3 className="mb-3 font-medium text-gray-900">Payment Summary</h3>
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="text-lg font-bold" style={{ color: primaryColor }}>
                      {booking.totalPrice?.grossFormattedText ?? '-'}
                    </span>
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
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white" style={{ backgroundColor: primaryColor }}>
                1
              </div>
              <div>
                <p className="font-medium text-gray-900">Check your email</p>
                <p>We&apos;ve sent your booking confirmation and voucher to your email address</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white" style={{ backgroundColor: primaryColor }}>
                2
              </div>
              <div>
                <p className="font-medium text-gray-900">Save your booking reference</p>
                <p>Keep your reference number <span className="font-semibold">{booking.code ?? bookingId}</span> handy for check-in</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white" style={{ backgroundColor: primaryColor }}>
                3
              </div>
              <div>
                <p className="font-medium text-gray-900">Arrive on time</p>
                <p>Please arrive at least 15 minutes before your scheduled time</p>
              </div>
            </div>
          </div>
        </div>

        {/* Cancellation Policy */}
        <div className="mt-6 rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Cancellation Policy</h2>
          <div className="flex items-start gap-3 text-sm text-gray-600">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-gray-900">Free cancellation up to 24 hours in advance</p>
              <p className="mt-1">If you need to cancel, please do so at least 24 hours before your scheduled experience time for a full refund.</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/experiences"
            className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Browse More Experiences
          </Link>
          {booking.voucherUrl && (
            <a
              href={booking.voucherUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download Voucher
            </a>
          )}
        </div>

        {/* Support */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Need help? Contact us at{' '}
            <a href={`mailto:support@${host}`} className="font-medium hover:underline" style={{ color: primaryColor }}>
              support@{host}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
