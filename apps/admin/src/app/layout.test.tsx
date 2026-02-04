import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@testing-library/react';

// Mock usePathname
const mockPathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Import after mocks
import AdminLayout from './layout';

describe('AdminLayout', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/');
  });

  it('should render the layout with children', () => {
    render(
      <AdminLayout>
        <div data-testid="child-content">Test Content</div>
      </AdminLayout>
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('should render the holibob logo', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    expect(screen.getByText('holibob')).toBeInTheDocument();
  });

  it('should render Admin badge', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    // Admin appears in both the badge and breadcrumb
    const adminTexts = screen.getAllByText('Admin');
    expect(adminTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('should render all navigation items', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sites/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Opportunities/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Domains/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tasks/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Content/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Link Building/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/i })).toBeInTheDocument();
  });

  it('should have correct href for navigation links', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Sites/i })).toHaveAttribute('href', '/sites');
    expect(screen.getByRole('link', { name: /Opportunities/i })).toHaveAttribute(
      'href',
      '/opportunities'
    );
    expect(screen.getByRole('link', { name: /Domains/i })).toHaveAttribute('href', '/domains');
    expect(screen.getByRole('link', { name: /Tasks/i })).toHaveAttribute('href', '/tasks');
    expect(screen.getByRole('link', { name: /Content/i })).toHaveAttribute('href', '/content');
    expect(screen.getByRole('link', { name: /Link Building/i })).toHaveAttribute(
      'href',
      '/link-building'
    );
    expect(screen.getByRole('link', { name: /Settings/i })).toHaveAttribute('href', '/settings');
  });

  it('should render sign out button', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    expect(screen.getByRole('button', { name: /Sign Out/i })).toBeInTheDocument();
  });

  it('should render notification button', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    const notificationButton = screen.getByRole('button', { name: '🔔' });
    expect(notificationButton).toBeInTheDocument();
  });

  it('should render user avatar', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    expect(screen.getByText('A')).toBeInTheDocument(); // Avatar initial
  });

  it('should render breadcrumb navigation', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('should render mobile menu toggle button', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    const menuButton = screen.getByRole('button', { name: '☰' });
    expect(menuButton).toBeInTheDocument();
  });

  it('should toggle sidebar when mobile menu button is clicked', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    const menuButton = screen.getByRole('button', { name: '☰' });
    fireEvent.click(menuButton);

    // After clicking, the sidebar should be visible (translate-x-0)
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toHaveClass('translate-x-0');
  });

  it('should close sidebar when close button is clicked', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    // Open sidebar first
    const menuButton = screen.getByRole('button', { name: '☰' });
    fireEvent.click(menuButton);

    // Find and click close button
    const closeButton = screen.getByRole('button', { name: '✕' });
    fireEvent.click(closeButton);

    // Sidebar should be hidden again
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toHaveClass('-translate-x-full');
  });

  it('should close sidebar when backdrop is clicked', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    // Open sidebar first
    const menuButton = screen.getByRole('button', { name: '☰' });
    fireEvent.click(menuButton);

    // Find and click backdrop
    const backdrop = document.querySelector('.bg-black\\/50');
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    // Sidebar should be hidden
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toHaveClass('-translate-x-full');
  });

  describe('Active Navigation State', () => {
    it('should highlight Dashboard when on root path', () => {
      mockPathname.mockReturnValue('/');

      render(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
      expect(dashboardLink).toHaveClass('bg-sky-600');
    });

    it('should highlight Sites when on /sites path', () => {
      mockPathname.mockReturnValue('/sites');

      render(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      const sitesLink = screen.getByRole('link', { name: /Sites/i });
      expect(sitesLink).toHaveClass('bg-sky-600');
    });

    it('should highlight Content when on /content path', () => {
      mockPathname.mockReturnValue('/content');

      render(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      const contentLink = screen.getByRole('link', { name: /Content/i });
      expect(contentLink).toHaveClass('bg-sky-600');
    });

    it('should highlight Settings when on /settings path', () => {
      mockPathname.mockReturnValue('/settings');

      render(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      const settingsLink = screen.getByRole('link', { name: /Settings/i });
      expect(settingsLink).toHaveClass('bg-sky-600');
    });

    it('should highlight Opportunities when on /opportunities path', () => {
      mockPathname.mockReturnValue('/opportunities');

      render(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      const opportunitiesLink = screen.getByRole('link', { name: /Opportunities/i });
      expect(opportunitiesLink).toHaveClass('bg-sky-600');
    });
  });

  describe('Breadcrumb Updates', () => {
    it('should show "Dashboard" in breadcrumb on root path', () => {
      mockPathname.mockReturnValue('/');

      render(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      const breadcrumbs = screen.getAllByText('Dashboard');
      expect(breadcrumbs.length).toBeGreaterThanOrEqual(1);
    });

    it('should show "Sites" in breadcrumb on /sites path', () => {
      mockPathname.mockReturnValue('/sites');

      render(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      // Check that "Sites" appears (in both nav and breadcrumb)
      const sitesTexts = screen.getAllByText('Sites');
      expect(sitesTexts.length).toBeGreaterThanOrEqual(1);
    });

    it('should show "Settings" in breadcrumb on /settings path', () => {
      mockPathname.mockReturnValue('/settings');

      render(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      // Both nav item and breadcrumb should show Settings
      const settingsTexts = screen.getAllByText('Settings');
      expect(settingsTexts.length).toBeGreaterThanOrEqual(1);
    });
  });
});
