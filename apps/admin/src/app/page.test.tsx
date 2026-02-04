import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/test-utils';
import AdminDashboardPage from './page';

// Mock fetch for dashboard API
const mockDashboardData = {
  stats: {
    totalSites: 12,
    activeSites: 8,
    totalBookings: 156,
    totalRevenue: 28450,
    contentPending: 5,
    conversionRate: 4.2,
    changes: {
      sites: 25,
      bookings: 8,
      revenue: 15,
    },
  },
  topSites: [
    {
      id: '1',
      name: 'London Explorer',
      domain: 'london-explorer.com',
      bookings: 45,
      revenue: 8250,
    },
    {
      id: '2',
      name: 'Paris Highlights',
      domain: 'paris-highlights.com',
      bookings: 32,
      revenue: 5840,
    },
    {
      id: '3',
      name: 'Barcelona Adventures',
      domain: 'barcelona-adventures.com',
      bookings: 28,
      revenue: 4920,
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDashboardData),
    })
  );
});

describe('AdminDashboardPage', () => {
  it('should render the dashboard page header', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    });
    expect(
      screen.getByText('Overview of your Experience Marketplace platform')
    ).toBeInTheDocument();
  });

  it('should render stat cards with correct values', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Total Sites')).toBeInTheDocument();
    });

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8 active')).toBeInTheDocument();
    expect(screen.getByText('Total Bookings')).toBeInTheDocument();
    expect(screen.getByText('156')).toBeInTheDocument();
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('£28,450')).toBeInTheDocument();
    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();
    expect(screen.getByText('4.2%')).toBeInTheDocument();
  });

  it('should render percentage changes for stat cards', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('↑ 25%')).toBeInTheDocument();
    });
    expect(screen.getByText('↑ 8%')).toBeInTheDocument();
    expect(screen.getByText('↑ 15%')).toBeInTheDocument();
  });

  it('should render pending content alert', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('5 content items pending review')).toBeInTheDocument();
    });
    expect(screen.getByText('Review and approve AI-generated content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review Content' })).toHaveAttribute(
      'href',
      '/content'
    );
  });

  it('should render top performing sites table', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Top Performing Sites')).toBeInTheDocument();
    });
    expect(screen.getByText('London Explorer')).toBeInTheDocument();
    expect(screen.getByText('Paris Highlights')).toBeInTheDocument();
    expect(screen.getByText('Barcelona Adventures')).toBeInTheDocument();

    expect(screen.getByText('£8,250')).toBeInTheDocument();
    expect(screen.getByText('£5,840')).toBeInTheDocument();
    expect(screen.getByText('£4,920')).toBeInTheDocument();
  });

  it('should render table headers', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Site' })).toBeInTheDocument();
    });
    expect(screen.getByRole('columnheader', { name: 'Bookings' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Revenue' })).toBeInTheDocument();
  });

  it('should render quick action links', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Manage Sites')).toBeInTheDocument();
    });
    expect(screen.getByText('Create & configure storefronts')).toBeInTheDocument();
    expect(screen.getByText('Content Management')).toBeInTheDocument();
    expect(screen.getByText('Review AI-generated content')).toBeInTheDocument();
    expect(screen.getByText('Platform Settings')).toBeInTheDocument();
    expect(screen.getByText('Configure global settings')).toBeInTheDocument();
  });

  it('should have correct href for quick action links', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Manage Sites')).toBeInTheDocument();
    });

    const sitesLink = screen.getByRole('link', { name: /Manage Sites/i });
    const contentLink = screen.getByRole('link', { name: /Content Management/i });
    const settingsLink = screen.getByRole('link', { name: /Platform Settings/i });

    expect(sitesLink).toHaveAttribute('href', '/sites');
    expect(contentLink).toHaveAttribute('href', '/content');
    expect(settingsLink).toHaveAttribute('href', '/settings');
  });

  it('should render refresh button', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
    });
  });

  it('should render View all link for top sites', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'View all' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/sites');
  });

  it('should render external site links', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('London Explorer')).toBeInTheDocument();
    });

    const externalLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('target') === '_blank');
    expect(externalLinks.length).toBeGreaterThan(0);
    externalLinks.forEach((link) => {
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('should have clickable stat card linking to sites', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Total Sites')).toBeInTheDocument();
    });

    const sitesLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '/sites');
    expect(sitesLinks.length).toBeGreaterThan(0);
  });

  it('should show error state when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to load dashboard data. Please try again.')
      ).toBeInTheDocument();
    });
  });
});
