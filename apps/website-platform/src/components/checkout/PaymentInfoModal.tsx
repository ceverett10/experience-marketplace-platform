'use client';

import { useEffect } from 'react';

interface PaymentInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteName: string;
  primaryColor?: string;
}

export function PaymentInfoModal({
  isOpen,
  onClose,
  siteName,
  primaryColor = '#0d9488',
}: PaymentInfoModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4"
          style={{ borderBottomColor: primaryColor }}
        >
          <h2 className="text-xl font-bold text-gray-900">About Your Payment</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[calc(90vh-140px)] overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            {/* Secure Payment Processing */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                  <svg
                    className="h-5 w-5 text-emerald-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Secure Payment Processing</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Your payment is securely processed by Holibob, the technology platform that powers{' '}
                  {siteName} and the Experiencess.com network. All transactions use bank-grade
                  encryption via Stripe.
                </p>
              </div>
            </div>

            {/* Bank Statement */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                  <svg
                    className="h-5 w-5 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Your Bank Statement</h3>
                <p className="mt-1 text-sm text-gray-600">
                  The charge on your bank or credit card statement will appear as{' '}
                  <span className="font-semibold">&quot;HOLIBOB LTD UK&quot;</span>. This is the
                  company that processes all bookings across the Experiencess.com network on behalf
                  of {siteName}.
                </p>
              </div>
            </div>

            {/* How It Works */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
                  <svg
                    className="h-5 w-5 text-purple-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">How It Works</h3>
                <p className="mt-1 text-sm text-gray-600">
                  {siteName} is part of the Experiencess.com network, a collection of specialist
                  experience brands. Holibob Ltd provides the booking technology and payment
                  processing for all brands in the network. Your booking is fully protected under
                  Holibob&apos;s terms of service.
                </p>
              </div>
            </div>

            {/* Booking Protection */}
            <div className="rounded-xl bg-gray-50 p-5">
              <h3 className="font-semibold text-gray-900">Your Booking Is Protected</h3>
              <ul className="mt-3 space-y-2">
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                  Secure payment via Stripe (PCI DSS compliant)
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                  Free cancellation based on the terms of the experience you are booking
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                  Full customer support from the Holibob team
                </li>
              </ul>
            </div>

            <p className="text-center text-xs text-gray-400">
              Questions? Contact us at support@holibob.tech
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t bg-white px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg py-3 font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
