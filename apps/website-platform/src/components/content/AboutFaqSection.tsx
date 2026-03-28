'use client';

import { useState } from 'react';
import Link from 'next/link';

interface FaqItem {
  title: string;
  body: string;
  slug: string;
}

interface AboutFaqSectionProps {
  faqs: FaqItem[];
}

/**
 * FAQ accordion section for the About page.
 * Shows the first few FAQ pages as expandable items with a link to the full FAQ page.
 */
export function AboutFaqSection({ faqs }: AboutFaqSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (faqs.length === 0) return null;

  return (
    <section className="border-t border-gray-100 bg-gray-50 py-16">
      <div className="mx-auto max-w-4xl px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-base text-gray-600">Quick answers to common questions</p>
        </div>

        <div className="mt-10 space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            // Strip HTML tags and truncate for the preview
            const plainBody = faq.body
              .replace(/<[^>]*>/g, '')
              .replace(/\n{2,}/g, '\n')
              .trim();

            return (
              <div
                key={faq.slug}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                >
                  <span className="pr-4 text-base font-semibold text-gray-900">{faq.title}</span>
                  <svg
                    className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 px-6 pb-5 pt-4">
                    <p className="text-sm leading-relaxed text-gray-600 whitespace-pre-line">
                      {plainBody.length > 500 ? `${plainBody.slice(0, 500)}...` : plainBody}
                    </p>
                    {plainBody.length > 500 && (
                      <Link
                        href={`/${faq.slug}`}
                        className="mt-3 inline-block text-sm font-medium text-teal-600 hover:text-teal-700"
                      >
                        Read full answer
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Link to full FAQ page */}
        <div className="mt-8 text-center">
          <Link
            href="/faq"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            View all FAQs
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
