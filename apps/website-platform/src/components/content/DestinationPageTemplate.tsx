/**
 * DestinationPageTemplate Component
 * Template for rendering destination guide pages from database
 */

import React from 'react';
import Image from 'next/image';
import { cleanPlainText } from '@/lib/seo';
import { ContentRenderer } from './ContentRenderer';
import type { PageStatus, ContentFormat } from '@prisma/client';
import Link from 'next/link';
import { BLUR_PLACEHOLDER, isHolibobImage } from '@/lib/image-utils';

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

interface RelatedExperience {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  imageUrl: string;
  price: {
    formatted: string;
  };
  rating: {
    average: number;
    count: number;
  } | null;
  categories: {
    name: string;
  }[];
}

interface DestinationPageTemplateProps {
  destination: DestinationPageData;
  topExperiences?: RelatedExperience[];
  siteName?: string;
  isPpc?: boolean;
  experienceCount?: number;
  priceRange?: { min: string; max: string } | null;
}

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

  if (isPpc) {
    return (
      <PpcLayout
        destination={destination}
        destinationName={destinationName}
        topExperiences={topExperiences}
        displayCount={displayCount}
        priceRange={priceRange}
      />
    );
  }

  return (
    <SeoLayout
      destination={destination}
      destinationName={destinationName}
      topExperiences={topExperiences}
    />
  );
}

/**
 * PPC variant — conversion-focused layout for paid traffic.
 * Compact hero, trust signals, product grid immediately, no long-form content.
 */
function PpcLayout({
  destination,
  destinationName,
  topExperiences,
  displayCount,
  priceRange,
}: {
  destination: DestinationPageData;
  destinationName: string;
  topExperiences: RelatedExperience[];
  displayCount: number;
  priceRange?: { min: string; max: string } | null;
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

      {/* Trust Signals Bar */}
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

      {/* Product Grid — immediately after hero */}
      {topExperiences.length > 0 && (
        <section id="experiences" className="py-8">
          <div className="max-w-7xl mx-auto px-4">
            <ExperienceGrid experiences={topExperiences} />
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-10">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-3">Ready to Explore {destinationName}?</h2>
          <p className="text-lg text-blue-100 mb-5">
            Browse all available activities and experiences
          </p>
          <Link
            href="/experiences"
            className="inline-block bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors"
          >
            View All Experiences
          </Link>
        </div>
      </section>

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
}: {
  destination: DestinationPageData;
  destinationName: string;
  topExperiences: RelatedExperience[];
}) {
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
        </div>
      </header>

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
              {/* Quick Links */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Navigation</h3>
                <nav className="space-y-2">
                  <a
                    href="#things-to-do"
                    className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Things to Do
                  </a>
                  <a
                    href="#best-time"
                    className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Best Time to Visit
                  </a>
                  <a
                    href="#getting-around"
                    className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Getting Around
                  </a>
                  <a
                    href="#where-to-stay"
                    className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Where to Stay
                  </a>
                </nav>
              </div>

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

      {/* Top Experiences Section */}
      {topExperiences.length > 0 && (
        <section className="bg-gray-50 py-16 mt-12">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Top Things to Do in {destinationName}
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              Hand-picked experiences and activities for your visit
            </p>

            <ExperienceGrid experiences={topExperiences} />
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Explore {destinationName}?</h2>
          <p className="text-xl text-blue-100 mb-6">
            Browse all available activities and experiences
          </p>
          <Link
            href="/experiences"
            className="inline-block bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors"
          >
            View All Experiences
          </Link>
        </div>
      </section>
    </div>
  );
}

/**
 * Shared experience card grid used by both PPC and SEO layouts.
 */
function ExperienceGrid({ experiences }: { experiences: RelatedExperience[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {experiences.map((experience) => (
        <Link
          key={experience.id}
          href={`/experiences/${experience.slug}`}
          className="group bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow"
        >
          <div className="relative h-56 overflow-hidden bg-gray-200">
            <Image
              src={experience.imageUrl}
              alt={experience.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              placeholder="blur"
              blurDataURL={BLUR_PLACEHOLDER}
              unoptimized={isHolibobImage(experience.imageUrl)}
            />
            <div className="absolute top-3 right-3 bg-white px-3 py-1 rounded-md shadow-sm z-10">
              <span className="text-sm font-semibold text-gray-900">
                {experience.price.formatted}
              </span>
            </div>
            {experience.categories[0] && (
              <div className="absolute bottom-3 left-3 bg-blue-600 text-white px-3 py-1 rounded-md text-xs font-medium z-10">
                {experience.categories[0].name}
              </div>
            )}
          </div>

          <div className="p-5">
            <h3 className="font-semibold text-lg text-gray-900 mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
              {experience.title}
            </h3>

            <p className="text-sm text-gray-600 mb-4 line-clamp-2">{experience.shortDescription}</p>

            {experience.rating && (
              <div className="flex items-center text-sm">
                <div className="flex items-center">
                  <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                  </svg>
                  <span className="ml-1 font-medium text-gray-900">
                    {experience.rating.average.toFixed(1)}
                  </span>
                </div>
                <span className="ml-1 text-gray-500">({experience.rating.count} reviews)</span>
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
