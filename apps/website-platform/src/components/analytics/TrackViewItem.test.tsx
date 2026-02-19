import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { TrackViewItem } from './TrackViewItem';

// Mock the analytics module
const mockTrackViewItem = vi.fn();
vi.mock('@/lib/analytics', () => ({
  trackViewItem: (...args: any[]) => mockTrackViewItem(...args),
}));

describe('TrackViewItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing (returns null)', () => {
    const { container } = render(<TrackViewItem id="prod-1" name="London Eye" />);
    expect(container.innerHTML).toBe('');
  });

  it('calls trackViewItem on mount with id and name', () => {
    render(<TrackViewItem id="prod-1" name="London Eye" />);

    expect(mockTrackViewItem).toHaveBeenCalledWith({
      id: 'prod-1',
      name: 'London Eye',
      price: undefined,
      currency: undefined,
    });
  });

  it('passes price to trackViewItem when provided', () => {
    render(<TrackViewItem id="prod-1" name="London Eye" price={35} />);

    expect(mockTrackViewItem).toHaveBeenCalledWith({
      id: 'prod-1',
      name: 'London Eye',
      price: 35,
      currency: undefined,
    });
  });

  it('passes currency to trackViewItem when provided', () => {
    render(<TrackViewItem id="prod-1" name="London Eye" price={35} currency="GBP" />);

    expect(mockTrackViewItem).toHaveBeenCalledWith({
      id: 'prod-1',
      name: 'London Eye',
      price: 35,
      currency: 'GBP',
    });
  });

  it('calls trackViewItem exactly once on mount', () => {
    render(<TrackViewItem id="prod-1" name="London Eye" />);
    expect(mockTrackViewItem).toHaveBeenCalledTimes(1);
  });

  it('does not call trackViewItem again on re-render with same props', () => {
    const { rerender } = render(<TrackViewItem id="prod-1" name="London Eye" />);
    rerender(<TrackViewItem id="prod-1" name="London Eye" />);
    // useEffect with same deps should not re-fire
    expect(mockTrackViewItem).toHaveBeenCalledTimes(1);
  });

  it('calls trackViewItem again when id changes', () => {
    const { rerender } = render(<TrackViewItem id="prod-1" name="London Eye" />);
    rerender(<TrackViewItem id="prod-2" name="London Eye" />);
    expect(mockTrackViewItem).toHaveBeenCalledTimes(2);
  });

  it('calls trackViewItem again when name changes', () => {
    const { rerender } = render(<TrackViewItem id="prod-1" name="London Eye" />);
    rerender(<TrackViewItem id="prod-1" name="Tower Bridge" />);
    expect(mockTrackViewItem).toHaveBeenCalledTimes(2);
  });

  it('passes all props including optional ones', () => {
    render(<TrackViewItem id="prod-1" name="Big Ben Tour" price={50} currency="EUR" />);

    expect(mockTrackViewItem).toHaveBeenCalledWith({
      id: 'prod-1',
      name: 'Big Ben Tour',
      price: 50,
      currency: 'EUR',
    });
  });
});
