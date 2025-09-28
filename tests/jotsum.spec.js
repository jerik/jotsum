// @ts-check
const { test, expect } = require('@playwright/test');

// @todo setup web server with correct ssl, perhaps via docker?
// disable HTTPS errors
// https://stackoverflow.com/a/75547151/1933185


// https://playwright.dev/docs/writing-tests
// test jotsum
test.beforeEach(async ({ page }) => {
  await page.goto('/jotsum.html');
});

test('initial start of page with line and sum', async ({ page }) => {
  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/jotsum/);

  const jol = await page.locator('//jo-line').count(); 
  const jos = await page.locator('//jo-sum').count(); 
  await expect(jol).toBe(1); 
  await expect(jos).toBe(1); 

  // first jo-line setup: add_calc_line('3 apples + 4 pears');
  // @todo does not work
  // await expect(jos).toHaveText('7');
  
});

// https://playwright.dev/docs/running-tests
test('button creates new empty input field', async ({ page }) => {
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

test('add a new calculation', async ({page}) => {
  await expect(page).toHaveTitle(/jotsum/);
  await page.locator('button:text("Add line")').click();

  await expect(page.locator('jo-line')).toHaveCount(2);
  await expect(page.locator('//jo-line')).toHaveCount(2);

  const secondLine = page.locator('//jo-line [2]');
  await secondLine.click(); 
  await secondLine.fill('2 eyes + 1 nose');

  const secondSum = secondLine.locator('xpath=following-sibling::jo-sum[1]');
  await expect(secondSum).toHaveText('3'); // 2+1 -> 3
  
}); 

