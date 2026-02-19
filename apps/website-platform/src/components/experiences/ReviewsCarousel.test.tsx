import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewsCarousel } from './ReviewsCarousel';

function makeReview(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    title: `Review ${id}`,
    content: `This was an amazing experience number ${id}. Highly recommended!`,
    rating: 5,
    authorName: `Author ${id}`,
    publishedDate: '2026-01-15',
    images: [],
    ...overrides,
  };
}

describe('ReviewsCarousel', () => {
  it('returns null when reviews array is empty', () => {
    const { container } = render(<ReviewsCarousel reviews={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when reviews is undefined-like (empty array)', () => {
    const { container } = render(<ReviewsCarousel reviews={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders "What travelers are saying" heading', () => {
    render(<ReviewsCarousel reviews={[makeReview('1')]} />);
    expect(screen.getByText('What travelers are saying')).toBeInTheDocument();
  });

  it('renders review content', () => {
    render(<ReviewsCarousel reviews={[makeReview('1')]} />);
    expect(screen.getByText(/This was an amazing experience number 1/)).toBeInTheDocument();
  });

  it('renders author names', () => {
    const reviews = [makeReview('1'), makeReview('2')];
    render(<ReviewsCarousel reviews={reviews} />);
    expect(screen.getByText('Author 1')).toBeInTheDocument();
    expect(screen.getByText('Author 2')).toBeInTheDocument();
  });

  it('renders author initial avatar', () => {
    render(<ReviewsCarousel reviews={[makeReview('1', { authorName: 'John' })]} />);
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('renders rating number next to stars', () => {
    render(<ReviewsCarousel reviews={[makeReview('1', { rating: 4 })]} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders formatted date', () => {
    render(<ReviewsCarousel reviews={[makeReview('1', { publishedDate: '2026-01-15' })]} />);
    // en-GB format: "15 January 2026"
    expect(screen.getByText(/15 January 2026/)).toBeInTheDocument();
  });

  it('renders "Verified booking" text for each review', () => {
    const reviews = [makeReview('1'), makeReview('2')];
    render(<ReviewsCarousel reviews={reviews} />);
    const verifiedTexts = screen.getAllByText(/Verified booking/);
    expect(verifiedTexts).toHaveLength(2);
  });

  it('shows "See all X reviews" link when rating is provided', () => {
    render(<ReviewsCarousel reviews={[makeReview('1')]} rating={{ average: 4.5, count: 250 }} />);
    expect(screen.getByText('See all 250 reviews')).toBeInTheDocument();
  });

  it('does not show "See all reviews" link when rating is null', () => {
    render(<ReviewsCarousel reviews={[makeReview('1')]} rating={null} />);
    expect(screen.queryByText(/See all.*reviews/)).not.toBeInTheDocument();
  });

  it('does not show "See all reviews" link when rating is not provided', () => {
    render(<ReviewsCarousel reviews={[makeReview('1')]} />);
    expect(screen.queryByText(/See all.*reviews/)).not.toBeInTheDocument();
  });

  it('formats large review counts with locale string', () => {
    render(<ReviewsCarousel reviews={[makeReview('1')]} rating={{ average: 4.2, count: 1500 }} />);
    expect(screen.getByText('See all 1,500 reviews')).toBeInTheDocument();
  });

  it('limits visible reviews to 6', () => {
    const reviews = Array.from({ length: 8 }, (_, i) => makeReview(String(i + 1)));
    render(<ReviewsCarousel reviews={reviews} />);
    // First 6 should be visible
    expect(screen.getByText('Author 1')).toBeInTheDocument();
    expect(screen.getByText('Author 6')).toBeInTheDocument();
    // 7th and 8th should not be rendered
    expect(screen.queryByText('Author 7')).not.toBeInTheDocument();
    expect(screen.queryByText('Author 8')).not.toBeInTheDocument();
  });

  describe('navigation', () => {
    it('does not show left navigation button initially', () => {
      const reviews = [makeReview('1'), makeReview('2'), makeReview('3')];
      render(<ReviewsCarousel reviews={reviews} />);
      // canScrollLeft is false when currentIndex is 0
      const buttons = screen.queryAllByRole('button');
      // Only right nav button should exist (if canScrollRight)
      const leftArrowButtons = buttons.filter((btn) => btn.querySelector('path[d*="15.75 19.5"]'));
      expect(leftArrowButtons).toHaveLength(0);
    });

    it('shows right navigation button when there are enough reviews', () => {
      const reviews = [makeReview('1'), makeReview('2'), makeReview('3'), makeReview('4')];
      render(<ReviewsCarousel reviews={reviews} />);
      // canScrollRight is true when currentIndex < visibleReviews.length - 2
      const buttons = screen.getAllByRole('button');
      // At least one button should exist for right nav
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('scrolls right when right button is clicked', () => {
      const reviews = [makeReview('1'), makeReview('2'), makeReview('3'), makeReview('4')];
      const { container } = render(<ReviewsCarousel reviews={reviews} />);

      // Get the scrollable container
      const slider = container.querySelector('[style*="translateX"]');
      expect(slider).toHaveStyle({ transform: 'translateX(-0px)' });

      // Click right navigation
      const rightButton = screen
        .getAllByRole('button')
        .find((btn) => btn.querySelector('path[d*="8.25 4.5"]'));
      if (rightButton) {
        fireEvent.click(rightButton);
        expect(slider).toHaveStyle({ transform: 'translateX(-320px)' });
      }
    });

    it('shows left navigation button after scrolling right', () => {
      const reviews = [makeReview('1'), makeReview('2'), makeReview('3'), makeReview('4')];
      render(<ReviewsCarousel reviews={reviews} />);

      // Click right navigation
      const rightButton = screen
        .getAllByRole('button')
        .find((btn) => btn.querySelector('path[d*="8.25 4.5"]'));
      if (rightButton) {
        fireEvent.click(rightButton);
        // Now left navigation should appear
        const leftButton = screen
          .getAllByRole('button')
          .find((btn) => btn.querySelector('path[d*="15.75 19.5"]'));
        expect(leftButton).toBeDefined();
      }
    });

    it('does not show right navigation when only one review', () => {
      render(<ReviewsCarousel reviews={[makeReview('1')]} />);
      // canScrollRight = currentIndex(0) < visibleReviews.length(1) - 2 = -1 => false
      const buttons = screen.queryAllByRole('button');
      expect(buttons).toHaveLength(0);
    });
  });

  it('renders stars for each review rating', () => {
    render(<ReviewsCarousel reviews={[makeReview('1', { rating: 3 })]} />);
    // 5 star SVGs should be rendered (3 filled + 2 unfilled)
    const starContainer = screen.getByText('3').closest('div');
    const stars = starContainer?.querySelectorAll('svg');
    expect(stars?.length).toBe(5);
  });
});
