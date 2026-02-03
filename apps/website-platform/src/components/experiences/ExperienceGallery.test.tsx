import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { ExperienceGallery } from './ExperienceGallery';

const mockImages = [
  'https://example.com/img1.jpg',
  'https://example.com/img2.jpg',
  'https://example.com/img3.jpg',
  'https://example.com/img4.jpg',
  'https://example.com/img5.jpg',
];

describe('ExperienceGallery', () => {
  describe('grid layout', () => {
    it('renders the main image', () => {
      renderWithProviders(<ExperienceGallery images={mockImages} title="Test Tour" />);
      const images = screen.getAllByRole('img');
      expect(images[0]).toHaveAttribute('alt', 'Test Tour');
      expect(images[0]).toHaveAttribute('src', 'https://example.com/img1.jpg');
    });

    it('renders secondary images', () => {
      renderWithProviders(<ExperienceGallery images={mockImages} title="Test Tour" />);
      const images = screen.getAllByRole('img');
      // Main image + 4 secondary images = 5 total
      expect(images.length).toBe(5);
      expect(images[1]).toHaveAttribute('alt', 'Test Tour - Image 2');
    });

    it('renders "Show all photos" button', () => {
      renderWithProviders(<ExperienceGallery images={mockImages} title="Test Tour" />);
      expect(screen.getByText('Show all photos')).toBeInTheDocument();
    });

    it('renders "+N more" overlay when more than 5 images', () => {
      const manyImages = [...mockImages, 'https://example.com/img6.jpg', 'https://example.com/img7.jpg'];
      renderWithProviders(<ExperienceGallery images={manyImages} title="Test Tour" />);
      expect(screen.getByText('+2 more')).toBeInTheDocument();
    });

    it('does not render "+N more" overlay when exactly 5 images', () => {
      renderWithProviders(<ExperienceGallery images={mockImages} title="Test Tour" />);
      expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
    });

    it('uses placeholder for main image when images array is empty', () => {
      renderWithProviders(<ExperienceGallery images={[]} title="Test Tour" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/placeholder-experience.jpg');
    });
  });

  describe('lightbox modal', () => {
    it('opens lightbox when main image is clicked', () => {
      renderWithProviders(<ExperienceGallery images={mockImages} title="Test Tour" />);

      // Click the main image container
      const images = screen.getAllByRole('img');
      fireEvent.click(images[0]!);

      // Lightbox should show image counter
      expect(screen.getByText('1 / 5')).toBeInTheDocument();
    });

    it('opens lightbox when "Show all photos" is clicked', () => {
      renderWithProviders(<ExperienceGallery images={mockImages} title="Test Tour" />);

      fireEvent.click(screen.getByText('Show all photos'));

      // Lightbox should show counter
      expect(screen.getByText(/\d+ \/ 5/)).toBeInTheDocument();
    });

    it('navigates to next image with right arrow', () => {
      renderWithProviders(<ExperienceGallery images={mockImages} title="Test Tour" />);

      // Open lightbox
      fireEvent.click(screen.getByText('Show all photos'));
      expect(screen.getByText('1 / 5')).toBeInTheDocument();

      // Find and click the right navigation arrow (second nav button)
      const navButtons = screen.getAllByRole('button').filter(
        (btn) => !btn.textContent?.includes('Show all')
      );
      // Right arrow is the last navigation button in the lightbox
      const rightArrow = navButtons.find((btn) => {
        const svg = btn.querySelector('svg path');
        return svg?.getAttribute('d')?.includes('8.25 4.5');
      });
      if (rightArrow) {
        fireEvent.click(rightArrow);
        expect(screen.getByText('2 / 5')).toBeInTheDocument();
      }
    });

    it('navigates to previous image with left arrow', () => {
      renderWithProviders(<ExperienceGallery images={mockImages} title="Test Tour" />);

      // Open lightbox
      fireEvent.click(screen.getByText('Show all photos'));

      // Find and click left arrow to wrap to last image
      const navButtons = screen.getAllByRole('button').filter(
        (btn) => !btn.textContent?.includes('Show all')
      );
      const leftArrow = navButtons.find((btn) => {
        const svg = btn.querySelector('svg path');
        return svg?.getAttribute('d')?.includes('15.75 19.5');
      });
      if (leftArrow) {
        fireEvent.click(leftArrow);
        expect(screen.getByText('5 / 5')).toBeInTheDocument();
      }
    });

    it('closes lightbox when close button is clicked', () => {
      renderWithProviders(<ExperienceGallery images={mockImages} title="Test Tour" />);

      // Open lightbox
      fireEvent.click(screen.getByText('Show all photos'));
      expect(screen.getByText('1 / 5')).toBeInTheDocument();

      // Close button has the X icon (M6 18L18 6M6 6l12 12)
      const closeButton = screen.getAllByRole('button').find((btn) => {
        const svg = btn.querySelector('svg path');
        return svg?.getAttribute('d')?.includes('M6 18L18 6');
      });
      if (closeButton) {
        fireEvent.click(closeButton);
        // Counter should no longer be visible
        expect(screen.queryByText('1 / 5')).not.toBeInTheDocument();
      }
    });

    it('closes lightbox when clicking the backdrop', () => {
      renderWithProviders(<ExperienceGallery images={mockImages} title="Test Tour" />);

      // Open lightbox
      fireEvent.click(screen.getByText('Show all photos'));
      expect(screen.getByText('1 / 5')).toBeInTheDocument();

      // Click the backdrop (the fixed overlay div)
      const backdrop = screen.getByText('1 / 5').closest('.fixed');
      if (backdrop) {
        fireEvent.click(backdrop);
        expect(screen.queryByText('1 / 5')).not.toBeInTheDocument();
      }
    });

    it('does not show navigation arrows for single image', () => {
      renderWithProviders(
        <ExperienceGallery images={['https://example.com/single.jpg']} title="Test" />
      );

      // Open lightbox
      const img = screen.getByRole('img');
      fireEvent.click(img);

      // Should show 1/1 counter
      expect(screen.getByText('1 / 1')).toBeInTheDocument();

      // Should not have "Swipe to navigate" hint
      expect(screen.queryByText('Swipe to navigate')).not.toBeInTheDocument();
    });

    it('wraps around when navigating past last image', () => {
      renderWithProviders(
        <ExperienceGallery images={['https://example.com/a.jpg', 'https://example.com/b.jpg']} title="Test" />
      );

      // Open lightbox on second image would start at index 0 by default
      fireEvent.click(screen.getByText('Show all photos'));
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });
  });
});
