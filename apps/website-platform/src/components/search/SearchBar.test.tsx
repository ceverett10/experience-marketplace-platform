import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from './SearchBar';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));
vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0d9488' }),
}));

describe('SearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hero variant (default)', () => {
    it('renders Where/When/Who labels', () => {
      render(<SearchBar />);
      expect(screen.getByText('Where')).toBeInTheDocument();
      expect(screen.getByText('When')).toBeInTheDocument();
      expect(screen.getByText('Who')).toBeInTheDocument();
    });

    it('renders Search button', () => {
      render(<SearchBar />);
      expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
    });

    it('renders location input with "Search destinations" placeholder', () => {
      render(<SearchBar />);
      expect(screen.getByPlaceholderText('Search destinations')).toBeInTheDocument();
    });

    it('renders date input', () => {
      render(<SearchBar />);
      expect(screen.getByLabelText('When')).toBeInTheDocument();
    });

    it('shows 10 guest options (1-10)', () => {
      render(<SearchBar />);
      const select = screen.getByLabelText('Who');
      const options = select.querySelectorAll('option');
      expect(options).toHaveLength(10);
      expect(options[0]).toHaveTextContent('1 guest');
      expect(options[1]).toHaveTextContent('2 guests');
      expect(options[9]).toHaveTextContent('10 guests');
    });

    it('submits search with location, date, and guests params', () => {
      render(<SearchBar defaultLocation="Paris" defaultDate="2026-03-15" defaultGuests={4} />);
      const form = screen.getByRole('button', { name: /search/i }).closest('form')!;
      fireEvent.submit(form);
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/experiences?'));
      const calledUrl = mockPush.mock.calls[0][0] as string;
      expect(calledUrl).toContain('location=Paris');
      expect(calledUrl).toContain('date=2026-03-15');
      expect(calledUrl).toContain('guests=4');
    });

    it('does not include default guests=2 in params', () => {
      render(<SearchBar defaultLocation="Rome" />);
      const form = screen.getByRole('button', { name: /search/i }).closest('form')!;
      fireEvent.submit(form);
      const calledUrl = mockPush.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('guests=');
    });

    it('includes non-default guests in params', () => {
      render(<SearchBar defaultLocation="Rome" defaultGuests={5} />);
      const form = screen.getByRole('button', { name: /search/i }).closest('form')!;
      fireEvent.submit(form);
      const calledUrl = mockPush.mock.calls[0][0] as string;
      expect(calledUrl).toContain('guests=5');
    });

    it('applies custom className', () => {
      const { container } = render(<SearchBar className="my-custom-class" />);
      expect(container.firstElementChild).toHaveClass('my-custom-class');
    });
  });

  describe('compact variant', () => {
    it('renders compact variant with "Where to?" placeholder', () => {
      render(<SearchBar variant="compact" />);
      expect(screen.getByPlaceholderText('Where to?')).toBeInTheDocument();
    });

    it('renders Search button in compact variant', () => {
      render(<SearchBar variant="compact" />);
      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    });

    it('submits search with location parameter', () => {
      render(<SearchBar variant="compact" />);
      const input = screen.getByPlaceholderText('Where to?');
      fireEvent.change(input, { target: { value: 'London' } });
      fireEvent.submit(input.closest('form')!);
      expect(mockPush).toHaveBeenCalledWith('/experiences?location=London');
    });

    it('does not include empty location in params', () => {
      render(<SearchBar variant="compact" />);
      const input = screen.getByPlaceholderText('Where to?');
      fireEvent.submit(input.closest('form')!);
      expect(mockPush).toHaveBeenCalledWith('/experiences?');
    });

    it('applies brand primaryColor to submit button', () => {
      render(<SearchBar variant="compact" />);
      const button = screen.getByRole('button', { name: 'Search' });
      expect(button).toHaveStyle({ backgroundColor: '#0d9488' });
    });
  });

  describe('form interaction', () => {
    it('updates location input on change', () => {
      render(<SearchBar />);
      const input = screen.getByPlaceholderText('Search destinations');
      fireEvent.change(input, { target: { value: 'Barcelona' } });
      expect(input).toHaveValue('Barcelona');
    });

    it('updates guest select on change', () => {
      render(<SearchBar />);
      const select = screen.getByLabelText('Who');
      fireEvent.change(select, { target: { value: '6' } });
      expect(select).toHaveValue('6');
    });

    it('prevents default form submission behavior', () => {
      render(<SearchBar defaultLocation="Test" />);
      const form = screen.getByRole('button', { name: /search/i }).closest('form')!;
      const event = new Event('submit', { bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      form.dispatchEvent(event);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });
});
