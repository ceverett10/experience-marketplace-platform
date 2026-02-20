import { test, expect } from '@playwright/test';
import { setupApiInterceptors } from './fixtures/api-interceptor';
import {
  MOCK_BOOKING_ID,
  mockBookingQuestions,
  mockBookingAnswered,
} from './fixtures/booking-mocks';

/**
 * Mobile-specific checkout flow tests.
 * These validate the checkout funnel works correctly at mobile viewports,
 * ensuring touch targets, form usability, and layout are conversion-ready.
 *
 * Runs on mobile-chrome (Pixel 5, 393x851) and mobile-safari (iPhone 13, 390x844)
 * via Playwright project config. Desktop tests remain in checkout-flow.spec.ts.
 */
test.describe('Checkout Flow - Mobile', () => {
  // Only run on mobile projects (Pixel 5, iPhone 13 set isMobile: true)
  test.skip(({ isMobile }) => !isMobile, 'Mobile-only tests');

  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/booking\?id=/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: MOCK_BOOKING_ID,
            code: 'BK-001',
            state: 'OPEN',
            canCommit: false,
            totalPrice: {
              grossFormattedText: '£50.00',
              gross: 5000,
              currency: 'GBP',
            },
            availabilityList: {
              nodes: [
                {
                  id: 'mock-avail-001',
                  date: '2026-03-15',
                  product: {
                    id: 'mock-product-001',
                    name: 'Sunset Kayak Tour',
                    imageList: {
                      nodes: [{ url: 'https://example.com/kayak.jpg' }],
                    },
                  },
                  totalPrice: {
                    grossFormattedText: '£50.00',
                    gross: 5000,
                    currency: 'GBP',
                  },
                  personList: {
                    nodes: [{ id: 'person-1', pricingCategoryLabel: 'Adult' }],
                  },
                },
              ],
            },
          },
        }),
      });
    });
  });

  test('full checkout flow completes at mobile viewport', async ({ page }) => {
    await setupApiInterceptors(page);
    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);

    // Form should be visible and usable
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Fill lead person details
    await page.getByTestId('lead-first-name').fill('John');
    await page.getByTestId('lead-last-name').fill('Smith');
    await page.getByTestId('lead-email').fill('john@example.com');
    await page.getByTestId('lead-phone').fill('7700900123');
    await page.getByTestId('terms-checkbox').check();

    // Submit
    await page.getByTestId('submit-questions').click();

    // Should proceed to review step
    await expect(page.getByTestId('checkout-review-step')).toBeVisible();

    // Proceed to Payment button should be visible and tappable
    const paymentButton = page.getByTestId('proceed-to-payment');
    await expect(paymentButton).toBeVisible();
    await paymentButton.click();

    // Payment section should appear
    await expect(page.getByTestId('checkout-payment-step')).toBeVisible();
  });

  test('no horizontal overflow at mobile width', async ({ page }) => {
    await setupApiInterceptors(page);
    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Check that the page doesn't have horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('form validation shows errors on mobile', async ({ page }) => {
    await setupApiInterceptors(page);
    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Submit without filling anything
    await page.getByTestId('submit-questions').click();

    // Should show validation errors
    await expect(page.getByText('First name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();

    // Should NOT have moved to review
    await expect(page.getByTestId('checkout-review-step')).not.toBeVisible();
  });

  test('submit button meets minimum touch target size (44px)', async ({ page }) => {
    await setupApiInterceptors(page);
    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    const submitButton = page.getByTestId('submit-questions');
    const box = await submitButton.boundingBox();
    expect(box).not.toBeNull();
    // WCAG 2.5.8: minimum 44x44px touch target
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test('proceed-to-payment button meets minimum touch target size', async ({ page }) => {
    await setupApiInterceptors(page);
    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Fill and submit to reach review step
    await page.getByTestId('lead-first-name').fill('John');
    await page.getByTestId('lead-last-name').fill('Smith');
    await page.getByTestId('lead-email').fill('john@example.com');
    await page.getByTestId('lead-phone').fill('7700900123');
    await page.getByTestId('terms-checkbox').check();
    await page.getByTestId('submit-questions').click();
    await expect(page.getByTestId('checkout-review-step')).toBeVisible();

    const paymentButton = page.getByTestId('proceed-to-payment');
    const box = await paymentButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test('email input has type="email" for mobile keyboard', async ({ page }) => {
    await setupApiInterceptors(page);
    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    const emailInput = page.getByTestId('lead-email');
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('phone input has type="tel" for mobile keyboard', async ({ page }) => {
    await setupApiInterceptors(page);
    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    const phoneInput = page.getByTestId('lead-phone');
    await expect(phoneInput).toHaveAttribute('type', 'tel');
  });

  test('step indicator does not overflow horizontally', async ({ page }) => {
    await setupApiInterceptors(page);
    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // The step indicator container should not cause horizontal overflow
    const viewportWidth = page.viewportSize()?.width ?? 390;
    const stepIndicators = page.locator('[class*="flex items-center gap-0"]');
    const box = await stepIndicators.boundingBox();

    if (box) {
      // Step indicator should fit within viewport
      expect(box.width).toBeLessThanOrEqual(viewportWidth);
    }
  });

  test('order summary content is accessible on mobile', async ({ page }) => {
    await setupApiInterceptors(page);
    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // On mobile, the order summary is stacked below the form.
    // Verify it exists and contains key info (user can scroll to it).
    const orderSummary = page.getByText('Order Summary');
    await expect(orderSummary).toBeAttached();

    // Verify price is present somewhere on the page
    await expect(page.getByText('£50.00').first()).toBeAttached();
  });

  test('checkout page title and header render correctly', async ({ page }) => {
    await setupApiInterceptors(page);
    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);

    // Header should be visible
    await expect(page.getByText('Complete Your Booking')).toBeVisible();

    // Back link should be visible and tappable
    const backLink = page.getByText('Back to experiences');
    await expect(backLink).toBeVisible();
  });
});
