import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./ExperienceCard', () => ({
  ExperienceCard: ({ experience }: any) => (
    <div data-testid={`experience-card-${experience.id}`}>
      <span>{experience.title}</span>
    </div>
  ),
}));

import { RelatedExperiences } from './RelatedExperiences';

function makeExperience(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    title: `Experience ${id}`,
    slug: `exp-${id}`,
    shortDescription: `Description for ${id}`,
    imageUrl: `/img/${id}.jpg`,
    price: { amount: 30, currency: 'GBP', formatted: '£30.00' },
    duration: { formatted: '3 hours' },
    rating: { average: 4.2, count: 50 },
    location: { name: 'London' },
    ...overrides,
  };
}

describe('RelatedExperiences', () => {
  it('returns null when experiences array is empty', () => {
    const { container } = render(<RelatedExperiences experiences={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders default title "You might also like"', () => {
    render(<RelatedExperiences experiences={[makeExperience('1')]} />);
    expect(screen.getByText('You might also like')).toBeInTheDocument();
  });

  it('renders custom title when provided', () => {
    render(<RelatedExperiences experiences={[makeExperience('1')]} title="Similar experiences" />);
    expect(screen.getByText('Similar experiences')).toBeInTheDocument();
    expect(screen.queryByText('You might also like')).not.toBeInTheDocument();
  });

  it('renders experience cards for each experience', () => {
    const experiences = [makeExperience('1'), makeExperience('2'), makeExperience('3')];
    render(<RelatedExperiences experiences={experiences} />);
    expect(screen.getByTestId('experience-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('experience-card-2')).toBeInTheDocument();
    expect(screen.getByTestId('experience-card-3')).toBeInTheDocument();
  });

  it('renders experience titles via ExperienceCard', () => {
    const experiences = [makeExperience('1'), makeExperience('2')];
    render(<RelatedExperiences experiences={experiences} />);
    expect(screen.getByText('Experience 1')).toBeInTheDocument();
    expect(screen.getByText('Experience 2')).toBeInTheDocument();
  });

  it('limits displayed experiences to 4', () => {
    const experiences = [
      makeExperience('1'),
      makeExperience('2'),
      makeExperience('3'),
      makeExperience('4'),
      makeExperience('5'),
    ];
    render(<RelatedExperiences experiences={experiences} />);
    expect(screen.getByTestId('experience-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('experience-card-2')).toBeInTheDocument();
    expect(screen.getByTestId('experience-card-3')).toBeInTheDocument();
    expect(screen.getByTestId('experience-card-4')).toBeInTheDocument();
    expect(screen.queryByTestId('experience-card-5')).not.toBeInTheDocument();
  });

  it('renders section with heading level 2', () => {
    render(<RelatedExperiences experiences={[makeExperience('1')]} />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('You might also like');
  });

  it('renders with a single experience', () => {
    render(<RelatedExperiences experiences={[makeExperience('1')]} />);
    expect(screen.getByTestId('experience-card-1')).toBeInTheDocument();
    expect(screen.getByText('Experience 1')).toBeInTheDocument();
  });
});
