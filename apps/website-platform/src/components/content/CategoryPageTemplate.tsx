/**
 * CategoryPageTemplate Component
 * Template for rendering category landing pages from database
 */

import React from 'react';
import { ContentRenderer } from './ContentRenderer';
import type { PageStatus, ContentFormat } from '@prisma/client';
import Link from 'next/link';

interface CategoryPageData {
  id: string;
  slug: string;
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  status: PageStatus;
  holibobCategoryId?: string | null;
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
}

interface CategoryPageTemplateProps {
  category: CategoryPageData;
  relatedExperiences?: RelatedExperience[];
  siteName?: string;
}

/**
 * Category landing page template with SEO optimization
 */
export function CategoryPageTemplate({
  category,
  relatedExperiences = [],
  siteName,
}: CategoryPageTemplateProps) {
  if (!category.content) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-yellow-700">
            This category page is being generated. Please check back soon!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header Section */}
      <header className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">{category.title}</h1>

        {category.metaDescription && (
          <p className="text-xl text-gray-600 leading-relaxed max-w-3xl">
            {category.metaDescription}
          </p>
        )}
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Content Area */}
        <div className="lg:col-span-2">
          <ContentRenderer
            content={category.content.body}
            format={category.content.bodyFormat.toLowerCase() as 'markdown' | 'html' | 'text'}
          />
        </div>

        {/* Sidebar - Quick Facts or CTA */}
        <aside className="lg:col-span-1">
          <div className="sticky top-8">
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Why Book With {siteName || 'Us'}?
              </h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start">
                  <svg
                    className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Best price guarantee
                </li>
                <li className="flex items-start">
                  <svg
                    className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Free cancellation
                </li>
                <li className="flex items-start">
                  <svg
                    className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Instant confirmation
                </li>
                <li className="flex items-start">
                  <svg
                    className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  24/7 customer support
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>

      {/* Related Experiences Grid */}
      {relatedExperiences.length > 0 && (
        <section className="mt-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Popular {category.title}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {relatedExperiences.map((experience) => (
              <Link
                key={experience.id}
                href={`/experiences/${experience.slug}`}
                className="group bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow"
              >
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={experience.imageUrl}
                    alt={experience.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 right-3 bg-white px-2 py-1 rounded-md shadow-sm">
                    <span className="text-sm font-semibold text-gray-900">
                      {experience.price.formatted}
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  <h3 className="font-semibold text-lg text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {experience.title}
                  </h3>

                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {experience.shortDescription}
                  </p>

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
                      <span className="ml-1 text-gray-500">
                        ({experience.rating.count} reviews)
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
