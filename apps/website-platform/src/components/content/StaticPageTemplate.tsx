'use client';

import { ContentRenderer } from './ContentRenderer';

interface PageContent {
  id: string;
  body: string | null;
  bodyFormat: string;
  isAiGenerated: boolean;
  qualityScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StaticPage {
  id: string;
  title: string;
  metaDescription: string | null;
  content: PageContent | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StaticPageTemplateProps {
  page: StaticPage;
  siteName: string;
  pageType?: 'about' | 'contact' | 'legal';
}

/**
 * Generic template for static pages (About, Contact, Legal, etc.)
 */
export function StaticPageTemplate({ page, siteName, pageType = 'about' }: StaticPageTemplateProps) {
  const format = (page.content?.bodyFormat?.toLowerCase() || 'markdown') as
    | 'markdown'
    | 'html'
    | 'text';

  // Default content if no content exists yet
  const getDefaultContent = () => {
    switch (pageType) {
      case 'about':
        return `Welcome to ${siteName}. We are dedicated to helping you discover amazing travel experiences.

Our mission is to connect travellers with unforgettable experiences, making it easy to find, book, and enjoy activities and tours around the world.

## Our Story

${siteName} was created to simplify the way people discover and book travel experiences. We partner with local experts and tour operators to bring you authentic, high-quality experiences.

## What We Offer

- **Curated Experiences**: Every experience on our platform is carefully selected to ensure quality and authenticity
- **Easy Booking**: Simple, secure booking process with instant confirmation
- **Local Expertise**: Connect with knowledgeable local guides and operators
- **Customer Support**: Our team is here to help you every step of the way

## Our Commitment

We're committed to:
- Providing transparent pricing with no hidden fees
- Supporting sustainable and responsible tourism
- Ensuring the safety and satisfaction of all our customers

Thank you for choosing ${siteName} for your travel adventures.`;

      case 'contact':
        return `# Get in Touch

We'd love to hear from you. Whether you have a question about an experience, need help with a booking, or just want to say hello, we're here to help.

## Customer Support

For booking inquiries, cancellations, or general questions, our customer support team is available to assist you.

## Partnerships

Interested in listing your experiences with us? We're always looking to partner with quality tour operators and experience providers.

## Feedback

Your feedback helps us improve. If you've had an experience with us - good or bad - we want to know about it.

---

*Response times may vary, but we aim to get back to all enquiries within 24-48 hours.*`;

      case 'legal':
        return `This page contains important legal information about using ${siteName}.

Please read these terms carefully before using our services. By accessing or using our platform, you agree to be bound by these terms and conditions.

For the most up-to-date version of our legal documents, please check this page regularly.

---

*Last updated: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}*`;

      default:
        return 'Content coming soon.';
    }
  };

  const contentBody = page.content?.body || getDefaultContent();
  const showAiBadge = page.content?.isAiGenerated && page.content?.qualityScore;

  return (
    <article className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      {/* Page Header */}
      <header className="mb-8 border-b border-gray-200 pb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          {page.title}
        </h1>
        {page.metaDescription && (
          <p className="mt-4 text-lg text-gray-600">{page.metaDescription}</p>
        )}

        {/* Metadata badges */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          {showAiBadge && (
            <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
              AI Generated • Quality: {page.content?.qualityScore}/100
            </span>
          )}
          <span>
            Last updated:{' '}
            {page.updatedAt.toLocaleDateString('en-GB', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-none">
        <ContentRenderer content={contentBody} format={format} />
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-200 pt-8">
        <p className="text-sm text-gray-500">
          © {new Date().getFullYear()} {siteName}. All rights reserved.
        </p>
      </footer>
    </article>
  );
}
