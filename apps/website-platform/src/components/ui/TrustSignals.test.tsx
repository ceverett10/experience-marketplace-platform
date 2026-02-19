import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  TrustSignals,
  TrustBadges,
  ReviewHighlights,
  LiveActivityIndicator,
  PopularityBadge,
} from './TrustSignals';

// Mock site-context
vi.mock('@/lib/site-context', () => ({
  useBrand: vi.fn(() => ({
    primaryColor: '#0d9488',
    name: 'Test Brand',
  })),
  useSite: vi.fn(() => ({
    id: 'site-1',
    name: 'Test Site',
  })),
}));

describe('TrustSignals', () => {
  it('renders all trust stats', () => {
    render(<TrustSignals />);

    expect(screen.getByText('Thousands')).toBeDefined();
    expect(screen.getByText('of Happy Travelers')).toBeDefined();
    expect(screen.getByText('Hundreds')).toBeDefined();
    expect(screen.getByText('of Unique Experiences')).toBeDefined();
    expect(screen.getByText('4.8/5')).toBeDefined();
    expect(screen.getByText('Average Rating')).toBeDefined();
    expect(screen.getByText('Dedicated')).toBeDefined();
    expect(screen.getByText('Customer Support')).toBeDefined();
  });

  it('accepts custom className', () => {
    const { container } = render(<TrustSignals className="my-class" />);
    expect(container.querySelector('.my-class')).toBeDefined();
  });
});

describe('TrustBadges', () => {
  it('renders all badge types', () => {
    render(<TrustBadges />);

    expect(screen.getByText('Secure Payment')).toBeDefined();
    expect(screen.getByText('Flexible Cancellation')).toBeDefined();
    expect(screen.getByText('Instant Confirmation')).toBeDefined();
  });
});

describe('ReviewHighlights', () => {
  const reviews = [
    {
      id: 'r1',
      author: 'John Doe',
      rating: 5,
      text: 'Amazing experience!',
      date: '2 days ago',
    },
    {
      id: 'r2',
      author: 'Jane Smith',
      rating: 4,
      text: 'Very good tour.',
      date: '1 week ago',
      avatar: 'https://example.com/avatar.jpg',
    },
  ];

  it('renders all reviews', () => {
    render(<ReviewHighlights reviews={reviews} />);

    expect(screen.getByText('John Doe')).toBeDefined();
    expect(screen.getByText('Amazing experience!')).toBeDefined();
    expect(screen.getByText('Jane Smith')).toBeDefined();
    expect(screen.getByText('Very good tour.')).toBeDefined();
  });

  it('shows initial letter when no avatar', () => {
    render(<ReviewHighlights reviews={[reviews[0]]} />);

    expect(screen.getByText('J')).toBeDefined();
  });

  it('shows avatar image when provided', () => {
    render(<ReviewHighlights reviews={[reviews[1]]} />);

    const img = screen.getByAltText('Jane Smith');
    expect(img).toBeDefined();
  });

  it('renders dates', () => {
    render(<ReviewHighlights reviews={reviews} />);

    expect(screen.getByText('2 days ago')).toBeDefined();
    expect(screen.getByText('1 week ago')).toBeDefined();
  });
});

describe('LiveActivityIndicator', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<LiveActivityIndicator count={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when count is negative', () => {
    const { container } = render(<LiveActivityIndicator count={-1} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders singular text for 1 person', () => {
    render(<LiveActivityIndicator count={1} />);
    expect(screen.getByText(/person is/)).toBeDefined();
  });

  it('renders plural text for multiple people', () => {
    render(<LiveActivityIndicator count={5} />);
    expect(screen.getByText(/people are/)).toBeDefined();
  });

  it('shows the count', () => {
    render(<LiveActivityIndicator count={12} />);
    expect(screen.getByText('12')).toBeDefined();
  });
});

describe('PopularityBadge', () => {
  it('renders nothing when bookings < 5', () => {
    const { container } = render(<PopularityBadge bookingsLast24h={4} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when bookings is 0', () => {
    const { container } = render(<PopularityBadge bookingsLast24h={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when bookings >= 5', () => {
    render(<PopularityBadge bookingsLast24h={10} />);
    expect(screen.getByText(/Booked 10 times/)).toBeDefined();
  });

  it('shows exact count in text', () => {
    render(<PopularityBadge bookingsLast24h={25} />);
    expect(screen.getByText(/25 times in the last 24 hours/)).toBeDefined();
  });
});
