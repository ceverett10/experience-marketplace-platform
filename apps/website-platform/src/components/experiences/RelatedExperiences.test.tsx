import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, createMockExperience } from '@/test/test-utils';
import { RelatedExperiences } from './RelatedExperiences';

// Mock ExperienceCard to avoid testing its internals
vi.mock('./ExperienceCard', () => ({
  ExperienceCard: ({ experience }: { experience: { id: string; title: string } }) => (
    <div data-testid={`experience-card-${experience.id}`}>{experience.title}</div>
  ),
}));

describe('RelatedExperiences', () => {
  const mockExperiences = [
    createMockExperience({ id: 'exp-1', title: 'Walking Tour' }),
    createMockExperience({ id: 'exp-2', title: 'Food Tasting' }),
    createMockExperience({ id: 'exp-3', title: 'Museum Visit' }),
  ];

  describe('rendering', () => {
    it('renders nothing when experiences array is empty', () => {
      const { container } = renderWithProviders(<RelatedExperiences experiences={[]} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders section when experiences are provided', () => {
      renderWithProviders(<RelatedExperiences experiences={mockExperiences} />);
      expect(screen.getByText('Walking Tour')).toBeInTheDocument();
      expect(screen.getByText('Food Tasting')).toBeInTheDocument();
      expect(screen.getByText('Museum Visit')).toBeInTheDocument();
    });

    it('renders default title "You might also like"', () => {
      renderWithProviders(<RelatedExperiences experiences={mockExperiences} />);
      expect(
        screen.getByRole('heading', { level: 2, name: 'You might also like' })
      ).toBeInTheDocument();
    });

    it('renders custom title when provided', () => {
      renderWithProviders(
        <RelatedExperiences experiences={mockExperiences} title="Similar Experiences" />
      );
      expect(
        screen.getByRole('heading', { level: 2, name: 'Similar Experiences' })
      ).toBeInTheDocument();
    });
  });

  describe('experience cards', () => {
    it('renders an ExperienceCard for each experience', () => {
      renderWithProviders(<RelatedExperiences experiences={mockExperiences} />);
      expect(screen.getByTestId('experience-card-exp-1')).toBeInTheDocument();
      expect(screen.getByTestId('experience-card-exp-2')).toBeInTheDocument();
      expect(screen.getByTestId('experience-card-exp-3')).toBeInTheDocument();
    });

    it('limits display to 4 experiences', () => {
      const fiveExperiences = [
        createMockExperience({ id: 'exp-1', title: 'Tour 1' }),
        createMockExperience({ id: 'exp-2', title: 'Tour 2' }),
        createMockExperience({ id: 'exp-3', title: 'Tour 3' }),
        createMockExperience({ id: 'exp-4', title: 'Tour 4' }),
        createMockExperience({ id: 'exp-5', title: 'Tour 5' }),
      ];
      renderWithProviders(<RelatedExperiences experiences={fiveExperiences} />);
      expect(screen.getByTestId('experience-card-exp-1')).toBeInTheDocument();
      expect(screen.getByTestId('experience-card-exp-4')).toBeInTheDocument();
      expect(screen.queryByTestId('experience-card-exp-5')).not.toBeInTheDocument();
    });

    it('renders fewer than 4 cards when fewer experiences are provided', () => {
      const twoExperiences = [
        createMockExperience({ id: 'exp-1', title: 'Tour 1' }),
        createMockExperience({ id: 'exp-2', title: 'Tour 2' }),
      ];
      renderWithProviders(<RelatedExperiences experiences={twoExperiences} />);
      expect(screen.getByTestId('experience-card-exp-1')).toBeInTheDocument();
      expect(screen.getByTestId('experience-card-exp-2')).toBeInTheDocument();
    });
  });

  describe('single experience', () => {
    it('renders section with a single experience', () => {
      const singleExperience = [createMockExperience({ id: 'exp-1', title: 'Solo Tour' })];
      renderWithProviders(<RelatedExperiences experiences={singleExperience} />);
      expect(screen.getByText('Solo Tour')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });
  });
});
