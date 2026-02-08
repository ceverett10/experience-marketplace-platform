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
 * Get booking statistics for a specific product on a site
 * Used for displaying social proof ("Booked X times this week")
 * and urgency indicators ("High demand", "Trending")
 *
 * @param siteId - The site ID to scope the query
 * @param productId - The Holibob product ID
 * @returns Booking statistics for urgency messaging
 */
export async function getProductBookingStats(
  siteId: string,
  productId: string
): Promise<BookingStats> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Query bookings for this product in the last week
    // Only count CONFIRMED and COMPLETED bookings (not PENDING/CANCELLED)
    const bookings = await prisma.booking.findMany({
      where: {
        siteId,
        holibobProductId: productId,
        status: {
          in: ['CONFIRMED', 'COMPLETED'],
        },
        createdAt: {
          gte: oneWeekAgo,
        },
      },
      select: {
        createdAt: true,
      },
    });

    // Count bookings by time period
    const bookingsToday = bookings.filter((b) => b.createdAt >= oneDayAgo).length;
    const bookingsThisWeek = bookings.length;

    return {
      bookingsToday,
      bookingsThisWeek,
      isHighDemand: bookingsThisWeek >= THRESHOLDS.HIGH_DEMAND,
      isTrending: bookingsThisWeek >= THRESHOLDS.TRENDING,
    };
  } catch (error) {
    console.error('[BookingAnalytics] Error fetching booking stats:', error);
    // Return safe defaults on error
    return {
      bookingsToday: 0,
      bookingsThisWeek: 0,
      isHighDemand: false,
      isTrending: false,
    };
  }
}

/**
 * Check if booking stats should be displayed
 * Only show "Booked X times" if there are enough bookings to be meaningful
 */
export function shouldShowBookingCount(stats: BookingStats): boolean {
  return stats.bookingsThisWeek >= THRESHOLDS.MIN_DISPLAY_COUNT;
}

/**
 * Get trending products for a site
 * Returns product IDs sorted by booking velocity
 *
 * @param siteId - The site ID to scope the query
 * @param limit - Maximum number of products to return
 * @returns Array of product IDs with their booking counts
 */
export async function getTrendingProducts(
  siteId: string,
  limit: number = 10
): Promise<Array<{ productId: string; bookingsThisWeek: number }>> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Group bookings by product ID
    const bookingCounts = await prisma.booking.groupBy({
      by: ['holibobProductId'],
      where: {
        siteId,
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
