/**
 * ContentRenderer Component
 * Renders markdown/HTML content from database with proper sanitization
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

interface ContentRendererProps {
  content: string;
  format?: 'markdown' | 'html' | 'text';
  className?: string;
}

/**
 * Renders content in various formats with proper sanitization
 */
export function ContentRenderer({
  content,
  format = 'markdown',
  className = '',
}: ContentRendererProps) {
  // For plain text, render directly
  if (format === 'text') {
    return (
      <div className={`prose prose-lg max-w-none ${className}`}>
        {content.split('\n').map((paragraph, idx) => (
          <p key={idx}>{paragraph}</p>
        ))}
      </div>
    );
  }

  // For HTML, render with sanitization
  if (format === 'html') {
    return (
      <div
        className={`prose prose-lg max-w-none ${className}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // For markdown (default), use react-markdown with plugins
  return (
    <div className={`prose prose-lg max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          // Customize heading rendering
          h1: ({ children }) => (
            <h1 className="text-4xl font-bold mb-6 text-gray-900">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-3xl font-bold mb-4 mt-8 text-gray-900">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-2xl font-semibold mb-3 mt-6 text-gray-900">{children}</h3>
          ),
          // Customize paragraph spacing
          p: ({ children }) => <p className="mb-4 text-gray-700 leading-relaxed">{children}</p>,
          // Customize links
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-blue-600 hover:text-blue-800 underline"
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
            >
              {children}
            </a>
          ),
          // Customize lists
          ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-2 text-gray-700">{children}</ol>,
          li: ({ children }) => <li className="text-gray-700">{children}</li>,
          // Customize blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 pl-4 italic my-4 text-gray-600">
              {children}
            </blockquote>
          ),
          // Customize code blocks
          code: ({ className, children }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono">
                  {children}
                </code>
              );
            }
            return (
              <code
                className={`${className} block bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto`}
              >
                {children}
              </code>
            );
          },
          // Customize images
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt || ''}
              className="rounded-lg shadow-md my-6 w-full"
              loading="lazy"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
