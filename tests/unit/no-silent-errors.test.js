const assert = require('assert');
const { JoLine, JoSheet, classify_line, evaluate_sheet, sheet_total } = require('../../jotsum.js');

// Numbers must never drop out of a sum without a visible hint. Every example
// below is taken from task T-107.

function check_line(expression, expected, context = null) {
    const report = {};
    const result = new JoLine().calculate(expression, context, report);
    assert.strictEqual(result, expected, `Test failed for expression: ${JSON.stringify(expression)}. Expected ${expected}, but got ${result}`);
    assert.strictEqual(report.error, undefined, `Expected no error for ${JSON.stringify(expression)}, but got ${JSON.stringify(report.error)}`);
}

function testColon() {
    // A ':' before a digit never starts a variable.
    check_line('Price:100', 100);
    check_line('Price:100', 100, { vars: new Map() });
    {
        const result = evaluate_sheet(['Price:100']);
        assert.deepStrictEqual(result.errors, [null]);
        assert.strictEqual(result.total, 100);
    }

    // A digit on both sides is a time, which is text: no number, no error.
    check_line('Time 10:30', 0);
    {
        const lines = ['Time 10:30'];
        const result = evaluate_sheet(lines);
        assert.deepStrictEqual(result.errors, [null]);
        assert.strictEqual(result.total, 0);
        assert.strictEqual(sheet_total(lines), null, 'a time alone contributes no number');
    }

    console.log('All colon tests passed!');
}

function testNameRule() {
    // No dash in a name: ":SUBTOTAL_1-50" stays a subtraction.
    check_line(':SUBTOTAL_1-50', 250, { vars: new Map([['SUBTOTAL_1', 300]]) });
    {
        const result = evaluate_sheet(['A 300', '---', ':SUBTOTAL_1-50']);
        assert.strictEqual(result.errors[2], null);
        assert.strictEqual(result.sums[2], 250);
    }
    assert.deepStrictEqual(classify_line(':a-b = 5'), { type: 'value' });

    // No digit at the start of a name.
    assert.deepStrictEqual(classify_line(':1Test = 5'), { type: 'value' });
    {
        const result = evaluate_sheet([':x1 = 5', 'Use :x1 * 2']);
        assert.deepStrictEqual(result.errors, [null, null]);
        assert.strictEqual(result.sums[1], 10);
    }
    {
        // ":1" is no reference to a variable "1"; it is the number 1.
        const result = evaluate_sheet(['Item :1']);
        assert.deepStrictEqual(result.errors, [null]);
        assert.strictEqual(result.total, 1);
    }

    console.log('All variable name tests passed!');
}

function testIncompleteExpressions() {
    const broken = ['-', 'Lunch 12 + .'];
    broken.forEach(expression => {
        const report = {};
        new JoLine().calculate(expression, null, report);
        assert(report.error, `Expected an error for ${JSON.stringify(expression)}`);
        assert.strictEqual(report.error.code, 'missing-value');
    });
    {
        const result = evaluate_sheet(['A 10', '-', 'Lunch 12 + .']);
        assert.strictEqual(result.errors[0], null);
        assert(result.errors[1], 'Expected an error for "-"');
        assert(result.errors[2], 'Expected an error for "Lunch 12 + ."');
        assert.strictEqual(result.total, 10, 'broken lines do not count');
    }

    // A broken definition is an error and leaves no value behind.
    {
        const result = evaluate_sheet([':rate = -', '12 * :rate']);
        assert(result.errors[0], 'Expected an error for ":rate = -"');
        assert.strictEqual(result.vars.has('rate'), false);
        assert(result.errors[1], 'Expected the use of :rate to be an error');
        assert.strictEqual(result.total, 0);
    }

    // ... even if the variable had a valid value before.
    {
        const result = evaluate_sheet([':rate = 85', 'Before 2 * :rate', ':rate = -', '12 * :rate']);
        assert.deepStrictEqual(result.errors.slice(0, 2), [null, null]);
        assert(result.errors[2], 'Expected an error for ":rate = -"');
        assert.strictEqual(result.vars.has('rate'), false);
        assert(result.errors[3], 'Expected the use of :rate to be an error after the broken definition');
        assert.strictEqual(result.total, 170);
    }
    {
        // Lines from the cross-review of PR #35: the sidebar lost the valid 85
        // because the deleted :rate was looked up after the whole sheet ran.
        const lines = [':rate = 85', ':rate', ':rate = -'];
        const result = evaluate_sheet(lines);
        assert.strictEqual(result.errors[1], null);
        assert(result.errors[2], 'Expected ":rate = -" to be an error');
        assert.strictEqual(result.total, 85);
        assert.strictEqual(sheet_total(lines), '85');
    }

    // Text without numbers stays clean and 0.
    check_line('make-love-not-war', 0);
    {
        const result = evaluate_sheet(['make-love-not-war']);
        assert.deepStrictEqual(result.errors, [null]);
        assert.strictEqual(result.total, 0);
    }

    console.log('All incomplete expression tests passed!');
}

// Minimal stand-in for the elements update_total touches, so the real
// method writes the total shown under the sheet.
function fake_element(text = '') {
    const classes = new Set();
    return {
        textContent: text,
        attributes: {},
        classList: {
            contains: name => classes.has(name),
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name))
        },
        getAttribute(name) { return this.attributes[name] ?? null; },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; }
    };
}

function shown_under_sheet(texts) {
    const original_document = global.document;
    const total = fake_element();
    const lines = texts.map(text => {
        const line = fake_element(text);
        line.nextElementSibling = Object.assign(fake_element(), { tagName: 'JO-SUM' });
        return line;
    });
    const sheet = new JoSheet();
    sheet.querySelectorAll = () => lines;
    global.document = { ...original_document, getElementById: () => total };
    try {
        sheet.update_total();
    } finally {
        global.document = original_document;
        window.localStorage.reset();
    }
    return { total: String(total.textContent), sums: lines.map(line => String(line.nextElementSibling.textContent)) };
}

function testZeroDisplay() {
    const lines = ['0.3', '-0.1', '-0.2'];

    // Under the sheet.
    const shown = shown_under_sheet(lines);
    assert.strictEqual(shown.total, '0');
    assert.deepStrictEqual(shown.sums, ['0.30', '-0.10', '-0.20']);

    // In the sidebar.
    assert.strictEqual(sheet_total(lines), '0');

    // Both rounding paths directly.
    const total = evaluate_sheet(lines).total;
    assert.notStrictEqual(total, 0, 'the float sum is not exactly 0, which is the point');
    assert.strictEqual(String(JoSheet.prototype.round(total)), '0');
    assert.strictEqual(String(JoLine.prototype.round(total)), '0');
    assert.strictEqual(String(JoSheet.prototype.round(-0.004)), '0');
    assert.strictEqual(String(JoSheet.prototype.round(-0)), '0');
    assert.strictEqual(JoSheet.prototype.round(-0.005 - 1e-9), '-0.01', 'a real cent stays visible');

    console.log('All zero display tests passed!');
}

function testSigns() {
    check_line('--5', 5);
    check_line('- -5', 5);
    check_line('10 --5', 15);
    check_line('10 - - -5', 5);
    {
        const result = evaluate_sheet(['--5', '- -5', '10 --5', '10 - - -5']);
        assert.deepStrictEqual(result.errors, [null, null, null, null]);
        assert.deepStrictEqual(result.sums, [5, 5, 15, 5]);
    }

    console.log('All sign tests passed!');
}

function testSeparators() {
    assert.deepStrictEqual(classify_line('--- Miete'), { type: 'separator' });
    assert.deepStrictEqual(classify_line('--- 5'), { type: 'separator' });
    assert.deepStrictEqual(classify_line('---'), { type: 'separator' });
    assert.deepStrictEqual(classify_line('---5'), { type: 'value' });

    {
        const lines = ['A 100', '--- Miete', 'B 20', '--- 5'];
        const result = evaluate_sheet(lines);
        assert.deepStrictEqual(result.types, ['value', 'separator', 'value', 'separator']);
        assert.deepStrictEqual(result.errors, [null, null, null, null]);
        assert.deepStrictEqual(result.sums, [100, 100, 20, 20], 'a separator shows the subtotal, not its label');
        assert.strictEqual(result.total, 120, 'the 5 in "--- 5" counts nowhere');
        assert.strictEqual(result.vars.get('SUBTOTAL_2'), 20);
        assert.strictEqual(sheet_total(lines), '120');
    }
    {
        // "--- 5" alone contributes no number at all.
        assert.strictEqual(sheet_total(['--- 5']), null);
    }

    console.log('All separator tests passed!');
}

function testOwnerDecisions() {
    // Decided by the owner on the cross-review of PR #35 - the existing
    // behaviour is correct. A time is text, but a minus before it or between
    // two times stays an operator. A dot between spaces, at the start or
    // right after a letter (end of sentence) is not counted; a dot with a
    // digit before, after or both belongs to the number.
    check_line('-10:30 kosten 50', -50);
    check_line('fahrt 8:00 - 9:30 kosten 50', -50);
    check_line('12 + . + 3', 15);
    check_line('. + 3', 3);
    check_line('12 + 3 das ist aber toll.', 15);
    check_line('das ist 3 + .5', 3.5);
    check_line('hier sind 6. * .5', 3);
    {
        const expression = 'nochmal 15.4 + .3 - 7.';
        const report = {};
        const result = new JoLine().calculate(expression, null, report);
        assert.strictEqual(report.error, undefined, `Expected no error for ${JSON.stringify(expression)}`);
        assert.strictEqual(Math.round(result * 100) / 100, 8.7, `Test failed for expression: ${JSON.stringify(expression)}. Expected 8.7, but got ${result}`);
    }

    console.log('All owner decision tests passed!');
}

testColon();
testNameRule();
testIncompleteExpressions();
testZeroDisplay();
testSigns();
testSeparators();
testOwnerDecisions();
