import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewsCarousel } from './ReviewsCarousel';

// ── helpers ─────────────────────────────────────────────────────────────────

interface Review {
  id: string;
  title: string;
  content: string;
  rating: number;
  authorName: string;
  publishedDate: string;
  images: string[];
}

function createReview(overrides: Partial<Review> = {}): Review {
  return {
    id: 'review-1',
    title: 'Great experience',
    content: 'We had an amazing time on this tour. The guide was knowledgeable and friendly.',
    rating: 5,
    authorName: 'John Smith',
    publishedDate: '2026-01-15',
    images: [],
    ...overrides,
  };
}

function createReviews(count: number): Review[] {
  return Array.from({ length: count }, (_, i) =>
    createReview({
      id: `review-${i + 1}`,
      authorName: `Author ${i + 1}`,
      content: `Review content for review ${i + 1}`,
      rating: Math.min(5, i + 1),
    })
  );
}

describe('ReviewsCarousel', () => {
  // ── Empty / null states ─────────────────────────────────────────────────

  describe('empty state', () => {
    it('renders nothing when reviews array is empty', () => {
      const { container } = render(<ReviewsCarousel reviews={[]} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when reviews is undefined', () => {
      const { container } = render(<ReviewsCarousel reviews={undefined as any} />);
      expect(container.innerHTML).toBe('');
    });
  });

  // ── Section heading ─────────────────────────────────────────────────────

  describe('section heading', () => {
    it('renders the heading text', () => {
      render(<ReviewsCarousel reviews={[createReview()]} />);
      expect(
        screen.getByRole('heading', { name: /What travelers are saying/i })
      ).toBeInTheDocument();
    });
  });

  // ── Rating summary ──────────────────────────────────────────────────────

  describe('rating summary', () => {
    it('shows review count link when rating is provided', () => {
      render(<ReviewsCarousel reviews={[createReview()]} rating={{ average: 4.5, count: 120 }} />);
      expect(screen.getByText(/See all 120 reviews/i)).toBeInTheDocument();
    });

    it('formats large review counts with locale separators', () => {
      render(<ReviewsCarousel reviews={[createReview()]} rating={{ average: 4.8, count: 1500 }} />);
      // toLocaleString produces "1,500"
      expect(screen.getByText(/1,500/)).toBeInTheDocument();
    });

    it('links to #reviews anchor', () => {
      render(<ReviewsCarousel reviews={[createReview()]} rating={{ average: 4.5, count: 50 }} />);
      const link = screen.getByRole('link', { name: /See all/i });
      expect(link).toHaveAttribute('href', '#reviews');
    });

    it('does not show review count link when rating is null', () => {
      render(<ReviewsCarousel reviews={[createReview()]} rating={null} />);
      expect(screen.queryByText(/See all/i)).not.toBeInTheDocument();
    });

    it('does not show review count link when rating is not provided', () => {
      render(<ReviewsCarousel reviews={[createReview()]} />);
      expect(screen.queryByText(/See all/i)).not.toBeInTheDocument();
    });
  });

  // ── Review card rendering ───────────────────────────────────────────────

  describe('review card', () => {
    it('displays the author name', () => {
      render(<ReviewsCarousel reviews={[createReview({ authorName: 'Jane Doe' })]} />);
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('displays the author initial avatar', () => {
      render(<ReviewsCarousel reviews={[createReview({ authorName: 'maria' })]} />);
      // charAt(0).toUpperCase() => 'M'
      expect(screen.getByText('M')).toBeInTheDocument();
    });

    it('displays the review content', () => {
      render(
        <ReviewsCarousel
          reviews={[createReview({ content: 'Absolutely wonderful experience!' })]}
        />
      );
      expect(screen.getByText('Absolutely wonderful experience!')).toBeInTheDocument();
    });

    it('displays the numeric rating', () => {
      render(<ReviewsCarousel reviews={[createReview({ rating: 4 })]} />);
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('displays the formatted date', () => {
      render(<ReviewsCarousel reviews={[createReview({ publishedDate: '2026-02-10' })]} />);
      // en-GB long format: "10 February 2026"
      expect(screen.getByText('10 February 2026')).toBeInTheDocument();
    });

    it('displays "Invalid Date" when date string is unparseable', () => {
      render(<ReviewsCarousel reviews={[createReview({ publishedDate: 'not-a-date' })]} />);
      // new Date('not-a-date').toLocaleDateString() returns 'Invalid Date' in jsdom
      expect(screen.getByText('Invalid Date')).toBeInTheDocument();
    });

    it('shows "Verified booking" badge', () => {
      render(<ReviewsCarousel reviews={[createReview()]} />);
      expect(screen.getByText(/Verified booking/i)).toBeInTheDocument();
    });
  });

  // ── Limits to 6 reviews ─────────────────────────────────────────────────

  describe('review limit', () => {
    it('shows at most 6 review cards', () => {
      const reviews = createReviews(8);
      render(<ReviewsCarousel reviews={reviews} />);

      // Only Author 1 through Author 6 should be visible
      expect(screen.getByText('Author 1')).toBeInTheDocument();
      expect(screen.getByText('Author 6')).toBeInTheDocument();
      expect(screen.queryByText('Author 7')).not.toBeInTheDocument();
      expect(screen.queryByText('Author 8')).not.toBeInTheDocument();
    });
  });

  // ── Carousel navigation ─────────────────────────────────────────────────

  describe('carousel navigation', () => {
    it('does not show left scroll button initially', () => {
      const reviews = createReviews(4);
      render(<ReviewsCarousel reviews={reviews} />);

      // There should be only 1 button (right scroll)
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
    });

    it('shows right scroll button when there are more than 2 reviews', () => {
      const reviews = createReviews(4);
      render(<ReviewsCarousel reviews={reviews} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
    });

    it('does not show any scroll buttons when there are 2 or fewer reviews', () => {
      const reviews = createReviews(2);
      render(<ReviewsCarousel reviews={reviews} />);

      const buttons = screen.queryAllByRole('button');
      expect(buttons).toHaveLength(0);
    });

    it('shows left scroll button after scrolling right', () => {
      const reviews = createReviews(5);
      render(<ReviewsCarousel reviews={reviews} />);

      // Click right arrow
      const rightButton = screen.getByRole('button');
      fireEvent.click(rightButton);

      // Now both buttons should appear
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });

    it('hides right scroll button when scrolled to the end', () => {
      const reviews = createReviews(4);
      render(<ReviewsCarousel reviews={reviews} />);

      // Click right repeatedly to reach the end
      // visibleReviews.length - 2 = 4 - 2 = 2 max index
      let button = screen.getByRole('button');
      fireEvent.click(button); // currentIndex = 1
      button = screen
        .getAllByRole('button')
        .find((b) => b.querySelector('path[d="M8.25 4.5l7.5 7.5-7.5 7.5"]'))!;
      fireEvent.click(button); // currentIndex = 2

      // At max scroll (index 2), right button should be gone
      // Only left button should remain
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
    });

    it('scrolling left decrements the current index', () => {
      const reviews = createReviews(5);
      const { container } = render(<ReviewsCarousel reviews={reviews} />);

      // Scroll right first
      const rightButton = screen.getByRole('button');
      fireEvent.click(rightButton); // index = 1

      // Now click left
      const leftButton = screen.getAllByRole('button')[0];
      fireEvent.click(leftButton); // index = 0

      // The transform should be back to 0
      const carousel = container.querySelector('[style*="translateX"]');
      expect(carousel).toHaveStyle({ transform: 'translateX(-0px)' });
    });
  });

  // ── Multiple reviews rendering ──────────────────────────────────────────

  describe('multiple reviews', () => {
    it('renders all reviews up to the 6-item limit', () => {
      const reviews = createReviews(5);
      render(<ReviewsCarousel reviews={reviews} />);

      for (let i = 1; i <= 5; i++) {
        expect(screen.getByText(`Author ${i}`)).toBeInTheDocument();
      }
    });
  });
});
