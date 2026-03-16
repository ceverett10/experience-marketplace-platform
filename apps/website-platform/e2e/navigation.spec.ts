import { test, expect } from '@playwright/test';

test.describe('Navigation and Routing', () => {
  test('all main navigation links return non-500 responses', async ({ page }) => {
    await page.goto('/');

    // Collect all navigation links from the header
    const header = page.locator('header');
    const links = header.locator('a[href^="/"]');
    const hrefs = new Set<string>();

    const count = await links.count();
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href');
      if (href && !href.includes('#')) {
        hrefs.add(href);
      }
    }

    // Visit each unique link and verify it doesn't crash
    for (const href of hrefs) {
      const response = await page.goto(href);
      const status = response?.status() ?? 0;
      expect(status, `${href} returned ${status}`).toBeLessThan(500);
    }
  });

  test('404 page renders for nonexistent routes', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-at-all');
    const status = response?.status() ?? 0;

    // Should return 404, not 500
    expect(status).toBe(404);

    // Page should still render (not a blank error)
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('footer links are present and valid', async ({ page }) => {
    await page.goto('/');

    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Footer should have links
    const footerLinks = footer.locator('a');
    expect(await footerLinks.count()).toBeGreaterThan(0);
  });

  test('page navigation preserves layout (no flash of unstyled content)', async ({ page }) => {
    await page.goto('/');

    // Verify header is visible on initial load
    await expect(page.locator('header')).toBeVisible();

    // Navigate to another page
    const experiencesLink = page.locator('a[href="/experiences"], a[href*="/experiences"]').first();
    if (await experiencesLink.isVisible()) {
      await experiencesLink.click();
      await page.waitForLoadState('domcontentloaded');

      // Header should still be visible after navigation (layout preserved)
      await expect(page.locator('header')).toBeVisible();
      await expect(page.locator('footer')).toBeVisible();
    }
  });
});
