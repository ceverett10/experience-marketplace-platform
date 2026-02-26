/**
 * Booking Analytics Service
 * Provides real-time booking statistics for urgency messaging and social proof
 */

import { prisma } from './prisma';

/**
 * Booking statistics for a product
 */
export interface BookingStats {
  /** Number of bookings in the last 24 hours */
  bookingsToday: number;
  /** Number of bookings in the last 7 days */
  bookingsThisWeek: number;
  /** Number of bookings in the last 30 days */
  bookingsThisMonth: number;
  /** True if more than 5 bookings this week (high demand) */
  isHighDemand: boolean;
  /** True if more than 10 bookings this week (trending) */
  isTrending: boolean;
}

/**
 * Thresholds for urgency indicators
 */
const THRESHOLDS = {
  /** Minimum bookings this week to show "Booked X times" */
  MIN_DISPLAY_COUNT: 3,
  /** Bookings this week threshold for "high demand" badge */
  HIGH_DEMAND: 5,
  /** Bookings this week threshold for "trending" badge */
  TRENDING: 10,
};

/**
 * Get booking statistics for a specific product on a site or microsite
 * Used for displaying social proof ("Booked X times this week")
 * and urgency indicators ("High demand", "Trending")
 *
 * @param siteId - The site or microsite ID to scope the query
 * @param productId - The Holibob product ID
 * @param micrositeId - Optional microsite ID (if booking is on a microsite)
 * @returns Booking statistics for urgency messaging
 */
export async function getProductBookingStats(
  siteId: string,
  productId: string,
  micrositeId?: string
): Promise<BookingStats> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Query bookings for this product in the last 30 days
    // Only count CONFIRMED and COMPLETED bookings (not PENDING/CANCELLED)
    // Check both siteId and micrositeId to include all booking sources
    const bookings = await prisma.booking.findMany({
      where: {
        OR: [{ siteId }, ...(micrositeId ? [{ micrositeId }] : [])],
        holibobProductId: productId,
        status: {
          in: ['CONFIRMED', 'COMPLETED'],
        },
        createdAt: {
          gte: oneMonthAgo,
        },
      },
      select: {
        createdAt: true,
      },
    });

    // Count bookings by time period
    const bookingsToday = bookings.filter((b) => b.createdAt >= oneDayAgo).length;
    const bookingsThisWeek = bookings.filter((b) => b.createdAt >= oneWeekAgo).length;
    const bookingsThisMonth = bookings.length;

    return {
      bookingsToday,
      bookingsThisWeek,
      bookingsThisMonth,
      isHighDemand: bookingsThisWeek >= THRESHOLDS.HIGH_DEMAND,
      isTrending: bookingsThisWeek >= THRESHOLDS.TRENDING,
    };
  } catch (error) {
    console.error('[BookingAnalytics] Error fetching booking stats:', error);
    // Return safe defaults on error
    return {
      bookingsToday: 0,
      bookingsThisWeek: 0,
      bookingsThisMonth: 0,
      isHighDemand: false,
      isTrending: false,
    };
  }
}

/**
 * Check if booking stats should be displayed
 * Shows weekly count if >= 3/week, otherwise monthly count if >= 1/month
 */
export function shouldShowBookingCount(stats: BookingStats): boolean {
  return stats.bookingsThisWeek >= THRESHOLDS.MIN_DISPLAY_COUNT || stats.bookingsThisMonth >= 1;
}

/**
 * Get trending products for a site or microsite
 * Returns product IDs sorted by booking velocity
 *
 * @param siteId - The site ID to scope the query
 * @param limit - Maximum number of products to return
 * @param micrositeId - Optional microsite ID (if on a microsite)
 * @returns Array of product IDs with their booking counts
 */
export async function getTrendingProducts(
  siteId: string,
  limit: number = 10,
  micrositeId?: string
): Promise<Array<{ productId: string; bookingsThisWeek: number }>> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Group bookings by product ID (include both site and microsite bookings)
    const bookingCounts = await prisma.booking.groupBy({
      by: ['holibobProductId'],
      where: {
        OR: [{ siteId }, ...(micrositeId ? [{ micrositeId }] : [])],
        holibobProductId: { not: null },
        status: {
          in: ['CONFIRMED', 'COMPLETED'],
        },
        createdAt: {
          gte: oneWeekAgo,
        },
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: limit,
    });

    return bookingCounts
      .filter((b) => b.holibobProductId !== null)
      .map((b) => ({
        productId: b.holibobProductId!,
        bookingsThisWeek: b._count.id,
      }));
  } catch (error) {
    console.error('[BookingAnalytics] Error fetching trending products:', error);
    return [];
  }
}
