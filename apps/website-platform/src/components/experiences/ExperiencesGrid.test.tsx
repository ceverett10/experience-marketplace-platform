import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExperiencesGrid } from './ExperiencesGrid';

vi.mock('./PremiumExperienceCard', () => ({
  PremiumExperienceCard: ({ experience, variant, badges }: any) => (
    <div data-testid={`experience-card-${experience.id}`} data-variant={variant}>
      <span>{experience.title}</span>
      {badges?.includes('freeCancellation') && <span>Free Cancellation</span>}
    </div>
  ),
}));

vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0d9488' }),
}));

function makeExperience(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    title: `Experience ${id}`,
    slug: `exp-${id}`,
    shortDescription: `Description ${id}`,
    imageUrl: `/img/${id}.jpg`,
    price: { amount: 35, currency: 'GBP', formatted: '£35.00' },
    duration: { formatted: '2 hours' },
    rating: { average: 4.5, count: 50 },
    location: { name: 'London' },
    cancellationPolicy: { type: 'STANDARD' },
    ...overrides,
  };
}

describe('ExperiencesGrid', () => {
  it('shows "No experiences found" when empty', () => {
    render(<ExperiencesGrid initialExperiences={[]} hasMore={false} searchParams={{}} />);
    expect(screen.getByText('No experiences found')).toBeInTheDocument();
  });

  it('shows "Clear all filters" link when empty', () => {
    render(<ExperiencesGrid initialExperiences={[]} hasMore={false} searchParams={{}} />);
    expect(screen.getByText('Clear all filters')).toBeInTheDocument();
  });

  it('renders first experience as featured', () => {
    const experiences = [makeExperience('1'), makeExperience('2')];
    render(<ExperiencesGrid initialExperiences={experiences} hasMore={false} searchParams={{}} />);
    const featured = screen.getByTestId('experience-card-1');
    expect(featured).toHaveAttribute('data-variant', 'featured');
  });

  it('renders remaining experiences in grid', () => {
    const experiences = [makeExperience('1'), makeExperience('2'), makeExperience('3')];
    render(<ExperiencesGrid initialExperiences={experiences} hasMore={false} searchParams={{}} />);
    const card2 = screen.getByTestId('experience-card-2');
    const card3 = screen.getByTestId('experience-card-3');
    expect(card2).not.toHaveAttribute('data-variant', 'featured');
    expect(card3).not.toHaveAttribute('data-variant', 'featured');
  });

  it('shows "See More Experiences" button when hasMore=true', () => {
    const experiences = [makeExperience('1')];
    render(<ExperiencesGrid initialExperiences={experiences} hasMore={true} searchParams={{}} />);
    expect(screen.getByText('See More Experiences')).toBeInTheDocument();
  });

  it('hides "See More" button when hasMore=false', () => {
    const experiences = [makeExperience('1')];
    render(<ExperiencesGrid initialExperiences={experiences} hasMore={false} searchParams={{}} />);
    expect(screen.queryByText('See More Experiences')).not.toBeInTheDocument();
  });

  it('shows end-of-results message when no more', () => {
    const experiences = [makeExperience('1'), makeExperience('2')];
    render(<ExperiencesGrid initialExperiences={experiences} hasMore={false} searchParams={{}} />);
    expect(screen.getByText("You've seen all 2 experiences")).toBeInTheDocument();
  });

  it('shows free cancellation badge for FREE cancellation policy', () => {
    const experiences = [makeExperience('1', { cancellationPolicy: { type: 'FREE' } })];
    render(<ExperiencesGrid initialExperiences={experiences} hasMore={false} searchParams={{}} />);
    expect(screen.getByText('Free Cancellation')).toBeInTheDocument();
  });
});
