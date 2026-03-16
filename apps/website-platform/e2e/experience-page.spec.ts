import { test, expect } from '@playwright/test';

test.describe('Experience/Product Page', () => {
  test('experiences listing page loads', async ({ page }) => {
    const response = await page.goto('/experiences');
    expect(response?.status()).toBeLessThan(500);

    // Should have content (not blank)
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    // Header and footer should be present
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('experience cards are clickable and link to product pages', async ({ page }) => {
    await page.goto('/experiences');

    // Look for experience card links (to /experiences/{id})
    const experienceLinks = page.locator('a[href^="/experiences/"]');
    const count = await experienceLinks.count();

    if (count > 0) {
      // Get the first experience link href
      const href = await experienceLinks.first().getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).toMatch(/^\/experiences\/.+/);

      // Click and verify navigation
      await experienceLinks.first().click();
      await page.waitForURL('**/experiences/**');
      expect(page.url()).toContain('/experiences/');
    }
  });

  test('invalid experience ID returns error page (not 500)', async ({ page }) => {
    const response = await page.goto('/experiences/nonexistent-product-id-12345');

    // Should get 404 or a graceful error — not a 500 crash
    const status = response?.status() ?? 0;
    expect(status).not.toBe(500);
  });
});
