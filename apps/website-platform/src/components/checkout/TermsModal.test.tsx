import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TermsModal } from './TermsModal';

describe('TermsModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  it('renders modal when isOpen is true', () => {
    render(<TermsModal {...defaultProps} />);
    expect(screen.getByText('Holibob Agency Terms & Conditions')).toBeDefined();
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(<TermsModal isOpen={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders all section headings', () => {
    render(<TermsModal {...defaultProps} />);
    expect(screen.getByText('Contract')).toBeDefined();
    expect(screen.getByText('Booking')).toBeDefined();
    expect(screen.getByText('Payment')).toBeDefined();
    expect(screen.getByText('Prices')).toBeDefined();
    expect(screen.getByText('Insurance')).toBeDefined();
    expect(screen.getByText('Special Requests')).toBeDefined();
    expect(screen.getByText('Changes and Cancellations by You')).toBeDefined();
    expect(screen.getByText('Changes and Cancellations by the Supplier/Principal')).toBeDefined();
    expect(screen.getByText('Our Service Charges')).toBeDefined();
    expect(screen.getByText('Our Responsibility for Your Booking')).toBeDefined();
    expect(screen.getByText('Visa, Passport and Health Requirements')).toBeDefined();
    expect(screen.getByText('Complaints')).toBeDefined();
    expect(screen.getByText('Delivery of Documents')).toBeDefined();
    expect(screen.getByText('Law and Jurisdiction')).toBeDefined();
    expect(screen.getByText('Ratings and Standards')).toBeDefined();
    expect(screen.getByText('Documentation & Information')).toBeDefined();
  });

  it('renders service charges table', () => {
    render(<TermsModal {...defaultProps} />);
    expect(screen.getByText('Service')).toBeDefined();
    expect(screen.getByText('Charge')).toBeDefined();
    expect(screen.getByText('Cancellation or amendment')).toBeDefined();
  });

  it('calls onClose when Close button clicked', () => {
    const onClose = vi.fn();
    render(<TermsModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when X button clicked', () => {
    const onClose = vi.fn();
    render(<TermsModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(<TermsModal isOpen={true} onClose={onClose} />);
    // Backdrop is the first child div with bg-black/50
    const backdrop = document.querySelector('.bg-black\\/50');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<TermsModal isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on other keys', () => {
    const onClose = vi.fn();
    render(<TermsModal isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders company registration details', () => {
    render(<TermsModal {...defaultProps} />);
    expect(document.body.textContent).toContain('SC631937');
    expect(document.body.textContent).toContain('Edinburgh');
  });

  it('renders ordered list of booking agreements', () => {
    render(<TermsModal {...defaultProps} />);
    expect(document.body.textContent).toContain(
      'read these Agency Terms & Conditions and agree to be bound by them'
    );
  });

  it('applies custom primaryColor', () => {
    render(<TermsModal isOpen={true} onClose={vi.fn()} primaryColor="#ff0000" />);
    const closeBtn = screen.getByText('Close');
    expect(closeBtn.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });
});
