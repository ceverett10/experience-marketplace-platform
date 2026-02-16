import { test, expect } from '@playwright/test';
import { setupApiInterceptors, setupConditionalQuestionFlow } from './fixtures/api-interceptor';
import {
  MOCK_BOOKING_ID,
  mockBookingQuestionsConditionalRound1,
  mockBookingQuestionsConditionalRound2,
  mockBookingNotReady,
  mockBookingAnswered,
  mockBookingGet,
} from './fixtures/booking-mocks';

test.describe('Conditional Questions - Iterative Loop', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/booking\?id=/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBookingGet),
      });
    });
  });

  test('two-round submit reveals conditional question then succeeds', async ({ page }) => {
    // Round 1: GET questions returns SELECT question, POST returns canCommit=false
    // Round 2: GET questions returns SELECT (answered) + new TEXT question, POST returns canCommit=true
    await setupApiInterceptors(page);

    // State-machine handler: GET responses only advance after POST
    await setupConditionalQuestionFlow(page, [
      {
        getResponse: mockBookingQuestionsConditionalRound1,
        postResponse: mockBookingNotReady,
      },
      {
        getResponse: mockBookingQuestionsConditionalRound2,
        postResponse: mockBookingAnswered,
      },
    ]);

    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Should see the Transport Type SELECT question
    const transportField = page.getByTestId('dynamic-question-aq-transport');
    await expect(transportField).toBeVisible();
    await transportField.locator('select').selectOption('hotel');

    // Fill lead person
    await page.getByTestId('lead-first-name').fill('Jane');
    await page.getByTestId('lead-last-name').fill('Doe');
    await page.getByTestId('lead-email').fill('jane@example.com');
    await page.getByTestId('lead-phone').fill('7700900456');
    await page.getByTestId('terms-checkbox').check();

    // Submit (Round 1)
    await page.getByTestId('submit-questions').click();

    // Should NOT go to review - canCommit is false
    await expect(page.getByTestId('checkout-review-step')).not.toBeVisible();

    // Should show error about additional questions
    await expect(page.getByTestId('checkout-error')).toBeVisible();

    // Button text should change
    await expect(page.getByTestId('submit-questions')).toContainText('Submit Answers');

    // New Hotel Name TEXT question should appear
    const hotelField = page.getByTestId('dynamic-question-aq-hotel-name');
    await expect(hotelField).toBeVisible();

    // Fill the new question
    await hotelField.locator('input').fill('Grand Hyatt');

    // Submit (Round 2)
    await page.getByTestId('submit-questions').click();

    // Now should proceed to review
    await expect(page.getByTestId('checkout-review-step')).toBeVisible();
  });

  test('error message shows remaining question count', async ({ page }) => {
    await setupApiInterceptors(page);

    // Single round: POST returns canCommit=false, GET refetch returns round 2
    await setupConditionalQuestionFlow(page, [
      {
        getResponse: mockBookingQuestionsConditionalRound1,
        postResponse: mockBookingNotReady,
      },
      {
        getResponse: mockBookingQuestionsConditionalRound2,
        postResponse: mockBookingNotReady,
      },
    ]);

    await page.goto(`/checkout/${MOCK_BOOKING_ID}`);
    await expect(page.getByTestId('questions-form')).toBeVisible();

    // Select transport
    await page.getByTestId('dynamic-question-aq-transport').locator('select').selectOption('hotel');

    // Fill lead person and submit
    await page.getByTestId('lead-first-name').fill('Jane');
    await page.getByTestId('lead-last-name').fill('Doe');
    await page.getByTestId('lead-email').fill('jane@example.com');
    await page.getByTestId('lead-phone').fill('7700900456');
    await page.getByTestId('terms-checkbox').check();
    await page.getByTestId('submit-questions').click();

    // Error should mention additional questions
    const errorEl = page.getByTestId('checkout-error');
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toContainText('additional question');
  });
});
