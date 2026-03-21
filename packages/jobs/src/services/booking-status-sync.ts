/**
 * Booking Status Sync Service
 *
 * Checks PENDING bookings against Holibob and updates their status.
 * Only does work when PENDING bookings exist — no-ops otherwise.
 */

import { prisma } from '@experience-marketplace/database';
import { createHolibobClient } from '@experience-marketplace/holibob-api';

const MAX_AGE_HOURS_DEFAULT = 48;

function getHolibobClient() {
  const apiUrl = process.env['HOLIBOB_API_URL'];
  const partnerId = process.env['HOLIBOB_PARTNER_ID'];
  const apiKey = process.env['HOLIBOB_API_KEY'];
  const apiSecret = process.env['HOLIBOB_API_SECRET'];

  if (!apiUrl || !partnerId || !apiKey) {
    throw new Error(
      'Missing Holibob API configuration. Required: HOLIBOB_API_URL, HOLIBOB_PARTNER_ID, HOLIBOB_API_KEY'
    );
  }

  return createHolibobClient({ apiUrl, partnerId, apiKey, apiSecret });
}

interface SyncResult {
  checked: number;
  confirmed: number;
  cancelled: number;
  stillPending: number;
  errors: number;
}

export async function syncPendingBookingStatuses(options?: {
  bookingIds?: string[];
  maxAgeHours?: number;
}): Promise<SyncResult> {
  const maxAgeHours = options?.maxAgeHours ?? MAX_AGE_HOURS_DEFAULT;
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  // Find PENDING bookings — either specific IDs or all within the age window
  const pendingBookings = await prisma.booking.findMany({
    where: {
      status: 'PENDING',
      ...(options?.bookingIds
        ? { id: { in: options.bookingIds } }
        : { createdAt: { gte: cutoff } }),
    },
    select: {
      id: true,
      holibobBookingId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (pendingBookings.length === 0) {
    console.info('[Booking Sync] No pending bookings to check');
    return { checked: 0, confirmed: 0, cancelled: 0, stillPending: 0, errors: 0 };
  }

  console.info(
    `[Booking Sync] Checking ${pendingBookings.length} pending booking(s) against Holibob`
  );

  const client = getHolibobClient();
  const result: SyncResult = {
    checked: 0,
    confirmed: 0,
    cancelled: 0,
    stillPending: 0,
    errors: 0,
  };

  for (const booking of pendingBookings) {
    try {
      const holibobBooking = await client.getBooking(booking.holibobBookingId);
      result.checked++;

      if (!holibobBooking) {
        console.warn(
          `[Booking Sync] Booking ${booking.holibobBookingId} not found in Holibob — skipping`
        );
        result.errors++;
        continue;
      }

      const newStatus =
        holibobBooking.state === 'CONFIRMED' || holibobBooking.state === 'COMPLETED'
          ? 'CONFIRMED'
          : holibobBooking.state === 'CANCELLED' || holibobBooking.state === 'REJECTED'
            ? 'CANCELLED'
            : null; // Still PENDING — no update needed

      if (newStatus) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: newStatus,
            ...(newStatus === 'CONFIRMED' ? { completedAt: new Date() } : {}),
          },
        });

        if (newStatus === 'CONFIRMED') result.confirmed++;
        if (newStatus === 'CANCELLED') result.cancelled++;

        console.info(`[Booking Sync] Updated ${booking.holibobBookingId}: PENDING → ${newStatus}`);
      } else {
        result.stillPending++;
      }
    } catch (error) {
      result.errors++;
      console.error(
        `[Booking Sync] Error checking ${booking.holibobBookingId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.info(
    `[Booking Sync] Done: ${result.checked} checked, ${result.confirmed} confirmed, ${result.cancelled} cancelled, ${result.stillPending} still pending, ${result.errors} errors`
  );

  return result;
}
