// @ts-check
const { test, expect } = require('@playwright/test');

// simple unit test of function 
// https://playwright.dev/docs/evaluating
test('unit test', async ({ page }) => {

	// Get current working directory
	// console.log(`Current directory: ${process.cwd()}`);

	await page.addScriptTag({path: 'sum.js'});
	const data = await page.evaluate(() => window.sum(1,7));
	// await seems not to be needed, but I use it anyway
	await expect(data).toBe(15); // 1+2*7=15
	// console.log(data); 
	
});

