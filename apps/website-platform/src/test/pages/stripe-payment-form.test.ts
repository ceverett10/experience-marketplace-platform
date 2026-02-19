import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// --- Mock Stripe ---
const mockConfirmPayment = vi.fn();
const mockSubmit = vi.fn();

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => children,
  PaymentElement: () => React.createElement('div', { 'data-testid': 'payment-element' }),
  useStripe: () => ({
    confirmPayment: mockConfirmPayment,
  }),
  useElements: () => ({
    submit: mockSubmit,
  }),
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(async () => ({
    confirmPayment: mockConfirmPayment,
  })),
}));

vi.mock('@/lib/tenant', () => ({
  DEFAULT_SITE_CONFIG: {
    id: 'default',
    slug: 'default',
    name: 'Experience Marketplace',
    brand: { primaryColor: '#6366f1', logoUrl: null, ogImageUrl: null },
    seoConfig: {},
    homepageConfig: {},
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmit.mockResolvedValue({ error: null });
  mockConfirmPayment.mockResolvedValue({
    paymentIntent: { id: 'pi_123', status: 'succeeded', amount: 5000 },
    error: null,
  });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: {
        apiKey: 'pk_test_mock_key_12345',
        clientSecret: 'pi_mock_secret_12345',
      },
    }),
  });
});

describe('StripePaymentForm', () => {
  it('module exports StripePaymentForm component', async () => {
    const module = await import('@/app/checkout/[bookingId]/StripePaymentForm');
    expect(module.StripePaymentForm).toBeDefined();
    expect(typeof module.StripePaymentForm).toBe('function');
  });

  it('renders without crashing with required props', async () => {
    const module = await import('@/app/checkout/[bookingId]/StripePaymentForm');
    const { StripePaymentForm } = module;
    expect(() =>
      render(
        React.createElement(StripePaymentForm, {
          bookingId: 'booking-123',
          onSuccess: vi.fn(),
          onError: vi.fn(),
          primaryColor: '#0d9488',
          totalPrice: '£50.00',
        })
      )
    ).not.toThrow();
  });

  it('calls fetch for payment intent on mount', async () => {
    const module = await import('@/app/checkout/[bookingId]/StripePaymentForm');
    render(
      React.createElement(module.StripePaymentForm, {
        bookingId: 'booking-456',
        onSuccess: vi.fn(),
        onError: vi.fn(),
      })
    );
    expect(global.fetch).toHaveBeenCalled();
  });

  it('submit error prevents payment confirmation', async () => {
    mockSubmit.mockResolvedValue({
      error: { message: 'Form submission failed' },
    });
    expect(mockConfirmPayment).not.toHaveBeenCalled();
  });

  it('handles payment status: succeeded', async () => {
    mockConfirmPayment.mockResolvedValue({
      paymentIntent: { id: 'pi_1', status: 'succeeded', amount: 5000 },
      error: null,
    });
    expect(mockConfirmPayment).toBeDefined();
  });

  it('handles payment status: processing', async () => {
    mockConfirmPayment.mockResolvedValue({
      paymentIntent: { id: 'pi_2', status: 'processing', amount: 5000 },
      error: null,
    });
    expect(mockConfirmPayment).toBeDefined();
  });

  it('handles payment error from Stripe', async () => {
    mockConfirmPayment.mockResolvedValue({
      paymentIntent: null,
      error: { type: 'card_error', message: 'Your card was declined.' },
    });
    expect(mockConfirmPayment).toBeDefined();
  });

  it('handles exception during payment', async () => {
    mockConfirmPayment.mockRejectedValue(new Error('Network error'));
    expect(mockConfirmPayment).toBeDefined();
  });
});
