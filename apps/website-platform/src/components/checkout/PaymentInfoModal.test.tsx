import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaymentInfoModal } from './PaymentInfoModal';

describe('PaymentInfoModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    siteName: 'London Food Tours',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset body overflow after each test
    document.body.style.overflow = '';
  });

  // ── Visibility ──────────────────────────────────────────────────────────

  describe('visibility', () => {
    it('renders modal content when isOpen is true', () => {
      render(<PaymentInfoModal {...defaultProps} />);
      expect(screen.getByText('About Your Payment')).toBeInTheDocument();
    });

    it('returns null when isOpen is false', () => {
      const { container } = render(<PaymentInfoModal {...defaultProps} isOpen={false} />);
      expect(container.innerHTML).toBe('');
    });

    it('does not render any sections when closed', () => {
      render(<PaymentInfoModal {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('Secure Payment Processing')).not.toBeInTheDocument();
      expect(screen.queryByText('Your Bank Statement')).not.toBeInTheDocument();
      expect(screen.queryByText('How It Works')).not.toBeInTheDocument();
    });
  });

  // ── Content sections ──────────────────────────────────────────────────

  describe('content sections', () => {
    it('renders "Secure Payment Processing" section', () => {
      render(<PaymentInfoModal {...defaultProps} />);
      expect(screen.getByText('Secure Payment Processing')).toBeInTheDocument();
      expect(screen.getByText(/securely processed by Holibob/)).toBeInTheDocument();
    });

    it('renders "Your Bank Statement" section', () => {
      render(<PaymentInfoModal {...defaultProps} />);
      expect(screen.getByText('Your Bank Statement')).toBeInTheDocument();
      expect(screen.getByText(/"HOLIBOB LTD UK"/)).toBeInTheDocument();
    });

    it('renders "How It Works" section', () => {
      render(<PaymentInfoModal {...defaultProps} />);
      expect(screen.getByText('How It Works')).toBeInTheDocument();
      expect(screen.getByText(/part of the Experiencess.com network/)).toBeInTheDocument();
    });

    it('renders "Your Booking Is Protected" section', () => {
      render(<PaymentInfoModal {...defaultProps} />);
      expect(screen.getByText('Your Booking Is Protected')).toBeInTheDocument();
    });

    it('renders protection bullet points', () => {
      render(<PaymentInfoModal {...defaultProps} />);
      expect(screen.getByText('Secure payment via Stripe (PCI DSS compliant)')).toBeInTheDocument();
      expect(
        screen.getByText('Free cancellation based on the terms of the experience you are booking')
      ).toBeInTheDocument();
      expect(screen.getByText('Full customer support from the Holibob team')).toBeInTheDocument();
    });

    it('renders support email', () => {
      render(<PaymentInfoModal {...defaultProps} />);
      expect(screen.getByText(/support@holibob\.tech/)).toBeInTheDocument();
    });

    it('renders "Got It" button in footer', () => {
      render(<PaymentInfoModal {...defaultProps} />);
      expect(screen.getByText('Got It')).toBeInTheDocument();
    });
  });

  // ── Site name interpolation ───────────────────────────────────────────

  describe('site name interpolation', () => {
    it('displays the siteName in the payment processing section', () => {
      render(<PaymentInfoModal {...defaultProps} siteName="Rome Adventures" />);
      expect(screen.getByText(/powers Rome Adventures/)).toBeInTheDocument();
    });

    it('displays the siteName in the bank statement section', () => {
      render(<PaymentInfoModal {...defaultProps} siteName="Paris Experiences" />);
      expect(screen.getByText(/on behalf of Paris Experiences/)).toBeInTheDocument();
    });

    it('displays the siteName in the how it works section', () => {
      render(<PaymentInfoModal {...defaultProps} siteName="Barcelona Tours" />);
      expect(screen.getByText(/Barcelona Tours is part of/)).toBeInTheDocument();
    });
  });

  // ── Close actions ─────────────────────────────────────────────────────

  describe('close actions', () => {
    it('calls onClose when "Got It" button is clicked', () => {
      const onClose = vi.fn();
      render(<PaymentInfoModal {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByText('Got It'));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when X button (aria-label Close) is clicked', () => {
      const onClose = vi.fn();
      render(<PaymentInfoModal {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByLabelText('Close'));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<PaymentInfoModal {...defaultProps} onClose={onClose} />);

      const backdrop = document.querySelector('.bg-black\\/50');
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop!);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn();
      render(<PaymentInfoModal {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not call onClose for non-Escape keys', () => {
      const onClose = vi.fn();
      render(<PaymentInfoModal {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Enter' });
      fireEvent.keyDown(document, { key: 'Tab' });
      fireEvent.keyDown(document, { key: 'a' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ── Body overflow management ──────────────────────────────────────────

  describe('body overflow management', () => {
    it('sets body overflow to hidden when open', () => {
      render(<PaymentInfoModal {...defaultProps} />);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('resets body overflow to unset on unmount', () => {
      const { unmount } = render(<PaymentInfoModal {...defaultProps} />);
      expect(document.body.style.overflow).toBe('hidden');

      unmount();
      expect(document.body.style.overflow).toBe('unset');
    });

    it('does not set body overflow when closed', () => {
      document.body.style.overflow = '';
      render(<PaymentInfoModal {...defaultProps} isOpen={false} />);
      expect(document.body.style.overflow).toBe('');
    });

    it('cleans up event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      const { unmount } = render(<PaymentInfoModal {...defaultProps} />);

      unmount();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });

  // ── Primary color styling ─────────────────────────────────────────────

  describe('primary color styling', () => {
    it('applies default primaryColor to the "Got It" button', () => {
      render(<PaymentInfoModal {...defaultProps} />);
      const gotItButton = screen.getByText('Got It');
      expect(gotItButton.style.backgroundColor).toBe('rgb(13, 148, 136)');
    });

    it('applies custom primaryColor to the "Got It" button', () => {
      render(<PaymentInfoModal {...defaultProps} primaryColor="#ff0000" />);
      const gotItButton = screen.getByText('Got It');
      expect(gotItButton.style.backgroundColor).toBe('rgb(255, 0, 0)');
    });

    it('applies primaryColor to the header border', () => {
      render(<PaymentInfoModal {...defaultProps} primaryColor="#3b82f6" />);
      // The header has style={{ borderBottomColor: primaryColor }}
      const header = screen.getByText('About Your Payment').closest('div');
      expect(header?.style.borderBottomColor).toBe('rgb(59, 130, 246)');
    });
  });

  // ── Escape key listener lifecycle ─────────────────────────────────────

  describe('escape key listener lifecycle', () => {
    it('does not fire onClose after modal is closed', () => {
      const onClose = vi.fn();
      const { rerender } = render(<PaymentInfoModal {...defaultProps} onClose={onClose} />);

      // Close modal
      rerender(<PaymentInfoModal {...defaultProps} isOpen={false} onClose={onClose} />);

      // Escape should not trigger onClose since listener was removed
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
