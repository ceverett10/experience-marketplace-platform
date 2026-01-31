'use client';

import { useState, useEffect } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

interface PaymentFormProps {
  onSuccess: () => void;
  onError: (error: string) => void;
  primaryColor?: string;
  totalPrice?: string;
}

function PaymentForm({
  onSuccess,
  onError,
  primaryColor = '#0d9488',
  totalPrice,
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      console.log('[StripePayment] Confirming payment...');
      console.log('[StripePayment] Elements ready:', !!elements);

      // Submit the form to get the payment method first
      const { error: submitError } = await elements.submit();
      if (submitError) {
        console.error('[StripePayment] Submit error:', submitError);
        setErrorMessage(submitError.message ?? 'Failed to submit payment form');
        onError(submitError.message ?? 'Failed to submit payment form');
        return;
      }

      console.log('[StripePayment] Form submitted, confirming payment...');
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      });

      console.log('[StripePayment] Confirmation result:', {
        error: error ? { type: error.type, code: error.code, message: error.message } : null,
        paymentIntent: paymentIntent
          ? { id: paymentIntent.id, status: paymentIntent.status, amount: paymentIntent.amount }
          : null,
      });

      if (error) {
        console.error('[StripePayment] Payment error:', error);
        setErrorMessage(error.message ?? 'Payment failed');
        onError(error.message ?? 'Payment failed');
      } else if (paymentIntent) {
        console.log('[StripePayment] Payment intent status:', paymentIntent.status);

        // Handle various successful/pending states
        switch (paymentIntent.status) {
          case 'succeeded':
            console.log('[StripePayment] Payment succeeded!');
            onSuccess();
            break;
          case 'processing':
            // Payment is processing - treat as success for now, webhook will confirm
            console.log('[StripePayment] Payment processing...');
            onSuccess();
            break;
          case 'requires_capture':
            // Payment authorized but needs capture - common for marketplaces
            console.log('[StripePayment] Payment authorized (requires capture)');
            onSuccess();
            break;
          case 'requires_action':
            // 3D Secure or other action required - Stripe handles this automatically
            console.log('[StripePayment] Requires action');
            setErrorMessage('Additional verification required. Please complete the verification.');
            break;
          case 'requires_payment_method':
            console.log('[StripePayment] Requires payment method - card was declined');
            setErrorMessage('Your card was declined. Please try a different payment method.');
            onError('Card declined');
            break;
          case 'requires_confirmation':
            console.log('[StripePayment] Requires confirmation - retrying...');
            // This shouldn't happen after confirmPayment, but handle it
            setErrorMessage('Please try again');
            break;
          default:
            console.log('[StripePayment] Unexpected status:', paymentIntent.status);
            setErrorMessage(`Payment status: ${paymentIntent.status}. Please try again.`);
            onError(`Unexpected payment status: ${paymentIntent.status}`);
        }
      } else {
        console.log('[StripePayment] No payment intent returned');
        setErrorMessage('Payment could not be processed. Please try again.');
        onError('No payment intent returned');
      }
    } catch (err) {
      console.error('[StripePayment] Exception:', err);
      const message = err instanceof Error ? err.message : 'Payment failed';
      setErrorMessage(message);
      onError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Accepted payment methods */}
      <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
        <span>We accept:</span>
        <div className="flex items-center gap-1.5">
          <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">VISA</span>
          <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">Mastercard</span>
          <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">Amex</span>
          <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">Apple Pay</span>
          <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">Google Pay</span>
        </div>
      </div>

      <PaymentElement
        options={{
          layout: 'tabs',
          paymentMethodOrder: ['card', 'apple_pay', 'google_pay'],
        }}
      />

      {errorMessage && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{errorMessage}</div>
      )}

      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full rounded-xl py-4 text-base font-semibold text-white transition-all hover:shadow-lg disabled:opacity-50"
        style={{ backgroundColor: primaryColor }}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Processing Payment...
          </span>
        ) : (
          `Pay ${totalPrice ?? ''}`
        )}
      </button>

      <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          SSL Encrypted
        </div>
        <span>|</span>
        <span>Secured by Stripe</span>
        <span>|</span>
        <span>PCI Compliant</span>
      </div>
    </form>
  );
}

interface StripePaymentFormProps {
  bookingId: string;
  onSuccess: () => void;
  onError: (error: string) => void;
  primaryColor?: string;
  totalPrice?: string;
}

export function StripePaymentForm({
  bookingId,
  onSuccess,
  onError,
  primaryColor = '#0d9488',
  totalPrice,
}: StripePaymentFormProps) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPaymentIntent = async () => {
      try {
        console.log('[StripePayment] Fetching payment intent for booking:', bookingId);
        const response = await fetch(`/api/booking/${bookingId}/payment-intent`);
        const result = await response.json();
        console.log('[StripePayment] Payment intent response:', result);

        if (!response.ok) {
          if (result.skipPayment) {
            // Payment not required - commit directly
            console.log('[StripePayment] Payment not required, committing directly');
            onSuccess();
            return;
          }
          throw new Error(result.error ?? 'Failed to initialize payment');
        }

        // Initialize Stripe with the API key from Holibob
        const stripeKey = result.data.apiKey;
        const clientSecretValue = result.data.clientSecret;

        console.log(
          '[StripePayment] Initializing Stripe with key:',
          stripeKey?.substring(0, 20) + '...'
        );
        console.log('[StripePayment] Client secret present:', !!clientSecretValue);

        if (!stripeKey || !clientSecretValue) {
          throw new Error('Missing Stripe API key or client secret from Holibob');
        }

        setStripePromise(loadStripe(stripeKey));
        setClientSecret(clientSecretValue);
      } catch (err) {
        console.error('[StripePayment] Error:', err);
        const message = err instanceof Error ? err.message : 'Failed to initialize payment';
        setError(message);
        onError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPaymentIntent();
  }, [bookingId, onSuccess, onError]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="h-8 w-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl bg-red-50 p-4 text-center text-sm text-red-600">{error}</div>;
  }

  if (!stripePromise || !clientSecret) {
    return (
      <div className="rounded-xl bg-yellow-50 p-4 text-center text-sm text-yellow-700">
        Unable to load payment form. Please try again.
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: primaryColor,
            borderRadius: '8px',
          },
        },
      }}
    >
      <PaymentForm
        onSuccess={onSuccess}
        onError={onError}
        primaryColor={primaryColor}
        totalPrice={totalPrice}
      />
    </Elements>
  );
}
