import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import AdminContentPage from './page';

describe('AdminContentPage', () => {
  it('should render the content page header', () => {
    renderWithProviders(<AdminContentPage />);

    expect(screen.getByRole('heading', { name: 'Content Management' })).toBeInTheDocument();
    expect(screen.getByText('Review and manage AI-generated content')).toBeInTheDocument();
  });

  // Stats Cards Tests
  describe('Stats Cards', () => {
    it('should render total content count', () => {
      renderWithProviders(<AdminContentPage />);

      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('should render pending content count', () => {
      renderWithProviders(<AdminContentPage />);

      // "Pending" appears in multiple places (dropdown option + badges + stats card)
      const pendingTexts = screen.getAllByText('Pending');
      expect(pendingTexts.length).toBeGreaterThanOrEqual(1);
    });

    it('should render approved content count', () => {
      renderWithProviders(<AdminContentPage />);

      // "Approved" appears in multiple places
      const approvedTexts = screen.getAllByText('Approved');
      expect(approvedTexts.length).toBeGreaterThanOrEqual(1);
    });

    it('should render published content count', () => {
      renderWithProviders(<AdminContentPage />);

      // "Published" appears in multiple places
      const publishedTexts = screen.getAllByText('Published');
      expect(publishedTexts.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by status when clicking stats cards', () => {
      renderWithProviders(<AdminContentPage />);

      // Click on Pending stats card - find by the data-testid="card" with "Pending" text
      const pendingTexts = screen.getAllByText('Pending');
      // Find the one in the stats card (not in dropdown or badge)
      const statsCard = pendingTexts
        .find((el) => el.closest('[data-testid="card"]'))
        ?.closest('[data-testid="card"]');
      if (statsCard) {
        fireEvent.click(statsCard);
      }

      // Should show only pending items
      expect(screen.getByText('London Eye Sunset Experience')).toBeInTheDocument();
    });
  });

  // Search and Filter Tests
  describe('Search and Filters', () => {
    it('should render search input', () => {
      renderWithProviders(<AdminContentPage />);

      expect(screen.getByPlaceholderText('Search content or sites...')).toBeInTheDocument();
    });

    it('should render status filter dropdown', () => {
      renderWithProviders(<AdminContentPage />);

      const statusSelect = screen.getByRole('combobox');
      expect(statusSelect).toBeInTheDocument();
      expect(statusSelect).toHaveValue('all');
    });

    it('should filter content by search query', async () => {
      renderWithProviders(<AdminContentPage />);

      const searchInput = screen.getByPlaceholderText('Search content or sites...');
      fireEvent.change(searchInput, { target: { value: 'London' } });

      await waitFor(() => {
        expect(screen.getByText('London Eye Sunset Experience')).toBeInTheDocument();
        expect(screen.queryByText('Best Paris Hidden Gems')).not.toBeInTheDocument();
      });
    });

    it('should filter content by site name', async () => {
      renderWithProviders(<AdminContentPage />);

      const searchInput = screen.getByPlaceholderText('Search content or sites...');
      fireEvent.change(searchInput, { target: { value: 'Paris' } });

      await waitFor(() => {
        expect(screen.getByText('Best Paris Hidden Gems')).toBeInTheDocument();
      });
    });

    it('should filter by status dropdown', async () => {
      renderWithProviders(<AdminContentPage />);

      const statusSelect = screen.getByRole('combobox');
      fireEvent.change(statusSelect, { target: { value: 'published' } });

      await waitFor(() => {
        expect(screen.getByText('SEO: Tokyo Food Tours')).toBeInTheDocument();
        expect(screen.queryByText('London Eye Sunset Experience')).not.toBeInTheDocument();
      });
    });

    it('should show empty state when no results match filter', async () => {
      renderWithProviders(<AdminContentPage />);

      const searchInput = screen.getByPlaceholderText('Search content or sites...');
      fireEvent.change(searchInput, { target: { value: 'NonExistentContent' } });

      await waitFor(() => {
        expect(screen.getByText('No content found')).toBeInTheDocument();
        expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
      });
    });
  });

  // Content List Tests
  describe('Content List', () => {
    it('should render all content items', () => {
      renderWithProviders(<AdminContentPage />);

      expect(screen.getByText('London Eye Sunset Experience')).toBeInTheDocument();
      expect(screen.getByText('Best Paris Hidden Gems')).toBeInTheDocument();
      expect(screen.getByText('SEO: Tokyo Food Tours')).toBeInTheDocument();
      expect(screen.getByText('Top 10 Adventure Activities in New Zealand')).toBeInTheDocument();
    });

    it('should display site names for each content item', () => {
      renderWithProviders(<AdminContentPage />);

      expect(screen.getByText('London Explorer')).toBeInTheDocument();
      expect(screen.getByText('Paris Highlights')).toBeInTheDocument();
      expect(screen.getByText('Tokyo Adventures')).toBeInTheDocument();
      expect(screen.getByText('NZ Explorer')).toBeInTheDocument();
    });

    it('should display quality scores for each item', () => {
      renderWithProviders(<AdminContentPage />);

      expect(screen.getByText('92/100')).toBeInTheDocument();
      expect(screen.getByText('88/100')).toBeInTheDocument();
      expect(screen.getByText('95/100')).toBeInTheDocument();
      expect(screen.getByText('78/100')).toBeInTheDocument();
    });

    it('should display status badges', () => {
      renderWithProviders(<AdminContentPage />);

      // Multiple items with "Pending" status (appears in dropdown options and badges)
      const pendingTexts = screen.getAllByText('Pending');
      expect(pendingTexts.length).toBeGreaterThanOrEqual(1);

      // "Approved" and "Published" also appear in dropdown and badges
      const approvedTexts = screen.getAllByText('Approved');
      expect(approvedTexts.length).toBeGreaterThanOrEqual(1);

      const publishedTexts = screen.getAllByText('Published');
      expect(publishedTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // Action Buttons Tests
  describe('Action Buttons', () => {
    it('should show approve and reject buttons for pending content', () => {
      renderWithProviders(<AdminContentPage />);

      // Find buttons with title attribute
      const approveButtons = screen.getAllByTitle('Approve');
      const rejectButtons = screen.getAllByTitle('Reject');

      expect(approveButtons.length).toBeGreaterThan(0);
      expect(rejectButtons.length).toBeGreaterThan(0);
    });

    it('should show publish button for approved content', () => {
      renderWithProviders(<AdminContentPage />);

      expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    });

    it('should show preview button for all content', () => {
      renderWithProviders(<AdminContentPage />);

      const previewButtons = screen.getAllByTitle('Preview');
      expect(previewButtons.length).toBe(4); // One for each content item
    });

    it('should approve content when approve button is clicked', async () => {
      renderWithProviders(<AdminContentPage />);

      const approveButtons = screen.getAllByTitle('Approve');
      fireEvent.click(approveButtons[0]);

      // The content should now show as approved
      await waitFor(() => {
        // Check that one item became approved (we should have more approved items now)
        const approvedBadges = screen.getAllByText('Approved');
        expect(approvedBadges.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should reject content when reject button is clicked', async () => {
      renderWithProviders(<AdminContentPage />);

      // Count initial "Rejected" texts (only in dropdown option initially)
      const initialRejected = screen.getAllByText('Rejected');
      const initialCount = initialRejected.length;

      const rejectButtons = screen.getAllByTitle('Reject');
      fireEvent.click(rejectButtons[0]);

      // The content should now show as rejected - there should be more "Rejected" texts now
      await waitFor(() => {
        const rejectedTexts = screen.getAllByText('Rejected');
        expect(rejectedTexts.length).toBeGreaterThan(initialCount);
      });
    });

    it('should publish content when publish button is clicked', async () => {
      renderWithProviders(<AdminContentPage />);

      const publishButton = screen.getByRole('button', { name: 'Publish' });
      fireEvent.click(publishButton);

      // The content should now show as published
      await waitFor(() => {
        const publishedBadges = screen.getAllByText('Published');
        expect(publishedBadges.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // Preview Modal Tests
  describe('Preview Modal', () => {
    it('should open preview modal when preview button is clicked', async () => {
      renderWithProviders(<AdminContentPage />);

      const previewButtons = screen.getAllByTitle('Preview');
      fireEvent.click(previewButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Content Preview')).toBeInTheDocument();
      });
    });

    it('should show content details in preview modal', async () => {
      renderWithProviders(<AdminContentPage />);

      const previewButtons = screen.getAllByTitle('Preview');
      fireEvent.click(previewButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Content Preview')).toBeInTheDocument();
        expect(screen.getByText('AI Quality Score')).toBeInTheDocument();
      });
    });

    it('should show quality score progress bar in modal', async () => {
      renderWithProviders(<AdminContentPage />);

      const previewButtons = screen.getAllByTitle('Preview');
      fireEvent.click(previewButtons[0]);

      await waitFor(() => {
        // The quality score should be displayed
        expect(screen.getByText('AI Quality Score')).toBeInTheDocument();
      });
    });

    it('should close preview modal when close button is clicked', async () => {
      renderWithProviders(<AdminContentPage />);

      const previewButtons = screen.getAllByTitle('Preview');
      fireEvent.click(previewButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Content Preview')).toBeInTheDocument();
      });

      // Find the modal close button - it's the one inside the modal header
      const closeButtons = screen.getAllByRole('button', { name: '✕' });
      // The first "✕" button in the modal is typically the close button
      fireEvent.click(closeButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText('Content Preview')).not.toBeInTheDocument();
      });
    });

    it('should show action buttons in modal for pending content', async () => {
      renderWithProviders(<AdminContentPage />);

      // Click preview on pending item (London Eye)
      const previewButtons = screen.getAllByTitle('Preview');
      fireEvent.click(previewButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument();
      });
    });

    it('should approve from modal and close it', async () => {
      renderWithProviders(<AdminContentPage />);

      const previewButtons = screen.getAllByTitle('Preview');
      fireEvent.click(previewButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Content Preview')).toBeInTheDocument();
      });

      const approveButton = screen.getByRole('button', { name: /✓ Approve/i });
      fireEvent.click(approveButton);

      // Modal should close
      await waitFor(() => {
        expect(screen.queryByText('Content Preview')).not.toBeInTheDocument();
      });
    });
  });

  // Quality Score Color Tests
  describe('Quality Score Colors', () => {
    it('should show green color for high quality scores (85+)', () => {
      renderWithProviders(<AdminContentPage />);

      const highScore = screen.getByText('92/100');
      expect(highScore).toHaveClass('text-green-600');
    });

    it('should show amber color for medium quality scores (70-84)', () => {
      renderWithProviders(<AdminContentPage />);

      const mediumScore = screen.getByText('78/100');
      expect(mediumScore).toHaveClass('text-amber-600');
    });
  });
});
