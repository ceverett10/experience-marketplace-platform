import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterChip } from './FilterChip';

describe('FilterChip', () => {
  const defaultProps = {
    label: 'Category',
    activeCount: 0,
    isOpen: false,
    onToggle: vi.fn(),
    children: <div data-testid="dropdown-content">Dropdown content</div>,
  };

  it('renders the label text', () => {
    render(<FilterChip {...defaultProps} />);
    expect(screen.getByText('Category')).toBeInTheDocument();
  });

  it('does not show activeCount badge when count is 0', () => {
    render(<FilterChip {...defaultProps} activeCount={0} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows activeCount badge when count is greater than 0', () => {
    render(<FilterChip {...defaultProps} activeCount={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('has aria-expanded=false when isOpen is false', () => {
    render(<FilterChip {...defaultProps} isOpen={false} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('has aria-expanded=true when isOpen is true', () => {
    render(<FilterChip {...defaultProps} isOpen={true} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('has aria-haspopup=listbox', () => {
    render(<FilterChip {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-haspopup', 'listbox');
  });

  it('does not render children when isOpen is false', () => {
    render(<FilterChip {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('dropdown-content')).not.toBeInTheDocument();
  });

  it('renders children (dropdown) when isOpen is true', () => {
    render(<FilterChip {...defaultProps} isOpen={true} />);
    expect(screen.getByTestId('dropdown-content')).toBeInTheDocument();
    expect(screen.getByText('Dropdown content')).toBeInTheDocument();
  });

  it('calls onToggle when button is clicked', () => {
    const onToggle = vi.fn();
    render(<FilterChip {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onToggle on Escape key when isOpen is true', () => {
    const onToggle = vi.fn();
    render(<FilterChip {...defaultProps} isOpen={true} onToggle={onToggle} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not call onToggle on Escape key when isOpen is false', () => {
    const onToggle = vi.fn();
    render(<FilterChip {...defaultProps} isOpen={false} onToggle={onToggle} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('calls onToggle on click outside when isOpen is true', () => {
    const onToggle = vi.fn();
    render(
      <div>
        <div data-testid="outside">Outside area</div>
        <FilterChip {...defaultProps} isOpen={true} onToggle={onToggle} />
      </div>
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not call onToggle on click inside the chip when isOpen is true', () => {
    const onToggle = vi.fn();
    render(
      <div>
        <div data-testid="outside">Outside area</div>
        <FilterChip {...defaultProps} isOpen={true} onToggle={onToggle} />
      </div>
    );
    fireEvent.mouseDown(screen.getByTestId('dropdown-content'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not call onToggle on click outside when isOpen is false', () => {
    const onToggle = vi.fn();
    render(
      <div>
        <div data-testid="outside">Outside area</div>
        <FilterChip {...defaultProps} isOpen={false} onToggle={onToggle} />
      </div>
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('applies primaryColor as background when activeCount > 0', () => {
    render(<FilterChip {...defaultProps} activeCount={2} primaryColor="#ff0000" />);
    const button = screen.getByRole('button');
    expect(button).toHaveStyle({ backgroundColor: '#ff0000' });
  });

  it('does not apply primaryColor background when activeCount is 0', () => {
    render(<FilterChip {...defaultProps} activeCount={0} primaryColor="#ff0000" />);
    const button = screen.getByRole('button');
    expect(button).not.toHaveStyle({ backgroundColor: '#ff0000' });
  });
});
