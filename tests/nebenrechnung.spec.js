// @ts-check
const { test, expect } = require('@playwright/test');

// disable HTTPS errors
test.use({
  ignoreHTTPSErrors: true,
});

// test nebenrechnung
test('initial start of page', async ({ page }) => {
  await page.goto('https://localhost:8008');
	//
  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/nebenrechnung/);
});
