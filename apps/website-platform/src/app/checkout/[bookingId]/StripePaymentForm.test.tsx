import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StripePaymentForm } from './StripePaymentForm';

// ── Stripe mocks ────────────────────────────────────────────────────────────

const mockConfirmPayment = vi.fn();
const mockSubmit = vi.fn();

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: any) => <div data-testid="stripe-elements">{children}</div>,
  PaymentElement: () => <div data-testid="payment-element">Payment Element</div>,
  useStripe: () => ({ confirmPayment: mockConfirmPayment }),
  useElements: () => ({ submit: mockSubmit }),
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}));

// ── fetch mock ──────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── helpers ─────────────────────────────────────────────────────────────────

function paymentIntentResponse(overrides: Record<string, any> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data: {
          apiKey: 'pk_test_abc123',
          clientSecret: 'pi_test_secret_abc',
          ...overrides,
        },
      }),
  };
}

function errorResponse(error: string, extra: Record<string, any> = {}) {
  return {
    ok: false,
    json: () => Promise.resolve({ error, ...extra }),
  };
}

const defaultProps = {
  bookingId: 'booking-123',
  onSuccess: vi.fn(),
  onError: vi.fn(),
};

describe('StripePaymentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmit.mockResolvedValue({ error: null });
    mockConfirmPayment.mockResolvedValue({
      error: null,
      paymentIntent: { id: 'pi_1', status: 'succeeded', amount: 5000 },
    });
  });

  // ── Loading state ───────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows a spinner while fetching the payment intent', () => {
      // Never resolve, so loading persists
      mockFetch.mockReturnValue(new Promise(() => {}));

      const { container } = render(<StripePaymentForm {...defaultProps} />);
      // The spinner SVG has an animate-spin class
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  // ── Error states ────────────────────────────────────────────────────────

  describe('error states', () => {
    it('renders an error message when the payment-intent endpoint returns an error', async () => {
      mockFetch.mockResolvedValue(errorResponse('Booking not found'));

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Booking not found')).toBeInTheDocument();
      });
      expect(defaultProps.onError).toHaveBeenCalledWith('Booking not found');
    });

    it('renders an error when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Network failure')).toBeInTheDocument();
      });
      expect(defaultProps.onError).toHaveBeenCalledWith('Network failure');
    });

    it('renders an error when apiKey is missing from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { apiKey: null, clientSecret: 'pi_secret' },
          }),
      });

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByText('Missing Stripe API key or client secret from Holibob')
        ).toBeInTheDocument();
      });
    });

    it('renders an error when clientSecret is missing from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { apiKey: 'pk_test_abc', clientSecret: null },
          }),
      });

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByText('Missing Stripe API key or client secret from Holibob')
        ).toBeInTheDocument();
      });
    });
  });

  // ── Skip payment (no payment required) ──────────────────────────────────

  describe('skip payment', () => {
    it('calls onSuccess directly when skipPayment is true', async () => {
      mockFetch.mockResolvedValue(errorResponse('No payment needed', { skipPayment: true }));

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalled();
      });
    });
  });

  // ── Successful load / rendering ─────────────────────────────────────────

  describe('successful load', () => {
    it('fetches the payment intent for the given bookingId', async () => {
      mockFetch.mockResolvedValue(paymentIntentResponse());

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/booking/booking-123/payment-intent');
      });
    });

    it('renders the Stripe Elements wrapper and PaymentElement', async () => {
      mockFetch.mockResolvedValue(paymentIntentResponse());

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('stripe-elements')).toBeInTheDocument();
        expect(screen.getByTestId('payment-element')).toBeInTheDocument();
      });
    });

    it('renders the accepted payment method badges', async () => {
      mockFetch.mockResolvedValue(paymentIntentResponse());

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('VISA')).toBeInTheDocument();
        expect(screen.getByText('Mastercard')).toBeInTheDocument();
        expect(screen.getByText('Amex')).toBeInTheDocument();
        expect(screen.getByText('Apple Pay')).toBeInTheDocument();
        expect(screen.getByText('Google Pay')).toBeInTheDocument();
      });
    });

    it('renders the submit button with totalPrice', async () => {
      mockFetch.mockResolvedValue(paymentIntentResponse());

      render(<StripePaymentForm {...defaultProps} totalPrice="£49.99" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Pay £49\.99/i })).toBeInTheDocument();
      });
    });

    it('renders the submit button without price when totalPrice is not provided', async () => {
      mockFetch.mockResolvedValue(paymentIntentResponse());

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Pay/i })).toBeInTheDocument();
      });
    });

    it('applies the primary color to the pay button', async () => {
      mockFetch.mockResolvedValue(paymentIntentResponse());

      render(<StripePaymentForm {...defaultProps} primaryColor="#ff0000" />);

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /Pay/i });
        expect(button).toHaveStyle({ backgroundColor: '#ff0000' });
      });
    });

    it('renders security badges (SSL, Stripe, PCI)', async () => {
      mockFetch.mockResolvedValue(paymentIntentResponse());

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('SSL Encrypted')).toBeInTheDocument();
        expect(screen.getByText('Secured by Stripe')).toBeInTheDocument();
        expect(screen.getByText('PCI Compliant')).toBeInTheDocument();
        expect(screen.getByText('Statement: HOLIBOB LTD UK')).toBeInTheDocument();
      });
    });
  });

  // ── Form submission ─────────────────────────────────────────────────────

  describe('form submission', () => {
    async function renderAndSubmit(props: Record<string, any> = {}) {
      mockFetch.mockResolvedValue(paymentIntentResponse());

      render(<StripePaymentForm {...defaultProps} {...props} />);

      await waitFor(() => {
        expect(screen.getByTestId('payment-element')).toBeInTheDocument();
      });

      const button = screen.getByRole('button', { name: /Pay/i });
      await act(async () => {
        fireEvent.click(button);
      });
    }

    it('calls elements.submit() then stripe.confirmPayment()', async () => {
      await renderAndSubmit();

      expect(mockSubmit).toHaveBeenCalled();
      expect(mockConfirmPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          elements: expect.anything(),
          redirect: 'if_required',
        })
      );
    });

    it('calls onSuccess when payment succeeds', async () => {
      await renderAndSubmit();

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalled();
      });
    });

    it('calls onSuccess when status is processing', async () => {
      mockConfirmPayment.mockResolvedValue({
        error: null,
        paymentIntent: { id: 'pi_1', status: 'processing', amount: 5000 },
      });

      await renderAndSubmit();

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalled();
      });
    });

    it('calls onSuccess when status is requires_capture', async () => {
      mockConfirmPayment.mockResolvedValue({
        error: null,
        paymentIntent: { id: 'pi_1', status: 'requires_capture', amount: 5000 },
      });

      await renderAndSubmit();

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalled();
      });
    });

    it('shows error when elements.submit() fails', async () => {
      mockSubmit.mockResolvedValue({
        error: { message: 'Card number is incomplete' },
      });

      await renderAndSubmit();

      await waitFor(() => {
        expect(screen.getByText('Card number is incomplete')).toBeInTheDocument();
      });
      expect(defaultProps.onError).toHaveBeenCalledWith('Card number is incomplete');
      expect(mockConfirmPayment).not.toHaveBeenCalled();
    });

    it('shows error when confirmPayment returns an error', async () => {
      mockConfirmPayment.mockResolvedValue({
        error: { message: 'Your card was declined.' },
        paymentIntent: null,
      });

      await renderAndSubmit();

      await waitFor(() => {
        expect(screen.getByText('Your card was declined.')).toBeInTheDocument();
      });
      expect(defaultProps.onError).toHaveBeenCalledWith('Your card was declined.');
    });

    it('shows error when status is requires_payment_method (card declined)', async () => {
      mockConfirmPayment.mockResolvedValue({
        error: null,
        paymentIntent: { id: 'pi_1', status: 'requires_payment_method', amount: 5000 },
      });

      await renderAndSubmit();

      await waitFor(() => {
        expect(
          screen.getByText('Your card was declined. Please try a different payment method.')
        ).toBeInTheDocument();
      });
      expect(defaultProps.onError).toHaveBeenCalledWith('Card declined');
    });

    it('shows verification message when status is requires_action', async () => {
      mockConfirmPayment.mockResolvedValue({
        error: null,
        paymentIntent: { id: 'pi_1', status: 'requires_action', amount: 5000 },
      });

      await renderAndSubmit();

      await waitFor(() => {
        expect(
          screen.getByText('Additional verification required. Please complete the verification.')
        ).toBeInTheDocument();
      });
    });

    it('shows retry message when status is requires_confirmation', async () => {
      mockConfirmPayment.mockResolvedValue({
        error: null,
        paymentIntent: { id: 'pi_1', status: 'requires_confirmation', amount: 5000 },
      });

      await renderAndSubmit();

      await waitFor(() => {
        expect(screen.getByText('Please try again')).toBeInTheDocument();
      });
    });

    it('handles unexpected payment intent status', async () => {
      mockConfirmPayment.mockResolvedValue({
        error: null,
        paymentIntent: { id: 'pi_1', status: 'canceled', amount: 5000 },
      });

      await renderAndSubmit();

      await waitFor(() => {
        expect(screen.getByText('Payment status: canceled. Please try again.')).toBeInTheDocument();
      });
      expect(defaultProps.onError).toHaveBeenCalledWith('Unexpected payment status: canceled');
    });

    it('shows error when no paymentIntent is returned', async () => {
      mockConfirmPayment.mockResolvedValue({
        error: null,
        paymentIntent: null,
      });

      await renderAndSubmit();

      await waitFor(() => {
        expect(
          screen.getByText('Payment could not be processed. Please try again.')
        ).toBeInTheDocument();
      });
      expect(defaultProps.onError).toHaveBeenCalledWith('No payment intent returned');
    });

    it('handles exception during payment confirmation', async () => {
      mockConfirmPayment.mockRejectedValue(new Error('Network error'));

      await renderAndSubmit();

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
      expect(defaultProps.onError).toHaveBeenCalledWith('Network error');
    });

    it('shows processing state on the button during submission', async () => {
      // Make confirmPayment hang to keep isProcessing true
      mockConfirmPayment.mockReturnValue(new Promise(() => {}));
      mockFetch.mockResolvedValue(paymentIntentResponse());

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('payment-element')).toBeInTheDocument();
      });

      const button = screen.getByRole('button', { name: /Pay/i });
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('Processing Payment...')).toBeInTheDocument();
      });
    });
  });

  // ── Fallback: no stripe / no clientSecret after load ────────────────────

  describe('missing stripe or clientSecret after load', () => {
    it('shows a warning when stripePromise is unavailable', async () => {
      // Simulate: endpoint returns ok but both keys are missing
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { apiKey: '', clientSecret: '' },
          }),
      });

      render(<StripePaymentForm {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByText('Missing Stripe API key or client secret from Holibob')
        ).toBeInTheDocument();
      });
    });
  });
});
