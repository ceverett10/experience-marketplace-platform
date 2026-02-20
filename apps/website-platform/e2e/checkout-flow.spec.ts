import { test, expect } from '@playwright/test';
import { setupApiInterceptors } from './fixtures/api-interceptor';
import {
  MOCK_BOOKING_ID,
  mockBookingQuestions,
  mockBookingQuestionsWithDynamic,
  mockBookingAnswered,
  mockBookingNotReady,
  mockBookingGet,
} from './fixtures/booking-mocks';

test.describe('Checkout Flow', () => {
  // Desktop-only: mobile checkout tests live in checkout-mobile.spec.ts
  test.skip(({ isMobile }) => !!isMobile, 'Desktop-only tests');

  test.beforeEach(async ({ page }) => {
    // Intercept the server-side booking fetch (page.tsx calls getBooking)
    await page.route(/\/api\/booking\?id=/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBookingGet),
      });
    });
  });

  test('standard checkout - fill lead person and proceed to review', async ({ page }) => {
    await setupApiInterceptors(page);

    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);

    // Wait for questions to load
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Fill lead person details
    await page.getByTestId('lead-first-name').fill('John');
    await page.getByTestId('lead-last-name').fill('Smith');
    await page.getByTestId('lead-email').fill('john@example.com');
    await page.getByTestId('lead-phone').fill('7700900123');

    // Accept terms
    await page.getByTestId('terms-checkbox').check();

    // Submit
    await page.getByTestId('submit-questions').click();

    // Should proceed to review step
    await expect(page.getByTestId('checkout-review-step')).toBeVisible();
    await expect(
      page.getByTestId('checkout-review-step').getByText('Booking Details')
    ).toBeVisible();
    await expect(
      page.getByTestId('checkout-review-step').getByText('Sunset Kayak Tour')
    ).toBeVisible();

    // Proceed to Payment button should be visible
    await expect(page.getByTestId('proceed-to-payment')).toBeVisible();
  });

  test('form validation - shows errors for empty fields', async ({ page }) => {
    await setupApiInterceptors(page);

    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Submit without filling anything
    await page.getByTestId('submit-questions').click();

    // Should show validation errors
    await expect(page.getByText('First name is required')).toBeVisible();
    await expect(page.getByText('Last name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Phone number is required')).toBeVisible();
    await expect(page.getByText('You must accept the terms and conditions')).toBeVisible();

    // Should NOT have moved to review
    await expect(page.getByTestId('checkout-review-step')).not.toBeVisible();
  });

  test('email validation - shows error for invalid email', async ({ page }) => {
    await setupApiInterceptors(page);

    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    await page.getByTestId('lead-first-name').fill('John');
    await page.getByTestId('lead-last-name').fill('Smith');
    await page.getByTestId('lead-email').fill('not-an-email');
    await page.getByTestId('lead-phone').fill('7700900123');
    await page.getByTestId('terms-checkbox').check();

    await page.getByTestId('submit-questions').click();

    await expect(page.getByText('Invalid email address')).toBeVisible();
  });

  test('dynamic SELECT question renders and can be answered', async ({ page }) => {
    await setupApiInterceptors(page, {
      bookingQuestions: mockBookingQuestionsWithDynamic,
      answerQuestions: mockBookingAnswered,
    });

    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Should see the dynamic SELECT question
    const pickupField = page.getByTestId('dynamic-question-aq-pickup');
    await expect(pickupField).toBeVisible();

    // Should see a dropdown with options
    const dropdown = pickupField.locator('select');
    await expect(dropdown).toBeVisible();

    // Select an option
    await dropdown.selectOption('hotel');

    // Should see the BOOLEAN waiver question
    const waiverField = page.getByTestId('dynamic-question-aq-waiver');
    await expect(waiverField).toBeVisible();

    // Check the waiver
    await waiverField.locator('input[type="checkbox"]').check();

    // Fill lead person and submit
    await page.getByTestId('lead-first-name').fill('John');
    await page.getByTestId('lead-last-name').fill('Smith');
    await page.getByTestId('lead-email').fill('john@example.com');
    await page.getByTestId('lead-phone').fill('7700900123');
    await page.getByTestId('terms-checkbox').check();

    await page.getByTestId('submit-questions').click();

    // Should proceed to review
    await expect(page.getByTestId('checkout-review-step')).toBeVisible();
  });

  test('proceed to payment shows payment section', async ({ page }) => {
    await setupApiInterceptors(page);

    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Fill and submit
    await page.getByTestId('lead-first-name').fill('John');
    await page.getByTestId('lead-last-name').fill('Smith');
    await page.getByTestId('lead-email').fill('john@example.com');
    await page.getByTestId('lead-phone').fill('7700900123');
    await page.getByTestId('terms-checkbox').check();
    await page.getByTestId('submit-questions').click();

    // Wait for review step
    await expect(page.getByTestId('checkout-review-step')).toBeVisible();

    // Click proceed to payment
    await page.getByTestId('proceed-to-payment').click();

    // Payment section should appear
    await expect(page.getByTestId('checkout-payment-step')).toBeVisible();
    await expect(
      page.getByTestId('checkout-payment-step').getByRole('heading', { name: 'Payment' })
    ).toBeVisible();
  });

  test('order summary sidebar shows correct info', async ({ page }) => {
    await setupApiInterceptors(page);

    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Order summary should be visible
    await expect(page.getByText('Order Summary')).toBeVisible();
    await expect(page.getByText('Sunset Kayak Tour').first()).toBeVisible();
    await expect(page.getByText('£50.00').first()).toBeVisible();
  });

  test('isResubmission changes button text after failed submit', async ({ page }) => {
    // First submit returns canCommit=false, refetch also returns canCommit=false
    await setupApiInterceptors(page, {
      answerQuestions: mockBookingNotReady,
    });

    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Initially says "Continue to Payment"
    await expect(page.getByTestId('submit-questions')).toContainText('Continue to Payment');

    // Fill and submit
    await page.getByTestId('lead-first-name').fill('John');
    await page.getByTestId('lead-last-name').fill('Smith');
    await page.getByTestId('lead-email').fill('john@example.com');
    await page.getByTestId('lead-phone').fill('7700900123');
    await page.getByTestId('terms-checkbox').check();
    await page.getByTestId('submit-questions').click();

    // Should show error and button should change to "Submit Answers"
    await expect(page.getByTestId('checkout-error')).toBeVisible();
    await expect(page.getByTestId('submit-questions')).toContainText('Submit Answers');
  });
});
