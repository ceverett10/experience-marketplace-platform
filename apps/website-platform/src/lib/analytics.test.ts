import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  trackSearch,
  trackViewItem,
  trackBeginCheckout,
  trackAddPaymentInfo,
  trackPurchase,
  trackGoogleAdsConversion,
  trackSelectContent,
  trackSelectCategory,
  trackSelectDestination,
} from '@/lib/analytics';

describe('analytics', () => {
  beforeEach(() => {
    window.gtag = vi.fn();
  });

  afterEach(() => {
    delete window.gtag;
  });

  describe('trackSearch', () => {
    it('calls gtag with search_term and destination', () => {
      trackSearch('hotels', 'London');
      expect(window.gtag).toHaveBeenCalledWith('event', 'search', {
        search_term: 'hotels',
        destination: 'London',
      });
    });

    it('omits destination when not provided', () => {
      trackSearch('hotels');
      expect(window.gtag).toHaveBeenCalledWith('event', 'search', {
        search_term: 'hotels',
      });
    });
  });

  describe('trackViewItem', () => {
    it('calls gtag with view_item event and items array', () => {
      trackViewItem({ id: 'prod-1', name: 'City Tour', price: 50, currency: 'GBP' });
      expect(window.gtag).toHaveBeenCalledWith('event', 'view_item', {
        items: [
          {
            item_id: 'prod-1',
            item_name: 'City Tour',
            price: 50,
            currency: 'GBP',
          },
        ],
      });
    });

    it('defaults currency to GBP when not provided', () => {
      trackViewItem({ id: 'prod-2', name: 'Museum Pass' });
      expect(window.gtag).toHaveBeenCalledWith('event', 'view_item', {
        items: [
          {
            item_id: 'prod-2',
            item_name: 'Museum Pass',
            price: undefined,
            currency: 'GBP',
          },
        ],
      });
    });
  });

  describe('trackBeginCheckout', () => {
    it('calls gtag with begin_checkout event', () => {
      trackBeginCheckout({ id: 'book-1', value: 100, currency: 'EUR' });
      expect(window.gtag).toHaveBeenCalledWith('event', 'begin_checkout', {
        transaction_id: 'book-1',
        value: 100,
        currency: 'EUR',
        items: [],
      });
    });

    it('defaults currency to GBP', () => {
      trackBeginCheckout({ id: 'book-2', value: 50 });
      expect(window.gtag).toHaveBeenCalledWith('event', 'begin_checkout', {
        transaction_id: 'book-2',
        value: 50,
        currency: 'GBP',
        items: [],
      });
    });
  });

  describe('trackAddPaymentInfo', () => {
    it('calls gtag with add_payment_info event', () => {
      trackAddPaymentInfo({ id: 'book-1', value: 75, currency: 'GBP' });
      expect(window.gtag).toHaveBeenCalledWith('event', 'add_payment_info', {
        transaction_id: 'book-1',
        value: 75,
        currency: 'GBP',
        payment_type: 'stripe',
      });
    });

    it('defaults currency to GBP', () => {
      trackAddPaymentInfo({ id: 'book-3' });
      expect(window.gtag).toHaveBeenCalledWith('event', 'add_payment_info', {
        transaction_id: 'book-3',
        value: undefined,
        currency: 'GBP',
        payment_type: 'stripe',
      });
    });
  });

  describe('trackPurchase', () => {
    it('calls gtag with purchase event', () => {
      trackPurchase({ id: 'book-1', value: 200, currency: 'USD', itemName: 'Boat Trip' });
      expect(window.gtag).toHaveBeenCalledWith('event', 'purchase', {
        transaction_id: 'book-1',
        value: 200,
        currency: 'USD',
        items: [{ item_name: 'Boat Trip' }],
      });
    });

    it('defaults currency to GBP and sends empty items when no itemName', () => {
      trackPurchase({ id: 'book-4', value: 120 });
      expect(window.gtag).toHaveBeenCalledWith('event', 'purchase', {
        transaction_id: 'book-4',
        value: 120,
        currency: 'GBP',
        items: [],
      });
    });
  });

  describe('trackGoogleAdsConversion', () => {
    it('calls gtag with conversion event and send_to', () => {
      trackGoogleAdsConversion('AW-123456/abcdef', { id: 'book-1', value: 99, currency: 'GBP' });
      expect(window.gtag).toHaveBeenCalledWith('event', 'conversion', {
        send_to: 'AW-123456/abcdef',
        transaction_id: 'book-1',
        value: 99,
        currency: 'GBP',
      });
    });
  });

  describe('trackSelectContent', () => {
    it('calls gtag with select_content event', () => {
      trackSelectContent('experience', 'exp-123');
      expect(window.gtag).toHaveBeenCalledWith('event', 'select_content', {
        content_type: 'experience',
        item_id: 'exp-123',
      });
    });
  });

  describe('trackSelectCategory', () => {
    it('calls gtag with select_content event and content_type "category"', () => {
      trackSelectCategory('food-tours');
      expect(window.gtag).toHaveBeenCalledWith('event', 'select_content', {
        content_type: 'category',
        item_id: 'food-tours',
      });
    });
  });

  describe('trackSelectDestination', () => {
    it('calls gtag with select_content event and content_type "destination"', () => {
      trackSelectDestination('London');
      expect(window.gtag).toHaveBeenCalledWith('event', 'select_content', {
        content_type: 'destination',
        item_id: 'London',
      });
    });
  });

  describe('when window.gtag is undefined', () => {
    it('does not throw an error for any tracking function', () => {
      delete window.gtag;

      expect(() => trackSearch('test')).not.toThrow();
      expect(() => trackViewItem({ id: '1', name: 'Test' })).not.toThrow();
      expect(() => trackBeginCheckout({ id: '1' })).not.toThrow();
      expect(() => trackAddPaymentInfo({ id: '1' })).not.toThrow();
      expect(() => trackPurchase({ id: '1' })).not.toThrow();
      expect(() => trackGoogleAdsConversion('AW-1/x', { id: '1' })).not.toThrow();
      expect(() => trackSelectContent('type', 'id')).not.toThrow();
      expect(() => trackSelectCategory('cat')).not.toThrow();
      expect(() => trackSelectDestination('dest')).not.toThrow();
    });
  });
});
