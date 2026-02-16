import { Metadata } from 'next';
import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
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

  // Booking data is fetched client-side via /api/booking route
  // This allows Playwright E2E tests to intercept the request
  return <CheckoutClient bookingId={bookingId} site={site} />;
}
