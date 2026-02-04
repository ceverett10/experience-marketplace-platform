import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import OperationsDashboard from './page';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock NEXT_PUBLIC_BASE_PATH
vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');

function createMockDashboardResponse() {
  return {
    health: 'healthy' as const,
    metrics: {
      activeNow: 2,
      completedToday: 15,
      failedToday: 1,
      successRate: 96,
      avgDurationMs: 120000,
      throughputPerHour: 8,
    },
    queues: [
      {
        name: 'content',
        waiting: 0,
        active: 1,
        completed: 10,
        failed: 0,
        delayed: 0,
        paused: false,
        health: 'healthy',
      },
    ],
    queueTotals: { waiting: 0, active: 1, completed: 10, failed: 0, delayed: 0 },
    recentFailures: [],
    scheduledJobs: [
      {
        jobType: 'SEO_ANALYZE',
        schedule: '0 3 * * *',
        description: 'Daily SEO analysis',
        lastRun: null,
      },
    ],
    circuitBreakers: {},
  };
}

describe('OperationsDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays error state when API returns 500', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Failed to fetch operations dashboard' }),
    });

    renderWithProviders(<OperationsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard Unavailable')).toBeInTheDocument();
    });

    expect(screen.getByText('Failed to fetch operations dashboard')).toBeInTheDocument();
    expect(screen.getByText('Retrying automatically every 5 seconds...')).toBeInTheDocument();
  });

  it('displays error state when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));

    renderWithProviders(<OperationsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard Unavailable')).toBeInTheDocument();
    });

    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('shows navigation links in error state', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    });

    renderWithProviders(<OperationsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard Unavailable')).toBeInTheDocument();
    });

    // Navigation links should still be available
    expect(screen.getByText('Job Explorer')).toBeInTheDocument();
    expect(screen.getByText('Error Log')).toBeInTheDocument();
    expect(screen.getByText('Scheduled Jobs')).toBeInTheDocument();
  });

  it('renders dashboard data when API succeeds', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createMockDashboardResponse()),
    });

    renderWithProviders(<OperationsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Operations Dashboard')).toBeInTheDocument();
      expect(screen.getByText('System HEALTHY')).toBeInTheDocument();
    });

    expect(screen.getByText('15')).toBeInTheDocument(); // completedToday
    expect(screen.getByText('96%')).toBeInTheDocument(); // successRate
  });

  it('recovers from error state when API starts working', async () => {
    // First call fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Temporary failure' }),
    });

    renderWithProviders(<OperationsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard Unavailable')).toBeInTheDocument();
    });

    // Next call succeeds
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createMockDashboardResponse()),
    });

    // Advance timer to trigger the 5-second interval
    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(screen.getByText('System HEALTHY')).toBeInTheDocument();
    });

    // Error state should be gone
    expect(screen.queryByText('Dashboard Unavailable')).not.toBeInTheDocument();
  });

  it('handles 500 response with non-JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Not JSON')),
    });

    renderWithProviders(<OperationsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard Unavailable')).toBeInTheDocument();
    });

    // Should show generic error from HTTP status
    expect(screen.getByText('HTTP 500')).toBeInTheDocument();
  });
});
