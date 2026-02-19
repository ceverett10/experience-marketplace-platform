import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { TrackViewItem } from './TrackViewItem';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  trackViewItem: vi.fn(),
}));

import { trackViewItem } from '@/lib/analytics';

describe('TrackViewItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing (invisible component)', () => {
    const { container } = render(<TrackViewItem id="exp-1" name="London Eye" />);
    expect(container.innerHTML).toBe('');
  });

  it('calls trackViewItem on mount with id and name', () => {
    render(<TrackViewItem id="exp-1" name="London Eye" />);

    expect(trackViewItem).toHaveBeenCalledWith({
      id: 'exp-1',
      name: 'London Eye',
      price: undefined,
      currency: undefined,
    });
  });

  it('passes price and currency when provided', () => {
    render(<TrackViewItem id="exp-2" name="Thames Cruise" price={35} currency="GBP" />);

    expect(trackViewItem).toHaveBeenCalledWith({
      id: 'exp-2',
      name: 'Thames Cruise',
      price: 35,
      currency: 'GBP',
    });
  });

  it('calls trackViewItem only once on mount', () => {
    const { rerender } = render(<TrackViewItem id="exp-1" name="London Eye" />);

    // Re-render with same props should not trigger again
    rerender(<TrackViewItem id="exp-1" name="London Eye" />);

    expect(trackViewItem).toHaveBeenCalledTimes(1);
  });

  it('calls trackViewItem again when props change', () => {
    const { rerender } = render(<TrackViewItem id="exp-1" name="London Eye" />);

    rerender(<TrackViewItem id="exp-2" name="Big Ben Tour" />);

    expect(trackViewItem).toHaveBeenCalledTimes(2);
    expect(trackViewItem).toHaveBeenLastCalledWith({
      id: 'exp-2',
      name: 'Big Ben Tour',
      price: undefined,
      currency: undefined,
    });
  });

  it('handles zero price', () => {
    render(<TrackViewItem id="exp-free" name="Free Walking Tour" price={0} currency="GBP" />);

    expect(trackViewItem).toHaveBeenCalledWith({
      id: 'exp-free',
      name: 'Free Walking Tour',
      price: 0,
      currency: 'GBP',
    });
  });
});
