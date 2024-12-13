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
test('initial start of page', async ({ page }) => {
  await page.goto('https://localhost:8008');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/nebenrechnung/);
});

// https://playwright.dev/docs/running-tests
test('button creates new calc line', async ({ page }) => {
  await page.goto('https://localhost:8008');

  const before = await page.locator('//nr-line').count(); 
  // console.log(before); 

  // Expect a title "to contain" a substring.
  await page.locator('button:text("Add line")').click();
  // https://www.marketingscoop.com/tech/web-scraping/playwright-how-to-find-elements-by-xpath-in-playwright/
  const after = await page.locator('//nr-line').count(); 

  // https://playwright.dev/docs/test-assertions
  await expect(after).toBe(before + 1); 
});

// https://pkerschbaum.com/blog/using-playwright-to-run-unit-tests .  trifft es nicht ganz


// simple unit test of function 
// https://playwright.dev/docs/evaluating
// FUNKTIONIERT auch OHNE WEBSERVER und MUSS NUR MIT EINEM BROWSER AUFGERUFEN WERDEN
// npx playwright test foo.spec.js --project chromium
test('unit test', async ({ page }) => {

	// Get current working directory
	// console.log(`Current directory: ${process.cwd()}`);

	await page.addScriptTag({path: 'sum.js'});
	const data = await page.evaluate(() => window.sum(1,7));
	// await seems not to be needed, but I use it anyway
	await expect(data).toBe(15); // 1+2*7=15
	// console.log(data); 
	
});

