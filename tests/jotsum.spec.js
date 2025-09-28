// @ts-check
const { test, expect } = require('@playwright/test');

// @todo setup web server with correct ssl, perhaps via docker?
// disable HTTPS errors
// https://stackoverflow.com/a/75547151/1933185
test.use({
  ignoreHTTPSErrors: true,
});

// https://playwright.dev/docs/writing-tests
// test jotsum
test('initial start of page with line and sum', async ({ page }) => {
  await page.goto('https://localhost:8008');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/jotsum/);

  const jol = await page.locator('//jo-line').count(); 
  const jos = await page.locator('//jo-sum').count(); 
  await expect(jol).toBe(1); 
  await expect(jos).toBe(1); 
});

// https://playwright.dev/docs/running-tests
test('button creates new calc entry', async ({ page }) => {
  await page.goto('https://localhost:8008');

  const jol_before = await page.locator('//jo-line').count(); 
  const jos_before = await page.locator('//jo-sum').count(); 
  // console.log(before); 

  // Expect a title "to contain" a substring.
  await page.locator('button:text("Add line")').click();
  // https://www.marketingscoop.com/tech/web-scraping/playwright-how-to-find-elements-by-xpath-in-playwright/
  const jol_after = await page.locator('//jo-line').count(); 
  const jos_after = await page.locator('//jo-sum').count(); 

  // https://playwright.dev/docs/test-assertions
  await expect(jol_after).toBe(jol_before + 1); 
  await expect(jos_after).toBe(jos_before + 1); 
});

