import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaymentInfoModal } from './PaymentInfoModal';

describe('PaymentInfoModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    siteName: 'TestSite',
    primaryColor: '#0d9488',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = 'unset';
  });

  afterEach(() => {
    document.body.style.overflow = 'unset';
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(<PaymentInfoModal {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders modal when isOpen is true', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    expect(screen.getByText('About Your Payment')).toBeInTheDocument();
  });

  it('renders "Secure Payment Processing" section', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    expect(screen.getByText('Secure Payment Processing')).toBeInTheDocument();
    expect(screen.getByText(/securely processed by Holibob/i)).toBeInTheDocument();
  });

  it('renders "Your Bank Statement" section', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    expect(screen.getByText('Your Bank Statement')).toBeInTheDocument();
    expect(screen.getByText(/HOLIBOB LTD UK/)).toBeInTheDocument();
  });

  it('renders "How It Works" section', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    expect(screen.getByText('How It Works')).toBeInTheDocument();
    const networkMatches = screen.getAllByText(/Experiencess.com network/i);
    expect(networkMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Your Booking Is Protected" section', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    expect(screen.getByText('Your Booking Is Protected')).toBeInTheDocument();
  });

  it('renders protection list items', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    expect(screen.getByText(/Secure payment via Stripe \(PCI DSS compliant\)/)).toBeInTheDocument();
    expect(screen.getByText(/Free cancellation based on the terms/)).toBeInTheDocument();
    expect(screen.getByText(/Full customer support from the Holibob team/)).toBeInTheDocument();
  });

  it('renders contact email', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    expect(screen.getByText(/support@holibob.tech/)).toBeInTheDocument();
  });

  it('includes site name in the content', () => {
    render(<PaymentInfoModal {...defaultProps} siteName="MyTourSite" />);
    const content = document.body.textContent;
    expect(content).toContain('MyTourSite');
  });

  it('renders "Got It" footer button', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    expect(screen.getByText('Got It')).toBeInTheDocument();
  });

  it('calls onClose when "Got It" button is clicked', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Got It'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close X button is clicked', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    // The backdrop is the div with bg-black/50
    const backdrop = document.querySelector('.bg-black\\/50');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('sets body overflow to hidden when open', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('resets body overflow to unset when closed', () => {
    const { rerender } = render(<PaymentInfoModal {...defaultProps} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<PaymentInfoModal {...defaultProps} isOpen={false} />);
    expect(document.body.style.overflow).toBe('unset');
  });

  it('applies primaryColor to "Got It" button', () => {
    render(<PaymentInfoModal {...defaultProps} />);
    const button = screen.getByText('Got It');
    expect(button).toHaveStyle({ backgroundColor: '#0d9488' });
  });

  it('uses default primaryColor when not provided', () => {
    render(<PaymentInfoModal isOpen={true} onClose={vi.fn()} siteName="TestSite" />);
    const button = screen.getByText('Got It');
    expect(button).toHaveStyle({ backgroundColor: '#0d9488' });
  });

  it('applies primaryColor to header border', () => {
    render(<PaymentInfoModal {...defaultProps} primaryColor="#ff0000" />);
    const header = screen.getByText('About Your Payment').closest('div');
    expect(header).toHaveStyle({ borderBottomColor: '#ff0000' });
  });
});
