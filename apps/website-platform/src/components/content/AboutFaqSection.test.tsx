import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AboutFaqSection } from './AboutFaqSection';

const mockFaqs = [
  {
    title: 'How do I book an experience?',
    body: 'You can book directly through our website by selecting your preferred experience and date.',
    slug: 'faq/how-to-book',
  },
  {
    title: 'What is the cancellation policy?',
    body: 'Cancellation policies vary by experience. Please check the specific experience page for details.',
    slug: 'faq/cancellation-policy',
  },
  {
    title: 'Do you offer group discounts?',
    body: '<p>Yes, many of our experiences offer group pricing. Contact us for details about groups of 10 or more.</p>',
    slug: 'faq/group-discounts',
  },
];

describe('AboutFaqSection', () => {
  it('renders nothing when faqs is empty', () => {
    const { container } = render(<AboutFaqSection faqs={[]} />);
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders section heading', () => {
    render(<AboutFaqSection faqs={mockFaqs} />);
    expect(screen.getByText('Frequently Asked Questions')).toBeDefined();
  });

  it('renders all FAQ titles', () => {
    render(<AboutFaqSection faqs={mockFaqs} />);
    expect(screen.getByText('How do I book an experience?')).toBeDefined();
    expect(screen.getByText('What is the cancellation policy?')).toBeDefined();
    expect(screen.getByText('Do you offer group discounts?')).toBeDefined();
  });

  it('expands FAQ on click', () => {
    render(<AboutFaqSection faqs={mockFaqs} />);

    // Body should not be visible initially
    expect(screen.queryByText(/You can book directly through our website/)).toBeNull();

    // Click to expand
    fireEvent.click(screen.getByText('How do I book an experience?'));

    // Body should now be visible
    expect(screen.getByText(/You can book directly through our website/)).toBeDefined();
  });

  it('collapses FAQ when clicked again', () => {
    render(<AboutFaqSection faqs={mockFaqs} />);

    // Expand
    fireEvent.click(screen.getByText('How do I book an experience?'));
    expect(screen.getByText(/You can book directly through our website/)).toBeDefined();

    // Collapse
    fireEvent.click(screen.getByText('How do I book an experience?'));
    expect(screen.queryByText(/You can book directly through our website/)).toBeNull();
  });

  it('only one FAQ is expanded at a time', () => {
    render(<AboutFaqSection faqs={mockFaqs} />);

    // Expand first
    fireEvent.click(screen.getByText('How do I book an experience?'));
    expect(screen.getByText(/You can book directly through our website/)).toBeDefined();

    // Expand second — first should collapse
    fireEvent.click(screen.getByText('What is the cancellation policy?'));
    expect(screen.queryByText(/You can book directly through our website/)).toBeNull();
    expect(screen.getByText(/Cancellation policies vary by experience/)).toBeDefined();
  });

  it('strips HTML tags from body content', () => {
    render(<AboutFaqSection faqs={mockFaqs} />);

    fireEvent.click(screen.getByText('Do you offer group discounts?'));

    // Should show plain text without <p> tags
    expect(screen.getByText(/Yes, many of our experiences offer group pricing/)).toBeDefined();
  });

  it('renders View all FAQs link', () => {
    render(<AboutFaqSection faqs={mockFaqs} />);
    const link = screen.getByText('View all FAQs');
    expect(link.closest('a')?.getAttribute('href')).toBe('/faq');
  });
});
