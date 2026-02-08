import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, createMockExperience, createMockSiteConfig } from '@/test/test-utils';
import { ExperienceCard } from './ExperienceCard';

describe('ExperienceCard', () => {
  const mockExperience = createMockExperience();

  describe('default variant', () => {
    it('should render experience title', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} />);
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test Experience');
    });

    it('should render experience image', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');
      expect(img).toHaveAttribute('alt', 'Test Experience');
    });

    it('should render placeholder image when no imageUrl', () => {
      const experience = createMockExperience({ imageUrl: '' });
      renderWithProviders(<ExperienceCard experience={experience} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/placeholder-experience.jpg');
    });

    it('should render price', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} />);
      expect(screen.getByText(/From £25.00/)).toBeInTheDocument();
    });

    it('should render duration', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} />);
      expect(screen.getByText('2 hours')).toBeInTheDocument();
    });

    it('should render location', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} />);
      expect(screen.getByText('London, UK')).toBeInTheDocument();
    });

    it('should render rating when provided', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} />);
      // Rating appears in both the image badge and the text section
      const ratings = screen.getAllByText('4.5');
      expect(ratings.length).toBeGreaterThanOrEqual(1);
    });

    it('should not render rating when null', () => {
      const experience = createMockExperience({ rating: null });
      renderWithProviders(<ExperienceCard experience={experience} />);
      expect(screen.queryByText('4.5')).not.toBeInTheDocument();
    });

    it('should not render review count text when count is 0', () => {
      const experience = createMockExperience({ rating: { average: 3.0, count: 0 } });
      renderWithProviders(<ExperienceCard experience={experience} />);
      // Rating value appears in badge overlay and text section
      const ratings = screen.getAllByText('3.0');
      expect(ratings.length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('reviews')).not.toBeInTheDocument();
    });

    it('should render wishlist button', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} />);
      expect(screen.getByLabelText('Add to wishlist')).toBeInTheDocument();
    });

    it('should format large review counts with locale string', () => {
      const experience = createMockExperience({ rating: { average: 4.2, count: 1500 } });
      renderWithProviders(<ExperienceCard experience={experience} />);
      expect(screen.getByText('(1,500 reviews)')).toBeInTheDocument();
    });

    it('should render short description', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} />);
      expect(screen.getByText('A great test experience')).toBeInTheDocument();
    });

    it('should link to experience detail page', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/experiences/test-experience');
    });

    it('should apply brand color to price', () => {
      const siteConfig = createMockSiteConfig({
        brand: {
          primaryColor: '#ff0000',
          name: 'Test Brand',
          tagline: null,
          secondaryColor: '#8b5cf6',
          accentColor: '#f59e0b',
          headingFont: 'Inter',
          bodyFont: 'Inter',
          logoUrl: null,
        logoDarkUrl: null,
          faviconUrl: null,
          ogImageUrl: null,
          socialLinks: null,
        },
      });

      renderWithProviders(<ExperienceCard experience={mockExperience} />, { siteConfig });
      const price = screen.getByText(/From £25.00/);
      expect(price).toHaveStyle({ color: '#ff0000' });
    });
  });

  describe('compact variant', () => {
    it('should render in compact layout', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} variant="compact" />);
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test Experience');
    });

    it('should render price with From prefix', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} variant="compact" />);
      expect(screen.getByText(/From £25.00/)).toBeInTheDocument();
    });

    it('should render duration', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} variant="compact" />);
      expect(screen.getByText('2 hours')).toBeInTheDocument();
    });

    it('should link to experience detail page', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} variant="compact" />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/experiences/test-experience');
    });
  });

  describe('featured variant', () => {
    it('should render in featured layout', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} variant="featured" />);
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test Experience');
    });

    it('should render rating with count', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} variant="featured" />);
      expect(screen.getByText('4.5')).toBeInTheDocument();
      expect(screen.getByText('(100)')).toBeInTheDocument();
    });

    it('should render price', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} variant="featured" />);
      expect(screen.getByText(/From £25.00/)).toBeInTheDocument();
    });

    it('should render duration', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} variant="featured" />);
      expect(screen.getByText('2 hours')).toBeInTheDocument();
    });

    it('should not render rating section when null', () => {
      const experience = createMockExperience({ rating: null });
      renderWithProviders(<ExperienceCard experience={experience} variant="featured" />);
      expect(screen.queryByText('(100)')).not.toBeInTheDocument();
    });

    it('should link to experience detail page', () => {
      renderWithProviders(<ExperienceCard experience={mockExperience} variant="featured" />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/experiences/test-experience');
    });
  });
});
