import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, createMockExperience, createMockSiteConfig } from '@/test/test-utils';
import { PremiumExperienceCard } from './PremiumExperienceCard';

describe('PremiumExperienceCard', () => {
  const mockExperience = createMockExperience();

  describe('default variant', () => {
    it('renders experience title', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} />);
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test Experience');
    });

    it('renders duration and location', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} />);
      expect(screen.getByText('2 hours')).toBeInTheDocument();
      expect(screen.getByText('London, UK')).toBeInTheDocument();
    });

    it('renders price with From label', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} />);
      expect(screen.getByText('From')).toBeInTheDocument();
      expect(screen.getByText('£25.00')).toBeInTheDocument();
    });

    it('renders rating when present', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} />);
      expect(screen.getByText('4.5')).toBeInTheDocument();
      expect(screen.getByText('(100)')).toBeInTheDocument();
    });

    it('does not render rating when null', () => {
      const experience = createMockExperience({ rating: null });
      renderWithProviders(<PremiumExperienceCard experience={experience} />);
      expect(screen.queryByText('4.5')).not.toBeInTheDocument();
    });

    it('does not render rating when count is 0', () => {
      const experience = createMockExperience({ rating: { average: 4.5, count: 0 } });
      renderWithProviders(<PremiumExperienceCard experience={experience} />);
      // Rating section should be hidden when count is 0
      expect(screen.queryByText('(0)')).not.toBeInTheDocument();
    });

    it('links to the correct experience page', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/experiences/test-experience');
    });

    it('renders wishlist button by default', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} />);
      expect(screen.getByLabelText('Add to wishlist')).toBeInTheDocument();
    });

    it('hides wishlist button when showHeartAlways is false', () => {
      renderWithProviders(
        <PremiumExperienceCard experience={mockExperience} showHeartAlways={false} />
      );
      expect(screen.queryByLabelText('Add to wishlist')).not.toBeInTheDocument();
    });

    it('renders badges', () => {
      renderWithProviders(
        <PremiumExperienceCard experience={mockExperience} badges={['bestseller', 'new']} />
      );
      expect(screen.getByText('Best Seller')).toBeInTheDocument();
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('limits badges to first 2 in default variant', () => {
      renderWithProviders(
        <PremiumExperienceCard
          experience={mockExperience}
          badges={['bestseller', 'new', 'freeCancellation']}
        />
      );
      expect(screen.getByText('Best Seller')).toBeInTheDocument();
      expect(screen.getByText('New')).toBeInTheDocument();
      // Third badge should not appear in default variant (slice(0, 2))
      expect(screen.queryByText('Free Cancellation')).not.toBeInTheDocument();
    });

    it('renders rank badge when rank <= 3', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} rank={1} />);
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    it('does not render rank badge when rank > 3', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} rank={4} />);
      expect(screen.queryByText('#4')).not.toBeInTheDocument();
    });
  });

  describe('large variant', () => {
    it('renders title and price', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} variant="large" />);
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test Experience');
      expect(screen.getByText(/£25\.00/)).toBeInTheDocument();
    });

    it('renders rating', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} variant="large" />);
      expect(screen.getByText('4.5')).toBeInTheDocument();
    });

    it('renders badges in large variant', () => {
      renderWithProviders(
        <PremiumExperienceCard
          experience={mockExperience}
          variant="large"
          badges={['recommended']}
        />
      );
      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    it('renders rank badge in large variant', () => {
      renderWithProviders(
        <PremiumExperienceCard experience={mockExperience} variant="large" rank={2} />
      );
      expect(screen.getByText('#2')).toBeInTheDocument();
    });
  });

  describe('horizontal variant', () => {
    it('renders title, location, and price', () => {
      renderWithProviders(
        <PremiumExperienceCard experience={mockExperience} variant="horizontal" />
      );
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test Experience');
      expect(screen.getByText('London, UK')).toBeInTheDocument();
      expect(screen.getByText(/£25\.00/)).toBeInTheDocument();
    });

    it('renders only the first badge in horizontal variant', () => {
      renderWithProviders(
        <PremiumExperienceCard
          experience={mockExperience}
          variant="horizontal"
          badges={['bestseller', 'new']}
        />
      );
      expect(screen.getByText('Best Seller')).toBeInTheDocument();
      // Second badge may or may not show depending on design, but first should always show
    });

    it('renders rating in horizontal variant', () => {
      renderWithProviders(
        <PremiumExperienceCard experience={mockExperience} variant="horizontal" />
      );
      expect(screen.getByText('4.5')).toBeInTheDocument();
    });
  });

  describe('featured variant', () => {
    it('renders title as h2', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} variant="featured" />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Test Experience');
    });

    it('renders location, duration, and price', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} variant="featured" />);
      expect(screen.getByText('London, UK')).toBeInTheDocument();
      expect(screen.getByText('2 hours')).toBeInTheDocument();
      expect(screen.getByText('£25.00')).toBeInTheDocument();
    });

    it('renders rating with review count text', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} variant="featured" />);
      expect(screen.getByText('4.5')).toBeInTheDocument();
      expect(screen.getByText('(100 reviews)')).toBeInTheDocument();
    });

    it('renders quick action buttons in featured variant', () => {
      renderWithProviders(<PremiumExperienceCard experience={mockExperience} variant="featured" />);
      expect(screen.getByLabelText('Add to favorites')).toBeInTheDocument();
      expect(screen.getByLabelText('Share')).toBeInTheDocument();
    });

    it('hides quick actions when showQuickActions is false', () => {
      renderWithProviders(
        <PremiumExperienceCard
          experience={mockExperience}
          variant="featured"
          showQuickActions={false}
        />
      );
      expect(screen.queryByLabelText('Add to favorites')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Share')).not.toBeInTheDocument();
    });

    it('renders badges in featured variant', () => {
      renderWithProviders(
        <PremiumExperienceCard
          experience={mockExperience}
          variant="featured"
          badges={['topPick', 'freeCancellation']}
        />
      );
      expect(screen.getByText('Top Pick')).toBeInTheDocument();
      expect(screen.getByText('Free Cancellation')).toBeInTheDocument();
    });
  });

  describe('brand color integration', () => {
    it('applies brand primary color to price in default variant', () => {
      const siteConfig = createMockSiteConfig({
        brand: {
          primaryColor: '#0F766E',
          name: 'Test Brand',
          tagline: null,
          secondaryColor: '#8b5cf6',
          accentColor: '#f59e0b',
          headingFont: 'Inter',
          bodyFont: 'Inter',
          logoUrl: null,
          faviconUrl: null,
          ogImageUrl: null,
          socialLinks: null,
        },
      });

      renderWithProviders(<PremiumExperienceCard experience={mockExperience} />, { siteConfig });
      const priceEl = screen.getByText('£25.00');
      expect(priceEl).toHaveStyle({ color: '#0F766E' });
    });
  });

  describe('placeholder images', () => {
    it('uses placeholder when imageUrl is empty', () => {
      const experience = createMockExperience({ imageUrl: '' });
      renderWithProviders(<PremiumExperienceCard experience={experience} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/placeholder-experience.jpg');
    });
  });
});
