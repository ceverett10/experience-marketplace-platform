import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewsCarousel } from './ReviewsCarousel';

function makeReview(id: string, overrides: Record<string, unknown> = {}) {
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

  it('renders the "Why travelers loved this" heading', () => {
    render(<ReviewsCarousel reviews={[makeReview('1')]} />);
    expect(screen.getByText('Why travelers loved this')).toBeInTheDocument();
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

  it('renders short-form date (e.g. "Jan 2026")', () => {
    render(<ReviewsCarousel reviews={[makeReview('1', { publishedDate: '2026-01-15' })]} />);
    expect(screen.getByText(/Jan 2026/)).toBeInTheDocument();
  });

  it('renders aggregate rating link with count when rating is provided', () => {
    render(<ReviewsCarousel reviews={[makeReview('1')]} rating={{ average: 4.5, count: 250 }} />);
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('250 Reviews')).toBeInTheDocument();
  });

  it('does not show aggregate rating link when rating is null', () => {
    render(<ReviewsCarousel reviews={[makeReview('1')]} rating={null} />);
    expect(screen.queryByText(/Reviews$/)).not.toBeInTheDocument();
  });

  it('does not show aggregate rating link when rating is omitted', () => {
    render(<ReviewsCarousel reviews={[makeReview('1')]} />);
    expect(screen.queryByText(/Reviews$/)).not.toBeInTheDocument();
  });

  it('formats large review counts with locale string', () => {
    render(<ReviewsCarousel reviews={[makeReview('1')]} rating={{ average: 4.2, count: 1500 }} />);
    expect(screen.getByText('1,500 Reviews')).toBeInTheDocument();
  });

  it('limits visible reviews to 6', () => {
    const reviews = Array.from({ length: 8 }, (_, i) => makeReview(String(i + 1)));
    render(<ReviewsCarousel reviews={reviews} />);
    expect(screen.getByText('Author 1')).toBeInTheDocument();
    expect(screen.getByText('Author 6')).toBeInTheDocument();
    expect(screen.queryByText('Author 7')).not.toBeInTheDocument();
    expect(screen.queryByText('Author 8')).not.toBeInTheDocument();
  });

  it('renders 5 star SVGs per review (filled + unfilled combined)', () => {
    render(<ReviewsCarousel reviews={[makeReview('1', { rating: 3 })]} />);
    const starGroup = screen.getByLabelText('3 stars');
    expect(starGroup.querySelectorAll('svg').length).toBe(5);
  });

  it('shows "Read more" only when content is long enough to be clipped', () => {
    const shortReview = makeReview('1', { content: 'Loved it!' });
    const longReview = makeReview('2', {
      content:
        'This was an unforgettable experience from start to finish. The guide was excellent, the views were absolutely stunning, and we genuinely enjoyed every single minute of the day. We would wholeheartedly recommend this trip to anyone visiting the area for the first time, families especially.',
    });
    render(<ReviewsCarousel reviews={[shortReview, longReview]} />);
    // One "Read more" for the long review only
    expect(screen.getAllByText('Read more')).toHaveLength(1);
  });

  it('toggles to "Read less" when "Read more" is clicked', () => {
    const longReview = makeReview('1', {
      content:
        'This was an unforgettable experience from start to finish. The guide was excellent, the views were absolutely stunning, and we genuinely enjoyed every single minute of the day. We would wholeheartedly recommend this trip to anyone visiting the area for the first time, families especially.',
    });
    render(<ReviewsCarousel reviews={[longReview]} />);
    fireEvent.click(screen.getByText('Read more'));
    expect(screen.getByText('Read less')).toBeInTheDocument();
  });

  describe('navigation', () => {
    it('does not show prev button initially', () => {
      const reviews = [makeReview('1'), makeReview('2'), makeReview('3'), makeReview('4')];
      render(<ReviewsCarousel reviews={reviews} />);
      expect(screen.queryByLabelText('Previous review')).not.toBeInTheDocument();
    });

    it('shows next button when there are more than 2 reviews', () => {
      const reviews = [makeReview('1'), makeReview('2'), makeReview('3'), makeReview('4')];
      render(<ReviewsCarousel reviews={reviews} />);
      expect(screen.getByLabelText('Next review')).toBeInTheDocument();
    });

    it('does not show next button when there are 2 or fewer reviews', () => {
      // length-2 = 0, currentIndex(0) < 0 is false
      render(<ReviewsCarousel reviews={[makeReview('1'), makeReview('2')]} />);
      expect(screen.queryByLabelText('Next review')).not.toBeInTheDocument();
    });

    it('scrolls right when next button is clicked', () => {
      const reviews = [makeReview('1'), makeReview('2'), makeReview('3'), makeReview('4')];
      const { container } = render(<ReviewsCarousel reviews={reviews} />);

      const slider = container.querySelector('[style*="translateX"]');
      expect(slider).toHaveStyle({ transform: 'translateX(-0px)' });

      fireEvent.click(screen.getByLabelText('Next review'));
      // 480px card + 16px gap
      expect(slider).toHaveStyle({ transform: 'translateX(-496px)' });
    });

    it('shows prev button after scrolling right', () => {
      const reviews = [makeReview('1'), makeReview('2'), makeReview('3'), makeReview('4')];
      render(<ReviewsCarousel reviews={reviews} />);
      fireEvent.click(screen.getByLabelText('Next review'));
      expect(screen.getByLabelText('Previous review')).toBeInTheDocument();
    });
  });
});
