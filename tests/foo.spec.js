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

// simple unit test of function 
// https://playwright.dev/docs/evaluating
test.describe('test jotsum', () => {

	// insert javascript functions to test
	test.beforeEach(async ({page}) => {
		// console.log(`Current directory: ${process.cwd()}`);
		await page.addScriptTag({path: 'jotsum.js'});
	});

	test('unit test', async ({ page }) => {

		await page.setContent(` 
			<jo-sheet id="sheet">
				<jo-line contenteditable>I have 3 apples + 4 cherries </jo-line>
				<jo-sum ></jo-sum>
			</jo-sheet>
			`);
		let bar = await page.content();
		console.log(bar);
		const data = await page.evaluate(() => window.foo('woha'));
		// await seems not to be needed, but I use it anyway
		await expect(data).toBe('woha'); // 1+2*7=15
		// console.log(data); 
		
	});

}); 
