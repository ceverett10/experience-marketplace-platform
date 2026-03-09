'use client';

/**
 * DestinationPageTemplate Component
 * Template for rendering destination guide pages from database.
 * Uses PremiumExperienceCard for consistent product card styling across the site.
 */

import React from 'react';
import { cleanPlainText } from '@/lib/seo';
import { ContentRenderer } from './ContentRenderer';
import type { PageStatus, ContentFormat } from '@prisma/client';
import Link from 'next/link';
import { PremiumExperienceCard } from '@/components/experiences/PremiumExperienceCard';
import type { ExperienceListItem } from '@/lib/holibob';

interface DestinationPageData {
  id: string;
  slug: string;
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  status: PageStatus;
  holibobLocationId?: string | null;
  content?: {
    id: string;
    body: string;
    bodyFormat: ContentFormat;
    structuredData?: any;
  } | null;
}

interface DestinationPageTemplateProps {
  destination: DestinationPageData;
  topExperiences?: ExperienceListItem[];
  siteName?: string;
  isPpc?: boolean;
  experienceCount?: number;
  priceRange?: { min: string; max: string } | null;
  /** Search term from site theme for "What" field on experiences page */
  searchTerm?: string;
}

/** Slugify a heading string for use as an anchor ID */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/** Extract H2 headings from markdown content for sidebar navigation */
function extractHeadings(body: string): { text: string; id: string }[] {
  const headingRegex = /^##\s+(.+)$/gm;
  const headings: { text: string; id: string }[] = [];
  let match;
  while ((match = headingRegex.exec(body)) !== null) {
    const text = match[1]?.trim();
    if (text) {
      headings.push({ text, id: slugify(text) });
    }
  }
  return headings;
}

/** Build the experiences page URL with Where/What params pre-populated */
function buildExperiencesUrl(destinationName: string, searchTerm?: string): string {
  const params = new URLSearchParams();
  params.set('destination', destinationName);
  if (searchTerm) {
    params.set('q', searchTerm);
  }
  return `/experiences?${params.toString()}`;
}

/** Badge types to assign to top-ranked cards */
const RANK_BADGES: Array<'topPick' | 'recommended' | 'bestseller'> = [
  'topPick',
  'recommended',
  'bestseller',
];

/**
 * Destination guide page template with SEO optimization
 */
export function DestinationPageTemplate({
  destination,
  topExperiences = [],
  siteName: _siteName,
  isPpc = false,
  experienceCount,
  priceRange,
  searchTerm,
}: DestinationPageTemplateProps) {
  if (!destination.content) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="border-l-4 border-yellow-400 bg-yellow-50 p-4">
          <p className="text-yellow-700">
            This destination guide is being generated. Please check back soon!
          </p>
        </div>
      </div>
    );
  }

  // Extract clean location name, handling "Travel Experiences in London" → "London"
  const inMatch = destination.title.match(/\b(?:in|near|around)\s+(.+)$/i);
  const destinationName = inMatch?.[1]?.trim()
    ? inMatch[1].trim()
    : destination.title.replace(/^(?:Discover|Visit|Explore|Travel Experiences?)\s+/i, '').trim() ||
      destination.title;
  const displayCount = experienceCount ?? topExperiences.length;

  if (isPpc) {
    return (
      <PpcLayout
        destination={destination}
        destinationName={destinationName}
        topExperiences={topExperiences}
        displayCount={displayCount}
        priceRange={priceRange}
        searchTerm={searchTerm}
      />
    );
  }

  return (
    <SeoLayout
      destination={destination}
      destinationName={destinationName}
      topExperiences={topExperiences}
      displayCount={displayCount}
      searchTerm={searchTerm}
    />
  );
}

/**
 * PPC variant — conversion-focused layout for paid traffic.
 * Compact hero, trust signals, product grid immediately, no long-form content.
 */
function PpcLayout({
  destination: _destination,
  destinationName,
  topExperiences,
  displayCount,
  priceRange,
  searchTerm,
}: {
  destination: DestinationPageData;
  destinationName: string;
  topExperiences: ExperienceListItem[];
  displayCount: number;
  priceRange?: { min: string; max: string } | null;
  searchTerm?: string;
}) {
  const experiencesUrl = buildExperiencesUrl(destinationName, searchTerm);

  return (
    <div className="min-h-screen">
      {/* Compact PPC Hero */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <h1 className="mb-2 text-2xl font-bold md:text-4xl">
            {displayCount > 0
              ? `${displayCount.toLocaleString()} ${destinationName} Experiences`
              : `${destinationName} Experiences`}
            {priceRange ? ` — From ${priceRange.min}` : ''}
          </h1>
          <p className="mb-4 text-base text-blue-100 md:text-lg">
            Compare & book with free cancellation and best price guarantee
          </p>
          <Link
            href="#experiences"
            className="inline-block rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50"
          >
            Browse Experiences
          </Link>
        </div>
      </header>

      {/* Trust Signals Bar */}
      <TrustSignalsBar />

      {/* Product Grid — immediately after hero */}
      {topExperiences.length > 0 && (
        <section id="experiences" className="py-8">
          <div className="mx-auto max-w-7xl px-4">
            <ExperienceGrid experiences={topExperiences} />
          </div>
        </section>
      )}

      {/* CTA Section */}
      <CtaSection destinationName={destinationName} experiencesUrl={experiencesUrl} />

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white p-3 shadow-lg md:hidden">
        <Link
          href="#experiences"
          className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white"
        >
          Browse {displayCount > 0 ? `${displayCount} ` : ''}Experiences
        </Link>
      </div>
    </div>
  );
}

/**
 * SEO variant — content-rich layout for organic traffic (original layout).
 */
function SeoLayout({
  destination,
  destinationName,
  topExperiences,
  displayCount,
  searchTerm,
}: {
  destination: DestinationPageData;
  destinationName: string;
  topExperiences: ExperienceListItem[];
  displayCount: number;
  searchTerm?: string;
}) {
  const experiencesUrl = buildExperiencesUrl(destinationName, searchTerm);
  const headings = destination.content ? extractHeadings(destination.content.body) : [];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <h1 className="mb-4 text-4xl font-bold md:text-6xl">{destination.title}</h1>

          {destination.metaDescription && (
            <p className="max-w-3xl text-xl leading-relaxed text-blue-100 md:text-2xl">
              {cleanPlainText(destination.metaDescription)}
            </p>
          )}

          {topExperiences.length > 0 && (
            <div className="mt-6 flex items-center gap-4">
              <Link
                href="#experiences"
                className="inline-block rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50"
              >
                Browse {displayCount > 0 ? `${displayCount} ` : ''}Experiences
              </Link>
              {displayCount > 0 && (
                <span className="text-sm text-blue-200">
                  {displayCount.toLocaleString()} available
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Trust Signals Bar */}
      <TrustSignalsBar />

      {/* Top Experiences Section — above content for conversion */}
      {topExperiences.length > 0 && (
        <section id="experiences" className="bg-gray-50 py-12">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="mb-2 text-3xl font-bold text-gray-900">
              Top Things to Do in {destinationName}
            </h2>
            <p className="mb-8 text-lg text-gray-600">
              Hand-picked experiences and activities for your visit
            </p>

            <ExperienceGrid experiences={topExperiences} />

            <div className="mt-8 text-center">
              <Link
                href={experiencesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-semibold text-blue-600 hover:text-blue-800 hover:underline"
              >
                View all experiences &rarr;
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* CTA Section — directly after product cards */}
      <CtaSection destinationName={destinationName} experiencesUrl={experiencesUrl} />

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Content Area */}
          <div className="lg:col-span-3">
            {destination.content && (
              <ContentRenderer
                content={destination.content.body}
                format={
                  destination.content.bodyFormat.toLowerCase() as 'markdown' | 'html' | 'text'
                }
              />
            )}
          </div>

          {/* Sidebar - Quick Info */}
          <aside className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              {/* Quick Links — dynamically extracted from content headings */}
              {headings.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">Quick Navigation</h3>
                  <nav className="space-y-2">
                    {headings.map((heading) => (
                      <a
                        key={heading.id}
                        href={`#${heading.id}`}
                        className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {heading.text}
                      </a>
                    ))}
                  </nav>
                </div>
              )}

              {/* Travel Tips */}
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
                <h3 className="mb-3 text-lg font-semibold text-gray-900">Travel Tips</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li>Book activities in advance</li>
                  <li>Check local weather</li>
                  <li>Learn basic phrases</li>
                  <li>Have local currency ready</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Bottom spacer for sticky mobile CTA */}
      <div className="h-16 md:hidden" />

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white p-3 shadow-lg md:hidden">
        <Link
          href="#experiences"
          className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white"
        >
          Browse {displayCount > 0 ? `${displayCount} ` : ''}Experiences
        </Link>
      </div>
    </div>
  );
}

/** Trust Signals Bar — shared between PPC and SEO layouts */
function TrustSignalsBar() {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-6 overflow-x-auto px-4 py-2.5">
        {[
          'Best Price Guarantee',
          'Free Cancellation',
          'Instant Confirmation',
          'Secure Payments',
        ].map((text) => (
          <div
            key={text}
            className="flex flex-shrink-0 items-center gap-1.5 text-xs font-medium text-gray-600"
          >
            <svg className="h-3.5 w-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** CTA Section — "Ready to Explore {City}?" */
function CtaSection({
  destinationName,
  experiencesUrl,
}: {
  destinationName: string;
  experiencesUrl: string;
}) {
  return (
    <section className="bg-gradient-to-r from-indigo-600 to-blue-600 py-12 text-white">
      <div className="mx-auto max-w-7xl px-4 text-center">
        <h2 className="mb-4 text-3xl font-bold">Ready to Explore {destinationName}?</h2>
        <p className="mb-6 text-xl text-blue-100">
          Browse all available activities and experiences
        </p>
        <Link
          href={experiencesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-lg bg-white px-8 py-3 font-semibold text-blue-600 transition-colors hover:bg-blue-50"
        >
          View All Experiences
        </Link>
      </div>
    </section>
  );
}

/**
 * Experience card grid using PremiumExperienceCard for consistent styling.
 */
function ExperienceGrid({ experiences }: { experiences: ExperienceListItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {experiences.map((experience, index) => (
        <PremiumExperienceCard
          key={experience.id}
          experience={experience}
          rank={index < 3 ? index + 1 : undefined}
          badges={index < 3 && RANK_BADGES[index] ? [RANK_BADGES[index]] : []}
          priority={index < 3}
        />
      ))}
    </div>
  );
}
