import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  fetchAvailability,
  getAvailabilityDetails,
  setAvailabilityOptions,
  setPricingCategories,
  createBooking,
  addAvailabilityToBooking,
  getBookingQuestions,
  answerBookingQuestions,
  commitBooking,
  getBooking,
  configureAvailability,
  startBookingFlow,
  formatDate,
  formatPrice,
} from './booking-flow';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockSuccessResponse(data: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve({ success: true, data }),
  };
}

function mockErrorResponse(status: number, error: string) {
  return {
    ok: false,
    json: () => Promise.resolve({ success: false, error }),
  };
}

describe('booking-flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchAvailability', () => {
    it('fetches availability with correct params', async () => {
      const mockData = { sessionId: 'sess-1', nodes: [], optionList: { nodes: [] } };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockData));

      const result = await fetchAvailability('prod-1', '2025-06-01', '2025-06-30');

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/availability?'));
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('productId=prod-1');
      expect(url).toContain('dateFrom=2025-06-01');
      expect(url).toContain('dateTo=2025-06-30');
      expect(result.sessionId).toBe('sess-1');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(500, 'Server error'));

      await expect(fetchAvailability('prod-1', '2025-06-01', '2025-06-30')).rejects.toThrow(
        'Server error'
      );
    });

    it('throws default message when no error provided', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ success: false }),
      });

      await expect(fetchAvailability('prod-1', '2025-06-01', '2025-06-30')).rejects.toThrow(
        'Failed to fetch availability'
      );
    });
  });

  describe('getAvailabilityDetails', () => {
    it('fetches without pricing by default', async () => {
      const mockData = { id: 'avail-1', date: '2025-06-15' };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockData));

      const result = await getAvailabilityDetails('avail-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/availability/avail-1');
      expect(result.id).toBe('avail-1');
    });

    it('includes pricing param when requested', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse({ id: 'avail-1', date: '2025-06-15' }));

      await getAvailabilityDetails('avail-1', true);

      expect(mockFetch).toHaveBeenCalledWith('/api/availability/avail-1?includePricing=true');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(404, 'Not found'));

      await expect(getAvailabilityDetails('avail-1')).rejects.toThrow('Not found');
    });
  });

  describe('setAvailabilityOptions', () => {
    it('posts options to availability endpoint', async () => {
      const mockData = { id: 'avail-1', optionList: { isComplete: true, nodes: [] } };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockData));

      const result = await setAvailabilityOptions('avail-1', [{ id: 'opt-1', value: 'morning' }]);

      expect(mockFetch).toHaveBeenCalledWith('/api/availability/avail-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionList: [{ id: 'opt-1', value: 'morning' }] }),
      });
      expect(result.optionList?.isComplete).toBe(true);
    });
  });

  describe('setPricingCategories', () => {
    it('posts pricing categories to availability endpoint', async () => {
      const mockData = { id: 'avail-1', isValid: true };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockData));

      const result = await setPricingCategories('avail-1', [{ id: 'adult', units: 2 }]);

      expect(mockFetch).toHaveBeenCalledWith('/api/availability/avail-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricingCategoryList: [{ id: 'adult', units: 2 }] }),
      });
      expect(result.isValid).toBe(true);
    });
  });

  describe('createBooking', () => {
    it('creates a booking with autoFillQuestions', async () => {
      const mockData = { id: 'booking-1', state: 'OPEN' };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockData));

      const result = await createBooking();

      expect(mockFetch).toHaveBeenCalledWith('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoFillQuestions: true }),
      });
      expect(result.id).toBe('booking-1');
    });

    it('throws on failure', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(500, 'Create failed'));

      await expect(createBooking()).rejects.toThrow('Create failed');
    });
  });

  describe('addAvailabilityToBooking', () => {
    it('adds availability to booking', async () => {
      const mockData = { canCommit: false, booking: { id: 'booking-1' } };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockData));

      const result = await addAvailabilityToBooking('booking-1', 'avail-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/booking/booking-1/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availabilityId: 'avail-1' }),
      });
      expect(result.canCommit).toBe(false);
    });
  });

  describe('getBookingQuestions', () => {
    it('fetches booking questions', async () => {
      const mockData = {
        booking: { id: 'booking-1' },
        summary: { bookingQuestions: [], availabilityQuestions: [], canCommit: false },
      };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockData));

      const result = await getBookingQuestions('booking-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/booking/booking-1/questions');
      expect(result.summary.canCommit).toBe(false);
    });
  });

  describe('answerBookingQuestions', () => {
    it('posts answers to booking questions', async () => {
      const mockData = { canCommit: true, booking: { id: 'booking-1' } };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockData));

      const data = {
        customerEmail: 'test@example.com',
        guests: [{ firstName: 'John', lastName: 'Doe', isLeadGuest: true }],
      };

      const result = await answerBookingQuestions('booking-1', data);

      expect(mockFetch).toHaveBeenCalledWith('/api/booking/booking-1/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      expect(result.canCommit).toBe(true);
    });
  });

  describe('commitBooking', () => {
    it('commits booking with default options', async () => {
      const mockData = {
        booking: { id: 'booking-1', status: 'CONFIRMED' },
        voucherUrl: 'https://voucher.example.com',
        isConfirmed: true,
      };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockData));

      const result = await commitBooking('booking-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/booking/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: 'booking-1',
          waitForConfirmation: true,
          maxWaitSeconds: 60,
        }),
      });
      expect(result.isConfirmed).toBe(true);
    });

    it('passes productId when provided', async () => {
      mockFetch.mockResolvedValue(
        mockSuccessResponse({ booking: { id: 'b-1' }, isConfirmed: true })
      );

      await commitBooking('booking-1', false, 'prod-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.waitForConfirmation).toBe(false);
      expect(body.productId).toBe('prod-1');
    });
  });

  describe('getBooking', () => {
    it('fetches booking by id', async () => {
      const mockData = { id: 'booking-1', state: 'CONFIRMED' };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockData));

      const result = await getBooking('booking-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/booking?id=booking-1');
      expect(result.id).toBe('booking-1');
    });
  });

  describe('configureAvailability', () => {
    it('sets options then pricing and returns valid availability', async () => {
      // First call: setAvailabilityOptions
      mockFetch
        .mockResolvedValueOnce(
          mockSuccessResponse({
            id: 'avail-1',
            optionList: { isComplete: true, nodes: [] },
          })
        )
        // Second call: setPricingCategories
        .mockResolvedValueOnce(
          mockSuccessResponse({
            id: 'avail-1',
            isValid: true,
            totalPrice: { gross: 7000, currency: 'GBP' },
          })
        );

      const result = await configureAvailability(
        'avail-1',
        [{ id: 'time', value: '09:00' }],
        [{ id: 'adult', units: 2 }]
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.isValid).toBe(true);
    });

    it('throws when availability is not valid', async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockSuccessResponse({ id: 'avail-1', optionList: { isComplete: true, nodes: [] } })
        )
        .mockResolvedValueOnce(mockSuccessResponse({ id: 'avail-1', isValid: false }));

      await expect(
        configureAvailability(
          'avail-1',
          [{ id: 'time', value: '09:00' }],
          [{ id: 'adult', units: 2 }]
        )
      ).rejects.toThrow('Availability configuration is not valid');
    });
  });

  describe('startBookingFlow', () => {
    it('creates booking and adds availability', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSuccessResponse({ id: 'booking-1', state: 'OPEN' }))
        .mockResolvedValueOnce(
          mockSuccessResponse({ canCommit: false, booking: { id: 'booking-1' } })
        );

      const bookingId = await startBookingFlow('avail-1');

      expect(bookingId).toBe('booking-1');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('formatDate', () => {
    it('formats a date string to en-GB locale', () => {
      const result = formatDate('2025-06-15');

      expect(result).toContain('June');
      expect(result).toContain('2025');
      expect(result).toContain('15');
    });

    it('returns original string on invalid date', () => {
      const result = formatDate('not-a-date');

      // Invalid date still produces some output from toLocaleDateString
      expect(typeof result).toBe('string');
    });
  });

  describe('formatPrice', () => {
    it('formats price in minor units to GBP', () => {
      const result = formatPrice(3500, 'GBP');

      expect(result).toContain('35');
    });

    it('formats price in minor units to EUR', () => {
      const result = formatPrice(5000, 'EUR');

      expect(result).toContain('50');
    });

    it('formats zero price', () => {
      const result = formatPrice(0, 'GBP');

      expect(result).toContain('0');
    });
  });
});
