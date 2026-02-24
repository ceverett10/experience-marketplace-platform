/**
 * FAQPageTemplate Component
 * Template for rendering FAQ pages with collapsible Q&A sections
 */

import React from 'react';
import Link from 'next/link';
import { cleanPlainText } from '@/lib/seo';
import { ContentRenderer } from './ContentRenderer';
import type { PageStatus, ContentFormat } from '@prisma/client';

interface FAQPageData {
  id: string;
  slug: string;
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  status: PageStatus;
  createdAt: Date;
  updatedAt: Date;
  content?: {
    id: string;
    body: string;
    bodyFormat: ContentFormat;
    qualityScore?: number | null;
    readabilityScore?: number | null;
    isAiGenerated: boolean;
    aiModel?: string | null;
  } | null;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQPageTemplateProps {
  page: FAQPageData;
  siteName?: string;
  faqs?: FAQItem[];
}

/**
 * FAQ page template with structured Q&A display and SEO optimization
 */
export function FAQPageTemplate({ page, siteName, faqs = [] }: FAQPageTemplateProps) {
  if (!page.content) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-yellow-700">
            This FAQ page is being generated. Please check back soon!
          </p>
        </div>
      </div>
    );
  }

  // Format date
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(page.createdAt));

  return (
    <article className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 mb-4">
          <svg
            className="w-8 h-8 text-teal-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
            />
          </svg>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">
          {page.title}
        </h1>

        {page.metaDescription && (
          <p className="text-lg text-gray-600 mb-4 leading-relaxed max-w-2xl mx-auto">
            {cleanPlainText(page.metaDescription)}
          </p>
        )}

        <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
          <time dateTime={page.createdAt.toISOString()}>{formattedDate}</time>

          {faqs.length > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
              {faqs.length} {faqs.length === 1 ? 'Question' : 'Questions'}
            </span>
          )}
        </div>
      </header>

      {/* Quick Navigation for FAQs */}
      {faqs.length > 0 && (
        <nav className="mb-8 p-6 bg-gray-50 rounded-xl">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
            Jump to Question
          </h2>
          <ul className="space-y-2">
            {faqs.map((faq, index) => (
              <li key={index}>
                <a
                  href={`#faq-${index}`}
                  className="text-teal-600 hover:text-teal-800 hover:underline text-sm"
                >
                  {faq.question}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* FAQ Items as Accordion */}
      {faqs.length > 0 && (
        <div className="mb-12 space-y-4">
          {faqs.map((faq, index) => (
            <details
              key={index}
              id={`faq-${index}`}
              className="group border border-gray-200 rounded-xl overflow-hidden bg-white"
              open={index === 0}
            >
              <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-gray-50 transition-colors">
                <h3 className="text-lg font-semibold text-gray-900 pr-4">{faq.question}</h3>
                <svg
                  className="w-5 h-5 text-gray-500 transform transition-transform group-open:rotate-180 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                <ContentRenderer content={faq.answer} format="markdown" />
              </div>
            </details>
          ))}
        </div>
      )}

      {/* Full Content (if different from extracted FAQs) */}
      {faqs.length === 0 && (
        <div className="mb-12 prose prose-lg max-w-none">
          <ContentRenderer
            content={page.content.body}
            format={page.content.bodyFormat.toLowerCase() as 'markdown' | 'html' | 'text'}
          />
        </div>
      )}

      {/* Related Actions */}
      <div className="bg-gray-50 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Need More Help?</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/faq"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-teal-700 bg-teal-100 rounded-lg hover:bg-teal-200 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Browse All FAQs
          </Link>
          <Link
            href="/experiences"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            Browse Experiences
          </Link>
          <Link
            href="/about"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Contact Us
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t pt-8">
        <div className="text-center text-sm text-gray-500">
          <p>
            Last updated:{' '}
            {new Intl.DateTimeFormat('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }).format(new Date(page.updatedAt))}
          </p>
          {siteName && <p className="mt-2">Published by {siteName}</p>}
        </div>
      </footer>
    </article>
  );
}
