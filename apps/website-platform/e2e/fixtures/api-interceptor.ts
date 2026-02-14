/**
 * Playwright route interception helper.
 * Intercepts Next.js API routes to return mock data without hitting real Holibob API.
 */

import { type Page } from '@playwright/test';
import {
  MOCK_BOOKING_ID,
  mockAvailabilitySlots,
  mockAvailabilityDetail,
  mockAvailabilityOptionsComplete,
  mockAvailabilityPricing,
  mockBookingCreate,
  mockAddAvailability,
  mockBookingQuestions,
  mockBookingAnswered,
  mockBookingCommitted,
  mockBookingGet,
} from './booking-mocks';

export interface InterceptorOverrides {
  availabilitySlots?: object;
  availabilityDetail?: object;
  availabilityOptionsSet?: object;
  availabilityPricingSet?: object;
  bookingCreate?: object;
  addAvailability?: object;
  bookingQuestions?: object;
  answerQuestions?: object;
  commitBooking?: object;
  bookingGet?: object;
}

/**
 * Set up API route interception for all booking flow endpoints.
 * Pass overrides to customize specific responses.
 */
export async function setupApiInterceptors(page: Page, overrides: InterceptorOverrides = {}) {
  // GET /api/availability?productId=...
  await page.route('**/api/availability?*', async (route) => {
    const url = new URL(route.request().url());
    // Only intercept if it has productId param (list endpoint)
    if (url.searchParams.has('productId')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overrides.availabilitySlots ?? mockAvailabilitySlots),
      });
    } else {
      await route.continue();
    }
  });

  // GET /api/availability/:id (detail)
  await page.route(/\/api\/availability\/[^/]+$/, async (route) => {
    if (route.request().method() === 'GET') {
      const url = new URL(route.request().url());
      const includePricing = url.searchParams.get('includePricing') === 'true';
      const response = includePricing
        ? (overrides.availabilityPricingSet ?? mockAvailabilityPricing)
        : (overrides.availabilityDetail ?? mockAvailabilityDetail);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    } else if (route.request().method() === 'POST') {
      // POST /api/availability/:id (set options or pricing)
      const body = route.request().postDataJSON();
      const response = body?.pricingCategoryList
        ? (overrides.availabilityPricingSet ?? mockAvailabilityPricing)
        : (overrides.availabilityOptionsSet ?? mockAvailabilityOptionsComplete);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    } else {
      await route.continue();
    }
  });

  // POST /api/booking (create)
  await page.route('**/api/booking', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(overrides.bookingCreate ?? mockBookingCreate),
      });
    } else if (route.request().method() === 'GET') {
      // GET /api/booking?id=xxx
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overrides.bookingGet ?? mockBookingGet),
      });
    } else {
      await route.continue();
    }
  });

  // POST /api/booking/:id/availability
  await page.route(/\/api\/booking\/[^/]+\/availability$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(overrides.addAvailability ?? mockAddAvailability),
    });
  });

  // GET/POST /api/booking/:id/questions
  await page.route(/\/api\/booking\/[^/]+\/questions$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overrides.bookingQuestions ?? mockBookingQuestions),
      });
    } else if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overrides.answerQuestions ?? mockBookingAnswered),
      });
    } else {
      await route.continue();
    }
  });

  // POST /api/booking/commit
  await page.route('**/api/booking/commit', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(overrides.commitBooking ?? mockBookingCommitted),
    });
  });

  return { bookingId: MOCK_BOOKING_ID };
}

/**
 * Helper to set up sequential responses for a specific route.
 * Useful for testing the iterative question loop.
 */
export async function setupSequentialResponses(
  page: Page,
  urlPattern: RegExp,
  method: string,
  responses: object[]
) {
  let callIndex = 0;
  await page.route(urlPattern, async (route) => {
    if (route.request().method() === method) {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    } else {
      await route.continue();
    }
  });
}
