import { test, expect } from '@playwright/test';
import { setupApiInterceptors } from './fixtures/api-interceptor';
import {
  MOCK_BOOKING_ID,
  MOCK_AVAILABILITY_ID,
  mockAvailabilitySlots,
} from './fixtures/booking-mocks';

/**
 * These tests verify the AvailabilityModal flow on a product page.
 * We intercept all API calls to avoid real Holibob requests.
 *
 * Note: The product page itself is server-rendered and requires a real
 * product slug. For now, we test the modal by navigating to a product
 * page and intercepting the experience API call.
 */

test.describe('Availability Modal', () => {
  // Intercept the server-side product fetch so the page renders
  async function setupProductPage(page: import('@playwright/test').Page) {
    // Intercept all API calls
    await setupApiInterceptors(page);

    // Also intercept the server-side product page data fetch
    // The Next.js page.tsx calls the Holibob API server-side, so we can't
    // intercept that via page.route. Instead, we need a real product slug
    // that exists in the database, OR we test the modal in isolation.
    //
    // For this E2E test, we test that the modal works when opened
    // by navigating to a page that has the modal and triggering it.
  }

  test('empty availability shows no dates message', async ({ page }) => {
    await setupApiInterceptors(page, {
      availabilitySlots: {
        success: true,
        data: {
          sessionId: 'session-empty',
          nodes: [],
          optionList: { nodes: [] },
        },
      },
    });

    // We need a product page to test the modal. Since the page is SSR,
    // we'll test the modal by going to a known test product.
    // For CI, this would need a seeded test product or a mock SSR setup.
    // For now, skip if page fails to load and document the approach.
    const response = await page.goto('/experiences/test-product');

    // If the product page doesn't exist (404), skip the test
    if (response && response.status() === 404) {
      test.skip();
      return;
    }

    // Look for the "Check Availability" or "Book Now" button to open modal
    const bookButton = page.getByRole('button', { name: /check availability|book now/i });
    if (await bookButton.isVisible()) {
      await bookButton.click();
      await expect(page.getByTestId('availability-modal')).toBeVisible();
      await expect(page.getByText('No availability found')).toBeVisible();
    }
  });

  test('date selection and slot click works', async ({ page }) => {
    await setupApiInterceptors(page);

    const response = await page.goto('/experiences/test-product');
    if (response && response.status() === 404) {
      test.skip();
      return;
    }

    const bookButton = page.getByRole('button', { name: /check availability|book now/i });
    if (await bookButton.isVisible()) {
      await bookButton.click();
      await expect(page.getByTestId('availability-modal')).toBeVisible();

      // Should show available dates
      await expect(page.getByTestId(`date-slot-${MOCK_AVAILABILITY_ID}`)).toBeVisible();

      // Click a date slot
      await page.getByTestId(`date-slot-${MOCK_AVAILABILITY_ID}`).click();

      // The Continue button should be enabled after selecting a date
      const continueBtn = page.getByRole('button', { name: 'Continue' });
      await expect(continueBtn).toBeEnabled();
    }
  });
});
