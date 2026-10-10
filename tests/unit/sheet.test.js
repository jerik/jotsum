const assert = require('assert');
const { classify_line, evaluate_sheet, JoSheet, JoLine } = require('../../jotsum.js');




function testClassifyLine() {
    const tests = [
        { text: '# Rechnung 2024', expected: { type: 'heading' } },
        { text: '## Costs 2024', expected: { type: 'heading' } },
        { text: '######', expected: { type: 'heading' } },
        { text: '#2024', expected: { type: 'value' } },
        { text: '####### Costs 2024', expected: { type: 'value' } },
        { text: 'Item # 2024', expected: { type: 'value' } },
        { text: '---', expected: { type: 'separator' } },
        { text: '-----', expected: { type: 'separator' } },
        { text: ':auto = 120 EUR', expected: { type: 'definition', name: 'auto', expr: '120 EUR' } },
        { text: ':a-b = 5', expected: { type: 'value' } },
        { text: ':1Test = 5', expected: { type: 'value' } },
        { text: '3 apples + 4', expected: { type: 'value' } },
        { text: 'a - b', expected: { type: 'value' } },
    ];

    tests.forEach(test => {
        const result = classify_line(test.text);
        assert.deepStrictEqual(result, test.expected, `Test failed for classify_line("${test.text}"). Expected ${JSON.stringify(test.expected)}, but got ${JSON.stringify(result)}`);
    });

    console.log('All classify_line tests passed!');
}

function testEvaluateSheet() {
    // 1) Definition + Nutzung: die Definition selbst zaehlt nicht zur Summe.
    {
        const result = evaluate_sheet([':rate = 85', 'Consulting 12 * :rate']);
        assert.deepStrictEqual(result.sums, [85, 1020]);
        assert.strictEqual(result.total, 1020);
    }

    // 2) Nutzung VOR der Definition: die Variable ist noch nicht bekannt,
    // das darf kein NaN in die Summe/Anzeige durchreichen.
    {
        const result = evaluate_sheet(['x 2 * :rate', ':rate = 85']);
        assert.strictEqual(result.sums[0], 0);
        assert.strictEqual(result.total, 0);
    }

    // 3) Zwei Bloecke mit Trennern: jeder Trenner traegt die Zwischensumme
    // des vorangegangenen Blocks und setzt den Block danach zurueck.
    {
        const result = evaluate_sheet(['A 100', 'B 200', '---', 'C 50', '---']);
        assert.deepStrictEqual(result.sums, [100, 200, 300, 50, 50]);
        assert.strictEqual(result.total, 350);
        assert.strictEqual(result.vars.get('SUBTOTAL_1'), 300);
        assert.strictEqual(result.vars.get('SUBTOTAL_2'), 50);
    }

    // 4) :SUBTOTAL_1 kann wie jede andere Variable in einer spaeteren Zeile
    // benutzt werden.
    {
        const result = evaluate_sheet(['A 100', '---', 'VAT :SUBTOTAL_1 * 0.19']);
        assert.strictEqual(result.sums[2], 19);
        assert.strictEqual(result.total, 119);
    }

    // 5) Gemischt: Definitionen UND Trenner zusammen - nichts darf doppelt
    // gezaehlt werden (weder die Definitionswerte noch die Zwischensummen).
    {
        const result = evaluate_sheet([
            ':fee = 5',
            'A 100',
            '---',
            'B 50',
            ':note = 999',
            'C 20',
            '---',
        ]);
        assert.strictEqual(result.total, 170);
        assert.strictEqual(result.vars.get('fee'), 5);
        assert.strictEqual(result.vars.get('note'), 999);
        assert.strictEqual(result.vars.get('SUBTOTAL_1'), 100);
        assert.strictEqual(result.vars.get('SUBTOTAL_2'), 70);
    }

    // 6) Eine Variable kann in der Definition einer anderen Variable benutzt
    // werden.
    {
        const result = evaluate_sheet([':a = 10', ':b = :a * 3', 'x :b']);
        assert.strictEqual(result.sums[2], 30);
        assert.strictEqual(result.total, 30);
    }

    // 7) Leere Zeilen und reiner Text ergeben 0 und kippen die Summe nicht.
    {
        const result = evaluate_sheet(['', '   ', 'just words here']);
        assert.deepStrictEqual(result.sums, [0, 0, 0]);
        assert.strictEqual(result.total, 0);
    }

    // Headings never enter totals or subtotals, parse expressions, or reset blocks.
    {
        const headingOnly = evaluate_sheet(['# Rechnung 2024']);
        assert.deepStrictEqual(headingOnly.sums, [0]);
        assert.strictEqual(headingOnly.total, 0);

        const result = evaluate_sheet([
            'A 100', '  # Rechnung 2024  ', '## (2+3) (4+5) :unknown', 'B 50', '---',
            'VAT :SUBTOTAL_1 * 0.2', '###### Year 2025', '---',
        ]);
        assert.deepStrictEqual(result.types, [
            'value', 'heading', 'heading', 'value', 'separator', 'value', 'heading', 'separator',
        ]);
        assert.deepStrictEqual(result.sums, [100, 0, 0, 50, 150, 30, 0, 30]);
        assert.deepStrictEqual(result.errors, Array(8).fill(null));
        assert.strictEqual(result.total, 180);
        assert.strictEqual(result.vars.get('SUBTOTAL_1'), 150);
        assert.strictEqual(result.vars.get('SUBTOTAL_2'), 30);
    }

    console.log('All evaluate_sheet tests passed!');
}

function testEvaluateSheetErrors() {
    // Variable names are case-sensitive: defining :Auto does not define :auto.
    {
        const result = evaluate_sheet([':Auto = 5', ':auto']);
        assert.strictEqual(result.errors[0], null);
        assert.strictEqual(result.vars.get('Auto'), 5);
        assert.strictEqual(result.vars.has('auto'), false);
        assert(result.errors[1], 'Expected an error for the reference to :auto');
        assert.strictEqual(result.errors[1].code, 'unknown-variable');
        assert.strictEqual(result.errors[1].message, 'Unknown variable :auto');
    }

    // A structurally broken line is marked in `errors` and does not count
    // towards the total - even though sums[i] still holds the (unchanged)
    // computed value.
    {
        const result = evaluate_sheet(['A 100', '(2+3) (4+5)', 'B 50']);
        assert.strictEqual(result.errors[0], null);
        assert(result.errors[1], 'Expected an error for "(2+3) (4+5)"');
        assert.strictEqual(result.errors[1].code, 'missing-operator');
        assert.strictEqual(result.sums[1], 5);
        assert.strictEqual(result.errors[2], null);
        assert.strictEqual(result.total, 150);
    }

    // A broken definition must not set the variable - a broken definition
    // must not spread its value to lines that reference it.
    {
        const result = evaluate_sheet([':rate = (2+3) (4+5)', 'x :rate']);
        assert(result.errors[0], 'Expected the definition to be reported as broken');
        assert.strictEqual(result.errors[0].code, 'missing-operator');
        assert.strictEqual(result.vars.has('rate'), false);
        assert(result.errors[1], 'Expected the reference to :rate to be reported as broken');
        assert.strictEqual(result.errors[1].code, 'unknown-variable');
    }

    // A broken line inside a block must not skew the subtotal that was
    // already carried by an earlier separator.
    {
        const result = evaluate_sheet(['A 100', '---', 'B (2+3) (4+5)']);
        assert.strictEqual(result.sums[1], 100);
        assert.strictEqual(result.errors[1], null);
        assert(result.errors[2], 'Expected an error for "B (2+3) (4+5)"');
        assert.strictEqual(result.total, 100);
    }

    console.log('All evaluate_sheet error tests passed!');
}

// Rounding is display only: the total is summed at full precision, so the
// rounded line results on screen need not add up to the rounded total.
function testRoundingIsDisplayOnly() {
    const round = JoSheet.prototype.round;

    assert.strictEqual(round(2.348), '2.35');
    assert.strictEqual(round(2.341), '2.34');
    assert.strictEqual(round(0.999), '1.00');
    assert.strictEqual(round(10), 10, 'whole numbers keep no decimals');
    assert.strictEqual(round(10.5), '10.50');

    const result = evaluate_sheet(['a 1 / 3', 'b 1 / 3', 'c 1 / 3']);
    result.sums.forEach(value => assert.strictEqual(round(value), '0.33'));
    assert.strictEqual(round(result.total), 1, 'total is summed before rounding');

    console.log('All rounding tests passed!');
}

function testInsertLine() {
    const originalCreateElement = document.createElement;
    try {
        // Exercise both shortcuts against the same ordered line/sum pairs.
        for (const currentIndex of [0, 1]) {
            for (const insertAbove of [true, false]) {
                let focused = null;
                let recalculated = null;
                const events = [];
                const sheet = {
                    children: [],
                    insertBefore(element, reference) {
                        const index = reference === null ? this.children.length : this.children.indexOf(reference);
                        assert(index >= 0, 'insertion reference must belong to the sheet');
                        this.children.splice(index, 0, element);
                        element.parentNode = this;
                    }
                };
                document.createElement = tagName => {
                    const element = tagName === 'jo-line' ? new JoLine() : new HTMLElement();
                    element.tagName = tagName.toUpperCase();
                    Object.defineProperty(element, 'nextElementSibling', {
                        get() {
                            return sheet.children[sheet.children.indexOf(this) + 1] || null;
                        }
                    });
                    element.focus = () => { focused = element; };
                    element.recalculate = () => { recalculated = element; };
                    element.dispatchEvent = event => { events.push(event); };
                    return element;
                };
                for (const content of ['First 10', 'Second 20']) {
                    const line = document.createElement('jo-line');
                    line.textContent = content;
                    sheet.insertBefore(line, null);
                    sheet.insertBefore(document.createElement('jo-sum'), null);
                }
                const originalChildren = [...sheet.children];
                const current = originalChildren[currentIndex * 2];
                let prevented = false;
                current.handle_keys({
                    which: 13,
                    ctrlKey: true,
                    shiftKey: insertAbove,
                    preventDefault() { prevented = true; }
                });

                const insertionIndex = currentIndex * 2 + (insertAbove ? 0 : 2);
                const inserted = sheet.children[insertionIndex];
                assert.strictEqual(inserted.tagName, 'JO-LINE');
                assert.strictEqual(inserted.textContent, '');
                assert.strictEqual(sheet.children[insertionIndex + 1].tagName, 'JO-SUM');
                assert.deepStrictEqual(sheet.children.filter(child => ![inserted, inserted.nextElementSibling].includes(child)), originalChildren);
                assert.strictEqual(focused, inserted);
                assert.strictEqual(recalculated, inserted);
                assert.strictEqual(prevented, true);
                assert.strictEqual(events.length, 1);
                assert.strictEqual(events[0].type, 'line-added');
                assert.strictEqual(events[0].bubbles, true);
                assert.deepStrictEqual(originalChildren.filter(child => child.tagName === 'JO-LINE').map(line => line.textContent), ['First 10', 'Second 20']);
            }
        }
    } finally {
        document.createElement = originalCreateElement;
    }
    console.log('All line insertion tests passed!');
}

testClassifyLine();
testEvaluateSheet();
testEvaluateSheetErrors();
testRoundingIsDisplayOnly();
testInsertLine();
