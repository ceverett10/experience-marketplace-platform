import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GroupEnquiryPage from './page';

vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0F766E' }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('GroupEnquiryPage', () => {
  it('renders the group enquiry form', () => {
    render(<GroupEnquiryPage />);
    expect(screen.getByText('Plan a Group Experience')).toBeDefined();
    expect(screen.getByLabelText(/contact name/i)).toBeDefined();
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/group size/i)).toBeDefined();
  });
});
