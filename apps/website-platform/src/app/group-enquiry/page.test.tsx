import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GroupEnquiryPage from './page';

vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0F766E' }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GroupEnquiryPage', () => {
  it('renders the group enquiry form', () => {
    render(<GroupEnquiryPage />);
    expect(screen.getByText('Plan a Group Experience')).toBeDefined();
    expect(screen.getByLabelText(/contact name/i)).toBeDefined();
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/group size/i)).toBeDefined();
  });

  it('renders trust signals', () => {
    render(<GroupEnquiryPage />);
    expect(screen.getByText(/dedicated group coordinator/i)).toBeDefined();
    expect(screen.getByText(/custom proposals within 24h/i)).toBeDefined();
  });

  it('renders budget range and experience type selects', () => {
    render(<GroupEnquiryPage />);
    expect(screen.getByLabelText(/budget range/i)).toBeDefined();
    expect(screen.getByLabelText(/experience type/i)).toBeDefined();
  });

  it('allows filling in the form fields', () => {
    render(<GroupEnquiryPage />);

    fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByLabelText(/group size/i), { target: { value: '15' } });

    expect((screen.getByLabelText(/contact name/i) as HTMLInputElement).value).toBe('John');
    expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe('john@test.com');
    expect((screen.getByLabelText(/group size/i) as HTMLInputElement).value).toBe('15');
  });

  it('submits form and shows success message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, message: 'Thank you' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<GroupEnquiryPage />);

    fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByLabelText(/group size/i), { target: { value: '15' } });

    fireEvent.submit(screen.getByLabelText(/contact name/i).closest('form')!);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/contact', expect.any(Object));
    });
  });

  it('shows error when submission fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Server error' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<GroupEnquiryPage />);

    fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByLabelText(/group size/i), { target: { value: '15' } });

    fireEvent.submit(screen.getByLabelText(/contact name/i).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeDefined();
    });
  });
});
