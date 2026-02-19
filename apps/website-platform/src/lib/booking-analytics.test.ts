import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany, mockGroupBy } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockGroupBy: vi.fn(),
}));

vi.mock('./prisma', () => ({
  prisma: {
    booking: {
      findMany: mockFindMany,
      groupBy: mockGroupBy,
    },
  },
}));

import {
  getProductBookingStats,
  shouldShowBookingCount,
  getTrendingProducts,
} from './booking-analytics';

describe('booking-analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProductBookingStats', () => {
    it('counts bookings today and this week', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      mockFindMany.mockResolvedValue([
        { createdAt: twoHoursAgo }, // today
        { createdAt: twoHoursAgo }, // today
        { createdAt: threeDaysAgo }, // this week but not today
      ]);

      const stats = await getProductBookingStats('site-1', 'prod-1');

      expect(stats.bookingsToday).toBe(2);
      expect(stats.bookingsThisWeek).toBe(3);
    });

    it('queries with correct filters', async () => {
      mockFindMany.mockResolvedValue([]);

      await getProductBookingStats('site-1', 'prod-1');

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            siteId: 'site-1',
            holibobProductId: 'prod-1',
            status: { in: ['CONFIRMED', 'COMPLETED'] },
            createdAt: { gte: expect.any(Date) },
          }),
        })
      );
    });

    it('sets isHighDemand when >= 5 bookings this week', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 60 * 60 * 1000);
      mockFindMany.mockResolvedValue(Array.from({ length: 5 }, () => ({ createdAt: recentDate })));

      const stats = await getProductBookingStats('site-1', 'prod-1');

      expect(stats.isHighDemand).toBe(true);
      expect(stats.isTrending).toBe(false);
    });

    it('sets isTrending when >= 10 bookings this week', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 60 * 60 * 1000);
      mockFindMany.mockResolvedValue(Array.from({ length: 10 }, () => ({ createdAt: recentDate })));

      const stats = await getProductBookingStats('site-1', 'prod-1');

      expect(stats.isTrending).toBe(true);
      expect(stats.isHighDemand).toBe(true);
    });

    it('returns safe defaults on error', async () => {
      mockFindMany.mockRejectedValue(new Error('DB error'));

      const stats = await getProductBookingStats('site-1', 'prod-1');

      expect(stats).toEqual({
        bookingsToday: 0,
        bookingsThisWeek: 0,
        isHighDemand: false,
        isTrending: false,
      });
    });
  });

  describe('shouldShowBookingCount', () => {
    it('returns true when >= 3 bookings this week', () => {
      expect(
        shouldShowBookingCount({
          bookingsToday: 0,
          bookingsThisWeek: 3,
          isHighDemand: false,
          isTrending: false,
        })
      ).toBe(true);
    });

    it('returns false when < 3 bookings this week', () => {
      expect(
        shouldShowBookingCount({
          bookingsToday: 1,
          bookingsThisWeek: 2,
          isHighDemand: false,
          isTrending: false,
        })
      ).toBe(false);
    });
  });

  describe('getTrendingProducts', () => {
    it('returns products sorted by booking count', async () => {
      mockGroupBy.mockResolvedValue([
        { holibobProductId: 'prod-a', _count: { id: 15 } },
        { holibobProductId: 'prod-b', _count: { id: 8 } },
      ]);

      const result = await getTrendingProducts('site-1');

      expect(result).toEqual([
        { productId: 'prod-a', bookingsThisWeek: 15 },
        { productId: 'prod-b', bookingsThisWeek: 8 },
      ]);
    });

    it('filters out null productIds', async () => {
      mockGroupBy.mockResolvedValue([
        { holibobProductId: 'prod-a', _count: { id: 5 } },
        { holibobProductId: null, _count: { id: 3 } },
      ]);

      const result = await getTrendingProducts('site-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.productId).toBe('prod-a');
    });

    it('respects limit parameter', async () => {
      mockGroupBy.mockResolvedValue([]);

      await getTrendingProducts('site-1', 5);

      expect(mockGroupBy).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });

    it('returns empty array on error', async () => {
      mockGroupBy.mockRejectedValue(new Error('DB error'));

      const result = await getTrendingProducts('site-1');
      expect(result).toEqual([]);
    });
  });
});
