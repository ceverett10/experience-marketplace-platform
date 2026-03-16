import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('loads without errors and renders key sections', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(500);

    // Page should have meaningful content (not blank)
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    // Header should be visible with navigation
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Should have at least one navigation link
    const navLinks = header.locator('a');
    expect(await navLinks.count()).toBeGreaterThan(0);

    // Footer should be present
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // No uncaught JS errors that indicate a broken page
    const criticalErrors = consoleErrors.filter(
      (e) =>
        e.includes('Uncaught') ||
        e.includes('TypeError') ||
        e.includes('ReferenceError') ||
        e.includes('Cannot read properties')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('renders page title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('experiences link navigates correctly', async ({ page }) => {
    await page.goto('/');

    // Find and click a link to experiences
    const experiencesLink = page.locator('a[href="/experiences"], a[href*="/experiences"]').first();
    if (await experiencesLink.isVisible()) {
      await experiencesLink.click();
      await page.waitForURL('**/experiences**');
      expect(page.url()).toContain('/experiences');

      // Experiences page should not be an error page
      const response = await page.reload();
      expect(response?.status()).toBeLessThan(500);
    }
  });

  test('mobile viewport - header and content render correctly', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only test');

    await page.goto('/');

    // Header should be visible
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Page should have content
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });
});
