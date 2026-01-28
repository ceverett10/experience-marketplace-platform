import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/test-utils';
import AdminDashboardPage from './page';

describe('AdminDashboardPage', () => {
  it('should render the dashboard page header', () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(
      screen.getByText('Overview of your Experience Marketplace platform')
    ).toBeInTheDocument();
  });

  it('should render stat cards with correct values', () => {
    renderWithProviders(<AdminDashboardPage />);

    // Total Sites
    expect(screen.getByText('Total Sites')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8 active')).toBeInTheDocument();

    // Total Bookings
    expect(screen.getByText('Total Bookings')).toBeInTheDocument();
    expect(screen.getByText('156')).toBeInTheDocument();

    // Total Revenue
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('£28,450')).toBeInTheDocument();

    // Conversion Rate
    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();
    expect(screen.getByText('4.2%')).toBeInTheDocument();
  });

  it('should render percentage changes for stat cards', () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(screen.getByText('↑ 25%')).toBeInTheDocument(); // sites
    expect(screen.getByText('↑ 8%')).toBeInTheDocument(); // bookings
    expect(screen.getByText('↑ 15%')).toBeInTheDocument(); // revenue
  });

  it('should render pending content alert', () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(screen.getByText('5 content items pending review')).toBeInTheDocument();
    expect(screen.getByText('Review and approve AI-generated content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review Content' })).toHaveAttribute(
      'href',
      '/content'
    );
  });

  it('should render top performing sites table', () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(screen.getByText('Top Performing Sites')).toBeInTheDocument();
    expect(screen.getByText('London Explorer')).toBeInTheDocument();
    expect(screen.getByText('Paris Highlights')).toBeInTheDocument();
    expect(screen.getByText('Barcelona Adventures')).toBeInTheDocument();

    // Check revenue values
    expect(screen.getByText('£8,250')).toBeInTheDocument();
    expect(screen.getByText('£5,840')).toBeInTheDocument();
    expect(screen.getByText('£4,920')).toBeInTheDocument();
  });

  it('should render table headers', () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(screen.getByRole('columnheader', { name: 'Site' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Bookings' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Revenue' })).toBeInTheDocument();
  });

  it('should render recent activity feed', () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText("New site 'Barcelona Adventures' created")).toBeInTheDocument();
    expect(screen.getByText("New booking on 'London Explorer'")).toBeInTheDocument();
    expect(screen.getByText("Content approved for 'Paris Highlights'")).toBeInTheDocument();
    expect(screen.getByText("SEO meta updated for 'Tokyo Food Tours'")).toBeInTheDocument();
  });

  it('should render activity timestamps', () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    expect(screen.getByText('4 hours ago')).toBeInTheDocument();
    expect(screen.getByText('6 hours ago')).toBeInTheDocument();
    expect(screen.getByText('1 day ago')).toBeInTheDocument();
  });

  it('should render quick action links', () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(screen.getByText('Manage Sites')).toBeInTheDocument();
    expect(screen.getByText('Create & configure storefronts')).toBeInTheDocument();

    expect(screen.getByText('Content Management')).toBeInTheDocument();
    expect(screen.getByText('Review AI-generated content')).toBeInTheDocument();

    expect(screen.getByText('Platform Settings')).toBeInTheDocument();
    expect(screen.getByText('Configure global settings')).toBeInTheDocument();
  });

  it('should have correct href for quick action links', () => {
    renderWithProviders(<AdminDashboardPage />);

    const sitesLink = screen.getByRole('link', { name: /Manage Sites/i });
    const contentLink = screen.getByRole('link', { name: /Content Management/i });
    const settingsLink = screen.getByRole('link', { name: /Platform Settings/i });

    expect(sitesLink).toHaveAttribute('href', '/sites');
    expect(contentLink).toHaveAttribute('href', '/content');
    expect(settingsLink).toHaveAttribute('href', '/settings');
  });

  it('should render refresh button', () => {
    renderWithProviders(<AdminDashboardPage />);

    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    expect(refreshButton).toBeInTheDocument();
    expect(refreshButton).not.toBeDisabled();
  });

  it('should disable refresh button while loading', async () => {
    renderWithProviders(<AdminDashboardPage />);

    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshButton);

    // Button should be disabled during loading
    expect(refreshButton).toBeDisabled();

    // Wait for loading to complete
    await waitFor(
      () => {
        expect(refreshButton).not.toBeDisabled();
      },
      { timeout: 2000 }
    );
  });

  it('should render View all link for top sites', () => {
    renderWithProviders(<AdminDashboardPage />);

    const viewAllLink = screen.getByRole('link', { name: 'View all' });
    expect(viewAllLink).toHaveAttribute('href', '/sites');
  });

  it('should render external site links', () => {
    renderWithProviders(<AdminDashboardPage />);

    const externalLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('target') === '_blank');
    expect(externalLinks.length).toBeGreaterThan(0);
    externalLinks.forEach((link) => {
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('should have clickable stat card linking to sites', () => {
    renderWithProviders(<AdminDashboardPage />);

    // The Total Sites card should link to /sites
    const sitesLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '/sites');
    expect(sitesLinks.length).toBeGreaterThan(0);
  });
});
