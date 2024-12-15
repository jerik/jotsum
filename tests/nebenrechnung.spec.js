// @ts-check
const { test, expect } = require('@playwright/test');

// @todo setup web server with correct ssl, perhaps via docker?
// disable HTTPS errors
// https://stackoverflow.com/a/75547151/1933185
test.use({
  ignoreHTTPSErrors: true,
});

// https://playwright.dev/docs/writing-tests
// test nebenrechnung
test('initial start of page with line and sum', async ({ page }) => {
  await page.goto('https://localhost:8008');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/nebenrechnung/);

  const nrl = await page.locator('//nr-line').count(); 
  const nrs = await page.locator('//nr-sum').count(); 
  await expect(nrl).toBe(1); 
  await expect(nrs).toBe(1); 
});

// https://playwright.dev/docs/running-tests
test('button creates new calc entry', async ({ page }) => {
  await page.goto('https://localhost:8008');

  const nrl_before = await page.locator('//nr-line').count(); 
  const nrs_before = await page.locator('//nr-sum').count(); 
  // console.log(before); 

  // Expect a title "to contain" a substring.
  await page.locator('button:text("Add line")').click();
  // https://www.marketingscoop.com/tech/web-scraping/playwright-how-to-find-elements-by-xpath-in-playwright/
  const nrl_after = await page.locator('//nr-line').count(); 
  const nrs_after = await page.locator('//nr-sum').count(); 

  // https://playwright.dev/docs/test-assertions
  await expect(nrl_after).toBe(nrl_before + 1); 
  await expect(nrs_after).toBe(nrs_before + 1); 
});

