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

test('negative amount keeps its sign in the sum and total', async ({ page }) => {
  const text = 'Tanken -45.50 EUR';
  await page.goto('/jotsum.html?text=' + encodeURIComponent(text));

  const line = page.locator('jo-line').first();
  const sum = line.locator('xpath=following-sibling::jo-sum[1]');
  await expect(sum).toHaveText('-45.50');
  await expect(page.locator('#total')).toHaveText('-45.50');
});

test('apostrophe escapes a number so it is not counted', async ({ page }) => {
  const text = "Rechnung '2024 Material 500";
  await page.goto('/jotsum.html?text=' + encodeURIComponent(text));

  const line = page.locator('jo-line').first();
  const sum = line.locator('xpath=following-sibling::jo-sum[1]');
  await expect(sum).toHaveText('500');
});

test('a variable defined on one line is usable on a later line', async ({ page }) => {
  const text = ':rate = 85\nConsulting 12 * :rate';
  await page.goto('/jotsum.html?text=' + encodeURIComponent(text));

  const lines = page.locator('jo-line');
  await expect(lines).toHaveCount(2);

  const defLine = lines.nth(0);
  const defSum = defLine.locator('xpath=following-sibling::jo-sum[1]');
  await expect(defLine).toHaveClass(/is-definition/);
  await expect(defSum).toHaveClass(/is-muted/);

  const secondLine = lines.nth(1);
  const secondSum = secondLine.locator('xpath=following-sibling::jo-sum[1]');
  await expect(secondSum).toHaveText('1020');
  await expect(page.locator('#total')).toHaveText('1020');
});

test('a separator line shows a subtotal that is not double counted', async ({ page }) => {
  const text = 'A 100\nB 200\n---\nC 50';
  await page.goto('/jotsum.html?text=' + encodeURIComponent(text));

  const lines = page.locator('jo-line');
  await expect(lines).toHaveCount(4);

  const sepLine = lines.nth(2);
  await expect(sepLine).toHaveClass(/is-separator/);
  const sepSum = sepLine.locator('xpath=following-sibling::jo-sum[1]');
  await expect(sepSum).toHaveText('300');

  await expect(page.locator('#total')).toHaveText('350'); // not 650
});

test('the SUBTOTAL variable references the preceding subtotal block', async ({ page }) => {
  const text = 'A 100\n---\nVAT :SUBTOTAL_1 * 0.19';
  await page.goto('/jotsum.html?text=' + encodeURIComponent(text));

  const lines = page.locator('jo-line');
  await expect(lines).toHaveCount(3);

  const lastLine = lines.nth(2);
  const lastSum = lastLine.locator('xpath=following-sibling::jo-sum[1]');
  await expect(lastSum).toHaveText('19');

  await expect(page.locator('#total')).toHaveText('119');
});

test('editing an earlier line live-recalculates a later line through a variable', async ({ page }) => {
  const text = ':rate = 10\nx 2 * :rate';
  await page.goto('/jotsum.html?text=' + encodeURIComponent(text));

  const lines = page.locator('jo-line');
  await expect(lines).toHaveCount(2);

  const firstLine = lines.nth(0);
  const secondSum = lines.nth(1).locator('xpath=following-sibling::jo-sum[1]');
  await expect(secondSum).toHaveText('20');

  await firstLine.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type(':rate = 20');

  await expect(secondSum).toHaveText('40');
});

test('a structurally broken line is marked as an error and excluded from the total', async ({ page }) => {
  const text = 'A 100\n(2+3) (4+5)\nB 50';
  await page.goto('/jotsum.html?text=' + encodeURIComponent(text));

  const lines = page.locator('jo-line');
  await expect(lines).toHaveCount(3);

  const brokenLine = lines.nth(1);
  const brokenSum = brokenLine.locator('xpath=following-sibling::jo-sum[1]');

  await expect(brokenLine).toHaveClass(/is-error/);
  await expect(brokenSum).toHaveClass(/is-error/);
  await expect(brokenSum).toHaveText('?');

  await expect(page.locator('#total')).toHaveText('150'); // not 155, the broken line is excluded
});

test('the example on an empty sheet is a hint, not text you have to delete', async ({ page }) => {
  const firstLine = page.locator('jo-line').first();
  const firstSum = page.locator('jo-sum').first();

  // The hint is shown, but the line itself is empty - nothing to delete.
  await expect(firstLine).toHaveClass(/is-placeholder/);
  await expect(firstLine).toHaveAttribute('data-placeholder', '3 apples + 4 pears');
  await expect(firstLine).toHaveText('');
  await expect(firstSum).toHaveText('7');
  await expect(firstSum).toHaveClass(/is-placeholder/);

  // The hint stays while the line merely has focus - you are meant to read it.
  await firstLine.click();
  await expect(firstLine).toHaveClass(/is-placeholder/);

  // It goes away as soon as you type, and the line is clean underneath.
  await page.keyboard.type('Tanken -45.50 EUR');
  await expect(firstLine).not.toHaveClass(/is-placeholder/);

  await expect(firstLine).toHaveText('Tanken -45.50 EUR');
  await expect(firstSum).toHaveText('-45.50');
  await expect(page.locator('#total')).toHaveText('-45.50');
});

test('the hint does not come back after typing and clearing the line', async ({ page }) => {
  const firstLine = page.locator('jo-line').first();

  // Typing straight away, without clicking first - the line already has focus.
  await page.keyboard.type('abc 12');
  await expect(firstLine).not.toHaveClass(/is-placeholder/);

  // Clearing it again must leave an empty line, not the hint.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Backspace');
  }
  await expect(firstLine).toHaveText('');
  await expect(firstLine).not.toHaveClass(/is-placeholder/);
  await expect(firstLine).not.toHaveAttribute('data-placeholder', /.*/);
  await expect(page.locator('jo-sum').first()).toHaveText('0');

  // And the line stays a single row - a leftover <br> must not stack the hint.
  const box = await firstLine.boundingBox();
  expect(box.height).toBeLessThan(45);
});

test('several spaces in a row still calculate', async ({ page }) => {
  // contenteditable stores every second space as a non-breaking space, which
  // used to be swallowed into the number and made the line collapse to 0.
  const line = page.locator('jo-line').first();
  await line.click();
  await page.keyboard.type('18 +    23');

  const raw = await line.evaluate(el => el.textContent);
  expect(raw).toContain('\u00A0'); // the browser really did insert one

  await expect(page.locator('jo-sum').first()).toHaveText('41');
  await expect(page.locator('#total')).toHaveText('41');
});

test('two numbers without an operator between them are an error', async ({ page }) => {
  const text = '18 + 12 mirakel 20 + 10\n18 + 12 mirakel + 20 + 10';
  await page.goto('/jotsum.html?text=' + encodeURIComponent(text));

  const lines = page.locator('jo-line');
  const sums = page.locator('jo-sum');

  // Glued together by a word: ambiguous, so it is reported instead of summing to 60.
  await expect(lines.nth(0)).toHaveClass(/is-error/);
  await expect(sums.nth(0)).toHaveText('?');

  // The same line with an operator in place calculates normally.
  await expect(sums.nth(1)).toHaveText('60');
  await expect(page.locator('#total')).toHaveText('60');
});

test('the error explanation sits on the ? as well as on the line', async ({ page }) => {
  // The "?" is what you point at, so the tooltip has to be there too.
  await page.goto('/jotsum.html?text=' + encodeURIComponent('Split 10 / 0\nB 50'));
  await page.locator('jo-line').first().blur();

  const line = page.locator('jo-line').first();
  const sum = page.locator('jo-sum').first();

  await expect(sum).toHaveText('?');
  await expect(sum).toHaveAttribute('title', 'Division by zero');
  await expect(line).toHaveAttribute('title', 'Division by zero');

  // A healthy line carries no leftover tooltip.
  await expect(page.locator('jo-sum').nth(1)).not.toHaveAttribute('title', /.*/);
});

test('the hint survives a focus that arrives after the page was built', async ({ page }) => {
  // Opening the link in a background tab delivers the focus event only when
  // the tab is activated, which is after the hint was set up. Hanging the
  // hint on focus used to wipe it out in exactly that case, leaving an empty
  // sheet with no clue how to use it.
  const firstLine = page.locator('jo-line').first();

  await firstLine.blur();
  await firstLine.focus();

  await expect(firstLine).toHaveClass(/is-placeholder/);
  await expect(firstLine).toHaveAttribute('data-placeholder', '3 apples + 4 pears');
  await expect(page.locator('jo-sum').first()).toHaveText('7');
});
