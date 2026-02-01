/**
 * BlogPostTemplate Component
 * Template for rendering blog post pages from database
 */

import React from 'react';
import { ContentRenderer } from './ContentRenderer';
import type { PageStatus, ContentFormat } from '@prisma/client';

interface BlogPostData {
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

interface BlogPostTemplateProps {
  post: BlogPostData;
  siteName?: string;
}

/**
 * Blog post page template with SEO optimization
 */
export function BlogPostTemplate({ post, siteName }: BlogPostTemplateProps) {
  if (!post.content) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-yellow-700">
            This blog post is being generated. Please check back soon!
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
  }).format(new Date(post.createdAt));

  return (
    <article className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8 border-b pb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
          {post.title}
        </h1>

        {post.metaDescription && (
          <p className="text-xl text-gray-600 mb-4 leading-relaxed">{post.metaDescription}</p>
        )}

        <div className="flex items-center gap-4 text-sm text-gray-500">
          <time dateTime={post.createdAt.toISOString()}>{formattedDate}</time>

          {post.content.isAiGenerated && post.content.aiModel && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              AI-Generated
            </span>
          )}

          {post.content.qualityScore && post.content.qualityScore >= 80 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              High Quality
            </span>
          )}

          {post.updatedAt.getTime() !== post.createdAt.getTime() && (
            <span className="text-xs">
              Updated:{' '}
              {new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              }).format(new Date(post.updatedAt))}
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="mb-12">
        <ContentRenderer
          content={post.content.body}
          format={post.content.bodyFormat.toLowerCase() as 'markdown' | 'html' | 'text'}
        />
      </div>

      {/* Footer */}
      <footer className="border-t pt-8 mt-12">
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">About {siteName || 'Us'}</h3>
          <p className="text-gray-600 text-sm">
            We provide comprehensive guides and information about travel experiences, activities,
            and destinations to help you plan your perfect trip.
          </p>
        </div>
      </footer>
    </article>
  );
}
