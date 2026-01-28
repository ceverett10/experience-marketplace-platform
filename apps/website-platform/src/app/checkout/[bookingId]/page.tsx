import { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';
import { CheckoutClient } from './CheckoutClient';

interface CheckoutPageProps {
  params: Promise<{ bookingId: string }>;
}

export async function generateMetadata({ params }: CheckoutPageProps): Promise<Metadata> {
  const { bookingId } = await params;
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const site = await getSiteFromHostname(host);

  return {
    title: `Checkout - ${site.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { bookingId } = await params;
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

  // If booking is already confirmed, redirect to confirmation
  if (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
    redirect(`/booking/confirmation/${bookingId}`);
  }

  // If booking is cancelled, show error
  if (booking.status === 'CANCELLED') {
    return (
      <main className="min-h-screen bg-gray-50 py-12">
        <div className="mx-auto max-w-2xl px-4">
          <div className="rounded-xl bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-8 w-8 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Booking Cancelled</h1>
            <p className="mb-6 text-gray-600">
              This booking has been cancelled and is no longer available.
            </p>
            <a
              href="/experiences"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Browse Experiences
            </a>
          </div>
        </div>
      </main>
    );
  }

  return <CheckoutClient booking={booking} site={site} />;
}
