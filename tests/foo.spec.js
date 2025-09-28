// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('simple suite test', () => {
	test('unit test sum.js function', async ({ page }) => {

		await page.addScriptTag({path: 'sum.js'});
		const data = await page.evaluate(() => window.sum(1,7));
		await expect(data).toBe(15); // 1+2*7=15
		
	});

	/* not working
	test('unit test sum.js object.function', async ({ page }) => {

		await page.addScriptTag({path: 'sum.js'});
		let foo = await page.content();
		console.log(foo);
		const data = await page.evaluate(() => window.sum(1,7));
		await expect(data).toBe(15); // 1+2*7=15
		
	});
	*/

});

 
