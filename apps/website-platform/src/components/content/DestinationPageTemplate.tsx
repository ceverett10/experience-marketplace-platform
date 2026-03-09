'use client';

/**
 * DestinationPageTemplate Component
 * Template for rendering destination guide pages from database.
 * Uses PremiumExperienceCard for consistent product cards across the site.
 */

import React from 'react';
import Link from 'next/link';
import { cleanPlainText } from '@/lib/seo';
import { ContentRenderer } from './ContentRenderer';
import { PremiumExperienceCard } from '@/components/experiences/PremiumExperienceCard';
import type { ExperienceListItem } from '@/lib/holibob';
import type { PageStatus, ContentFormat } from '@prisma/client';

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
  searchTerm?: string;
}

/** Slugify text for anchor IDs — must match ContentRenderer's slugifyHeading */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/** Extract H2 headings from markdown content for dynamic sidebar navigation */
function extractHeadings(body: string): { text: string; id: string }[] {
  const headingRegex = /^##\s+(.+)$/gm;
  const headings: { text: string; id: string }[] = [];
  let match;
  while ((match = headingRegex.exec(body)) !== null) {
    const text = match[1]?.trim() ?? '';
    if (text) {
      headings.push({ text, id: slugify(text) });
    }
  }
  return headings;
}

/** Build /experiences URL with destination and search term pre-populated */
function buildExperiencesUrl(destinationName: string, searchTerm?: string): string {
  const params = new URLSearchParams();
  params.set('destination', destinationName);
  if (searchTerm) params.set('q', searchTerm);
  return `/experiences?${params.toString()}`;
}

/** Deterministic badge assignment for experience cards */
const BADGE_ROTATION: ('topPick' | 'recommended' | 'bestseller')[] = [
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
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
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
  const experiencesUrl = buildExperiencesUrl(destinationName, searchTerm);

  if (isPpc) {
    return (
      <PpcLayout
        destination={destination}
        destinationName={destinationName}
        topExperiences={topExperiences}
        displayCount={displayCount}
        priceRange={priceRange}
        experiencesUrl={experiencesUrl}
      />
    );
  }

  return (
    <SeoLayout
      destination={destination}
      destinationName={destinationName}
      topExperiences={topExperiences}
      displayCount={displayCount}
      experiencesUrl={experiencesUrl}
    />
  );
}

/** Shared trust signals bar used by both layouts */
function TrustSignalsBar() {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl flex items-center justify-center gap-6 px-4 py-2.5 overflow-x-auto">
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

/** Shared CTA section */
function CtaSection({
  destinationName,
  experiencesUrl,
}: {
  destinationName: string;
  experiencesUrl: string;
}) {
  return (
    <section className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Explore {destinationName}?</h2>
        <p className="text-xl text-blue-100 mb-6">
          Browse all available activities and experiences
        </p>
        <Link
          href={experiencesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors"
        >
          View All Experiences
        </Link>
      </div>
    </section>
  );
}

/** Experience grid using PremiumExperienceCard */
function ExperienceGrid({ experiences }: { experiences: ExperienceListItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {experiences.map((experience, index) => (
        <PremiumExperienceCard
          key={experience.id}
          experience={experience}
          rank={index < 3 ? index + 1 : undefined}
          badges={index < 3 ? [BADGE_ROTATION[index % BADGE_ROTATION.length]!] : undefined}
        />
      ))}
    </div>
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
  experiencesUrl,
}: {
  destination: DestinationPageData;
  destinationName: string;
  topExperiences: ExperienceListItem[];
  displayCount: number;
  priceRange?: { min: string; max: string } | null;
  experiencesUrl: string;
}) {
  return (
    <div className="min-h-screen">
      {/* Compact PPC Hero */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-2xl md:text-4xl font-bold mb-2">
            {displayCount > 0
              ? `${displayCount.toLocaleString()} ${destinationName} Experiences`
              : `${destinationName} Experiences`}
            {priceRange ? ` — From ${priceRange.min}` : ''}
          </h1>
          <p className="text-base md:text-lg text-blue-100 mb-4">
            Compare & book with free cancellation and best price guarantee
          </p>
          <Link
            href="#experiences"
            className="inline-block bg-white text-blue-600 font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-50 transition-colors text-sm"
          >
            Browse Experiences
          </Link>
        </div>
      </header>

      <TrustSignalsBar />

      {/* Product Grid — immediately after hero */}
      {topExperiences.length > 0 && (
        <section id="experiences" className="py-8">
          <div className="max-w-7xl mx-auto px-4">
            <ExperienceGrid experiences={topExperiences} />
          </div>
        </section>
      )}

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
 * SEO variant — content-rich layout for organic traffic.
 */
function SeoLayout({
  destination,
  destinationName,
  topExperiences,
  displayCount,
  experiencesUrl,
}: {
  destination: DestinationPageData;
  destinationName: string;
  topExperiences: ExperienceListItem[];
  displayCount: number;
  experiencesUrl: string;
}) {
  // Extract headings from content for dynamic sidebar navigation
  const headings = destination.content ? extractHeadings(destination.content.body) : [];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">{destination.title}</h1>

          {destination.metaDescription && (
            <p className="text-xl md:text-2xl text-blue-100 max-w-3xl leading-relaxed">
              {cleanPlainText(destination.metaDescription)}
            </p>
          )}

          {topExperiences.length > 0 && (
            <div className="mt-6 flex items-center gap-4">
              <Link
                href="#experiences"
                className="inline-block bg-white text-blue-600 font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-50 transition-colors text-sm"
              >
                Browse {displayCount > 0 ? `${displayCount} ` : ''}Experiences
              </Link>
              {displayCount > 0 && (
                <span className="text-blue-200 text-sm">
                  {displayCount.toLocaleString()} available
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <TrustSignalsBar />

      {/* Top Experiences Section — above content for conversion */}
      {topExperiences.length > 0 && (
        <section id="experiences" className="bg-gray-50 py-12">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Top Things to Do in {destinationName}
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              Hand-picked experiences and activities for your visit
            </p>

            <ExperienceGrid experiences={topExperiences} />

            {displayCount > topExperiences.length && (
              <div className="mt-8 text-center">
                <Link
                  href={experiencesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-blue-600 font-semibold hover:text-blue-800 hover:underline"
                >
                  View all {displayCount.toLocaleString()} experiences &rarr;
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CTA — directly after product cards */}
      <CtaSection destinationName={destinationName} experiencesUrl={experiencesUrl} />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
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
                <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Navigation</h3>
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
              <div className="bg-yellow-50 rounded-lg p-6 border border-yellow-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Travel Tips</h3>
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
