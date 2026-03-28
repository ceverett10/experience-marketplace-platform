import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShareButton } from './ShareButton';

// Mock navigator
beforeEach(() => {
  vi.stubGlobal('navigator', {
    ...navigator,
    share: undefined,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('ShareButton', () => {
  it('renders icon variant by default', () => {
    render(<ShareButton title="Test Experience" />);
    expect(screen.getByRole('button', { name: /share/i })).toBeDefined();
  });

  it('renders button variant with text', () => {
    render(<ShareButton title="Test Experience" variant="button" />);
    expect(screen.getByText('Share')).toBeDefined();
  });

  it('renders card-overlay variant', () => {
    render(<ShareButton title="Test" variant="card-overlay" />);
    expect(screen.getByRole('button', { name: 'Share' })).toBeDefined();
  });

  it('opens share menu on click when Web Share API not available', () => {
    render(<ShareButton title="Test Experience" variant="button" />);
    fireEvent.click(screen.getByRole('button'));

    // Should show WhatsApp, Email, Copy link options
    expect(screen.getByText('WhatsApp')).toBeDefined();
    expect(screen.getByText('Email')).toBeDefined();
    expect(screen.getByText('Copy link')).toBeDefined();
  });

  it('copies link to clipboard when Copy link is clicked', async () => {
    render(<ShareButton title="Test" url="https://example.com/test" variant="button" />);

    // Open menu
    fireEvent.click(screen.getByRole('button'));

    // Click copy
    fireEvent.click(screen.getByText('Copy link'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com/test');
  });

  it('toggles menu open and closed', () => {
    render(<ShareButton title="Test" variant="button" />);

    // Open
    fireEvent.click(screen.getByText('Share'));
    expect(screen.getByText('WhatsApp')).toBeDefined();

    // Close by clicking the share button again (identified by aria-label)
    fireEvent.click(screen.getByLabelText('Share this experience'));
    expect(screen.queryByText('WhatsApp')).toBeNull();
  });
});
