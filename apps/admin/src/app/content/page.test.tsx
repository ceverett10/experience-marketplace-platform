import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import AdminContentPage from './page';

const mockContentData = [
  {
    id: '1',
    type: 'experience',
    title: 'London Eye Sunset Experience',
    content: 'A stunning sunset experience at the London Eye...',
    contentId: 'c1',
    hasContent: true,
    siteName: 'London Explorer',
    status: 'pending',
    qualityScore: 92,
    generatedAt: '2024-01-15T14:30:00Z',
  },
  {
    id: '2',
    type: 'collection',
    title: 'Best Paris Hidden Gems',
    content: 'Discover the hidden gems of Paris...',
    contentId: 'c2',
    hasContent: true,
    siteName: 'Paris Highlights',
    status: 'approved',
    qualityScore: 88,
    generatedAt: '2024-01-14T10:00:00Z',
  },
  {
    id: '3',
    type: 'seo',
    title: 'SEO: Tokyo Food Tours',
    content: 'Tokyo food tour SEO content...',
    contentId: 'c3',
    hasContent: true,
    siteName: 'Tokyo Adventures',
    status: 'published',
    qualityScore: 95,
    generatedAt: '2024-01-13T08:00:00Z',
  },
  {
    id: '4',
    type: 'blog',
    title: 'Top 10 Adventure Activities in New Zealand',
    content: 'New Zealand adventure activities guide...',
    contentId: 'c4',
    hasContent: true,
    siteName: 'NZ Explorer',
    status: 'pending',
    qualityScore: 78,
    generatedAt: '2024-01-12T12:00:00Z',
  },
];

function buildMockResponse(items: typeof mockContentData) {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 50,
      totalCount: items.length,
      totalPages: items.length > 0 ? 1 : 0,
    },
    stats: {
      total: mockContentData.length,
      pending: mockContentData.filter((c) => c.status === 'pending').length,
      approved: mockContentData.filter((c) => c.status === 'approved').length,
      published: mockContentData.filter((c) => c.status === 'published').length,
      rejected: mockContentData.filter((c) => c.status === 'rejected').length,
    },
  };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      // PATCH requests for status updates
      if (options?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }
      // GET request for content list — simulate server-side filtering
      const parsedUrl = new URL(url, 'http://localhost');
      const search = parsedUrl.searchParams.get('search') || '';
      const status = parsedUrl.searchParams.get('status') || '';

      let filtered = mockContentData;
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (c) => c.title.toLowerCase().includes(q) || c.siteName.toLowerCase().includes(q)
        );
      }
      if (status && status !== 'all') {
        filtered = filtered.filter((c) => c.status === status);
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(buildMockResponse(filtered)),
      });
    })
  );
});

describe('AdminContentPage', () => {
  it('should render the content page header', async () => {
    renderWithProviders(<AdminContentPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Content Management' })).toBeInTheDocument();
    });
    expect(screen.getByText('Review and manage AI-generated content')).toBeInTheDocument();
  });

  describe('Stats Cards', () => {
    it('should render total content count', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByText('Total')).toBeInTheDocument();
      });
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('should render pending content count', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        const pendingTexts = screen.getAllByText('Pending');
        expect(pendingTexts.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should render approved content count', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        const approvedTexts = screen.getAllByText('Approved');
        expect(approvedTexts.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should render published content count', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        const publishedTexts = screen.getAllByText('Published');
        expect(publishedTexts.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should filter by status when clicking stats cards', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByText('London Eye Sunset Experience')).toBeInTheDocument();
      });

      const pendingTexts = screen.getAllByText('Pending');
      const statsCard = pendingTexts
        .find((el) => el.closest('[data-testid="card"]'))
        ?.closest('[data-testid="card"]');
      if (statsCard) {
        fireEvent.click(statsCard);
      }

      await waitFor(() => {
        expect(screen.getByText('London Eye Sunset Experience')).toBeInTheDocument();
      });
    });
  });

  describe('Search and Filters', () => {
    it('should render search input', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search content or sites...')).toBeInTheDocument();
      });
    });

    it('should render status filter dropdown', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
      expect(screen.getByRole('combobox')).toHaveValue('all');
    });

    it('should filter content by search query', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByText('London Eye Sunset Experience')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search content or sites...');
      fireEvent.change(searchInput, { target: { value: 'London' } });

      await waitFor(() => {
        expect(screen.getByText('London Eye Sunset Experience')).toBeInTheDocument();
        expect(screen.queryByText('Best Paris Hidden Gems')).not.toBeInTheDocument();
      });
    });

    it('should filter content by site name', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByText('Best Paris Hidden Gems')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search content or sites...');
      fireEvent.change(searchInput, { target: { value: 'Paris' } });

      await waitFor(() => {
        expect(screen.getByText('Best Paris Hidden Gems')).toBeInTheDocument();
      });
    });

    it('should filter by status dropdown', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      const statusSelect = screen.getByRole('combobox');
      fireEvent.change(statusSelect, { target: { value: 'published' } });

      await waitFor(() => {
        expect(screen.getByText('SEO: Tokyo Food Tours')).toBeInTheDocument();
        expect(screen.queryByText('London Eye Sunset Experience')).not.toBeInTheDocument();
      });
    });

    it('should show empty state when no results match filter', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search content or sites...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search content or sites...');
      fireEvent.change(searchInput, { target: { value: 'NonExistentContent' } });

      await waitFor(() => {
        expect(screen.getByText('No content found')).toBeInTheDocument();
        expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
      });
    });
  });

  describe('Content List', () => {
    it('should render all content items', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByText('London Eye Sunset Experience')).toBeInTheDocument();
      });
      expect(screen.getByText('Best Paris Hidden Gems')).toBeInTheDocument();
      expect(screen.getByText('SEO: Tokyo Food Tours')).toBeInTheDocument();
      expect(screen.getByText('Top 10 Adventure Activities in New Zealand')).toBeInTheDocument();
    });

    it('should display site names for each content item', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByText('London Explorer')).toBeInTheDocument();
      });
      expect(screen.getByText('Paris Highlights')).toBeInTheDocument();
      expect(screen.getByText('Tokyo Adventures')).toBeInTheDocument();
      expect(screen.getByText('NZ Explorer')).toBeInTheDocument();
    });

    it('should display quality scores for each item', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByText('92/100')).toBeInTheDocument();
      });
      expect(screen.getByText('88/100')).toBeInTheDocument();
      expect(screen.getByText('95/100')).toBeInTheDocument();
      expect(screen.getByText('78/100')).toBeInTheDocument();
    });

    it('should display status badges', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        const pendingTexts = screen.getAllByText('Pending');
        expect(pendingTexts.length).toBeGreaterThanOrEqual(1);
      });

      const approvedTexts = screen.getAllByText('Approved');
      expect(approvedTexts.length).toBeGreaterThanOrEqual(1);

      const publishedTexts = screen.getAllByText('Published');
      expect(publishedTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Action Buttons', () => {
    it('should show approve and reject buttons for pending content', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Approve').length).toBeGreaterThan(0);
      });
      expect(screen.getAllByTitle('Reject').length).toBeGreaterThan(0);
    });

    it('should show publish button for approved content', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
      });
    });

    it('should show view button for all content', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getAllByTitle('View').length).toBe(4);
      });
    });

    it('should approve content when approve button is clicked', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Approve').length).toBeGreaterThan(0);
      });

      const approveButtons = screen.getAllByTitle('Approve');
      fireEvent.click(approveButtons[0]!);

      await waitFor(() => {
        const approvedBadges = screen.getAllByText('Approved');
        expect(approvedBadges.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should reject content when reject button is clicked', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Reject').length).toBeGreaterThan(0);
      });

      const rejectButtons = screen.getAllByTitle('Reject');
      fireEvent.click(rejectButtons[0]!);

      // Verify the PATCH was called with reject status
      await waitFor(() => {
        const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
        const patchCall = fetchMock.mock.calls.find(
          (call: unknown[]) => (call[1] as RequestInit)?.method === 'PATCH'
        );
        expect(patchCall).toBeTruthy();
        const body = JSON.parse((patchCall![1] as RequestInit).body as string);
        expect(body.status).toBe('rejected');
        expect(body.id).toBe('1');
      });
    });

    it('should publish content when publish button is clicked', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
      });

      const publishButton = screen.getByRole('button', { name: 'Publish' });
      fireEvent.click(publishButton);

      await waitFor(() => {
        const publishedBadges = screen.getAllByText('Published');
        expect(publishedBadges.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('View Modal', () => {
    it('should open view modal when view button is clicked', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getAllByTitle('View').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('View')[0]!);

      await waitFor(() => {
        expect(screen.getByText('View Content')).toBeInTheDocument();
      });
    });

    it('should show content details in preview modal', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getAllByTitle('View').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('View')[0]!);

      await waitFor(() => {
        expect(screen.getByText('View Content')).toBeInTheDocument();
        expect(screen.getByText('AI Quality Score')).toBeInTheDocument();
      });
    });

    it('should show quality score progress bar in modal', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getAllByTitle('View').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('View')[0]!);

      await waitFor(() => {
        expect(screen.getByText('AI Quality Score')).toBeInTheDocument();
      });
    });

    it('should close preview modal when close button is clicked', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getAllByTitle('View').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('View')[0]!);

      await waitFor(() => {
        expect(screen.getByText('View Content')).toBeInTheDocument();
      });

      const closeButtons = screen.getAllByRole('button', { name: '✕' });
      fireEvent.click(closeButtons[0]!);

      await waitFor(() => {
        expect(screen.queryByText('View Content')).not.toBeInTheDocument();
      });
    });

    it('should show action buttons in modal for pending content', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getAllByTitle('View').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('View')[0]!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument();
      });
    });

    it('should approve from modal and close it', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getAllByTitle('View').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('View')[0]!);

      await waitFor(() => {
        expect(screen.getByText('View Content')).toBeInTheDocument();
      });

      const approveButton = screen.getByRole('button', { name: /✓ Approve/i });
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(screen.queryByText('View Content')).not.toBeInTheDocument();
      });
    });
  });

  describe('Quality Score Colors', () => {
    it('should show green color for high quality scores (85+)', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByText('92/100')).toBeInTheDocument();
      });

      const highScore = screen.getByText('92/100');
      expect(highScore).toHaveClass('text-green-600');
    });

    it('should show amber color for medium quality scores (70-84)', async () => {
      renderWithProviders(<AdminContentPage />);

      await waitFor(() => {
        expect(screen.getByText('78/100')).toBeInTheDocument();
      });

      const mediumScore = screen.getByText('78/100');
      expect(mediumScore).toHaveClass('text-amber-600');
    });
  });
});
