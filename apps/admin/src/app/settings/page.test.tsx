import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import AdminSettingsPage from './page';

describe('AdminSettingsPage', () => {
  it('should render the settings page header', () => {
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('heading', { name: 'Platform Settings' })).toBeInTheDocument();
    expect(
      screen.getByText('Configure global settings for the Experience Marketplace')
    ).toBeInTheDocument();
  });

  it('should render save button (disabled initially)', () => {
    renderWithProviders(<AdminSettingsPage />);

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it('should render all settings tabs', () => {
    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByRole('button', { name: /Branding/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Domains/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Commissions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Features/i })).toBeInTheDocument();
  });

  // Branding Tab Tests
  describe('Branding Tab', () => {
    it('should show branding settings by default', () => {
      renderWithProviders(<AdminSettingsPage />);

      expect(screen.getByText('Branding Settings')).toBeInTheDocument();
      expect(screen.getByText('Platform Name')).toBeInTheDocument();
      expect(screen.getByText('Primary Color')).toBeInTheDocument();
      expect(screen.getByText('Secondary Color')).toBeInTheDocument();
    });

    it('should have correct default platform name', () => {
      renderWithProviders(<AdminSettingsPage />);

      expect(screen.getByDisplayValue('Experience Marketplace')).toBeInTheDocument();
    });

    it('should have correct default colors', () => {
      renderWithProviders(<AdminSettingsPage />);

      expect(screen.getByDisplayValue('#0ea5e9')).toBeInTheDocument();
      expect(screen.getByDisplayValue('#06b6d4')).toBeInTheDocument();
    });

    it('should enable save button when platform name is changed', async () => {
      renderWithProviders(<AdminSettingsPage />);

      const platformNameInput = screen.getByDisplayValue('Experience Marketplace');
      fireEvent.change(platformNameInput, { target: { value: 'New Platform Name' } });

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      expect(saveButton).not.toBeDisabled();
    });

    it('should enable save button when colors are changed', async () => {
      renderWithProviders(<AdminSettingsPage />);

      const primaryColorInput = screen.getByDisplayValue('#0ea5e9');
      fireEvent.change(primaryColorInput, { target: { value: '#ff0000' } });

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      expect(saveButton).not.toBeDisabled();
    });
  });

  // Domains Tab Tests
  describe('Domains Tab', () => {
    it('should switch to domains tab when clicked', () => {
      renderWithProviders(<AdminSettingsPage />);

      const domainsTab = screen.getByRole('button', { name: /Domains/i });
      fireEvent.click(domainsTab);

      expect(screen.getByText('Domain Configuration')).toBeInTheDocument();
    });

    it('should show SSL enabled badge', () => {
      renderWithProviders(<AdminSettingsPage />);

      const domainsTab = screen.getByRole('button', { name: /Domains/i });
      fireEvent.click(domainsTab);

      expect(screen.getByText('SSL Enabled')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should show storefront and API domain inputs', () => {
      renderWithProviders(<AdminSettingsPage />);

      const domainsTab = screen.getByRole('button', { name: /Domains/i });
      fireEvent.click(domainsTab);

      expect(screen.getByDisplayValue('v3.experiences.holibob.tech')).toBeInTheDocument();
      expect(screen.getByDisplayValue('api.holibob.com')).toBeInTheDocument();
    });
  });

  // Commissions Tab Tests
  describe('Commissions Tab', () => {
    it('should switch to commissions tab when clicked', () => {
      renderWithProviders(<AdminSettingsPage />);

      const commissionsTab = screen.getByRole('button', { name: /Commissions/i });
      fireEvent.click(commissionsTab);

      expect(screen.getByText('Commission Settings')).toBeInTheDocument();
    });

    it('should show default commission rate', () => {
      renderWithProviders(<AdminSettingsPage />);

      const commissionsTab = screen.getByRole('button', { name: /Commissions/i });
      fireEvent.click(commissionsTab);

      expect(screen.getByDisplayValue('12')).toBeInTheDocument();
    });

    it('should show minimum payout amount', () => {
      renderWithProviders(<AdminSettingsPage />);

      const commissionsTab = screen.getByRole('button', { name: /Commissions/i });
      fireEvent.click(commissionsTab);

      expect(screen.getByDisplayValue('50')).toBeInTheDocument();
    });

    it('should show currency selector with GBP selected', () => {
      renderWithProviders(<AdminSettingsPage />);

      const commissionsTab = screen.getByRole('button', { name: /Commissions/i });
      fireEvent.click(commissionsTab);

      const currencySelect = screen.getByRole('combobox');
      expect(currencySelect).toHaveValue('GBP');
    });

    it('should allow changing currency', () => {
      renderWithProviders(<AdminSettingsPage />);

      const commissionsTab = screen.getByRole('button', { name: /Commissions/i });
      fireEvent.click(commissionsTab);

      const currencySelect = screen.getByRole('combobox');
      fireEvent.change(currencySelect, { target: { value: 'USD' } });

      expect(currencySelect).toHaveValue('USD');
    });
  });

  // Features Tab Tests
  describe('Features Tab', () => {
    it('should switch to features tab when clicked', () => {
      renderWithProviders(<AdminSettingsPage />);

      const featuresTab = screen.getByRole('button', { name: /Features/i });
      fireEvent.click(featuresTab);

      expect(screen.getByText('Feature Flags')).toBeInTheDocument();
    });

    it('should show all feature toggles', () => {
      renderWithProviders(<AdminSettingsPage />);

      const featuresTab = screen.getByRole('button', { name: /Features/i });
      fireEvent.click(featuresTab);

      expect(screen.getByText('AI Content Generation')).toBeInTheDocument();
      expect(screen.getByText('Auto-Publish Content')).toBeInTheDocument();
      expect(screen.getByText('Analytics Tracking')).toBeInTheDocument();
      expect(screen.getByText('Maintenance Mode')).toBeInTheDocument();
    });

    it('should show feature descriptions', () => {
      renderWithProviders(<AdminSettingsPage />);

      const featuresTab = screen.getByRole('button', { name: /Features/i });
      fireEvent.click(featuresTab);

      expect(
        screen.getByText('Enable AI-powered content generation for storefronts')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Automatically publish approved content without manual review')
      ).toBeInTheDocument();
      expect(screen.getByText('Track page views, clicks, and conversions')).toBeInTheDocument();
      expect(screen.getByText('Show maintenance page to all visitors')).toBeInTheDocument();
    });

    it('should show warning badges for dangerous features', () => {
      renderWithProviders(<AdminSettingsPage />);

      const featuresTab = screen.getByRole('button', { name: /Features/i });
      fireEvent.click(featuresTab);

      expect(screen.getByText('Caution')).toBeInTheDocument();
      expect(screen.getByText('Dangerous')).toBeInTheDocument();
    });

    it('should have correct default toggle states', () => {
      renderWithProviders(<AdminSettingsPage />);

      const featuresTab = screen.getByRole('button', { name: /Features/i });
      fireEvent.click(featuresTab);

      const checkboxes = screen.getAllByRole('checkbox');

      // AI Content Generation - enabled by default
      expect(checkboxes[0]).toBeChecked();

      // Auto-Publish - disabled by default
      expect(checkboxes[1]).not.toBeChecked();

      // Analytics - enabled by default
      expect(checkboxes[2]).toBeChecked();

      // Maintenance Mode - disabled by default
      expect(checkboxes[3]).not.toBeChecked();
    });

    it('should toggle feature flags', () => {
      renderWithProviders(<AdminSettingsPage />);

      const featuresTab = screen.getByRole('button', { name: /Features/i });
      fireEvent.click(featuresTab);

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // Toggle Auto-Publish

      expect(checkboxes[1]).toBeChecked();

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      expect(saveButton).not.toBeDisabled();
    });
  });

  // Save functionality tests
  describe('Save Functionality', () => {
    it('should show success message after saving', async () => {
      renderWithProviders(<AdminSettingsPage />);

      // Make a change
      const platformNameInput = screen.getByDisplayValue('Experience Marketplace');
      fireEvent.change(platformNameInput, { target: { value: 'Updated Name' } });

      // Click save
      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText('Settings have been saved successfully.')).toBeInTheDocument();
      });
    });

    it('should show "Saved!" in button after saving', async () => {
      renderWithProviders(<AdminSettingsPage />);

      // Make a change
      const platformNameInput = screen.getByDisplayValue('Experience Marketplace');
      fireEvent.change(platformNameInput, { target: { value: 'Updated Name' } });

      // Click save
      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      // Wait for button text to change
      await waitFor(() => {
        expect(screen.getByText(/Saved!/i)).toBeInTheDocument();
      });
    });

    it('should disable save button after saving', async () => {
      renderWithProviders(<AdminSettingsPage />);

      // Make a change
      const platformNameInput = screen.getByDisplayValue('Experience Marketplace');
      fireEvent.change(platformNameInput, { target: { value: 'Updated Name' } });

      // Click save
      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      // Wait for button to be disabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Saved!/i })).toBeDisabled();
      });
    });
  });
});
