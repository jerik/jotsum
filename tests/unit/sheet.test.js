const assert = require('assert');
const { classify_line, evaluate_sheet } = require('../../jotsum.js');




function testClassifyLine() {
    const tests = [
        { text: '---', expected: { type: 'separator' } },
        { text: '-----', expected: { type: 'separator' } },
        { text: ':auto = 120 EUR', expected: { type: 'definition', name: 'auto', expr: '120 EUR' } },
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
        assert.strictEqual(result.vars.get('SUBTOTAL-1'), 300);
        assert.strictEqual(result.vars.get('SUBTOTAL-2'), 50);
    }

    // 4) :SUBTOTAL-1 kann wie jede andere Variable in einer spaeteren Zeile
    // benutzt werden.
    {
        const result = evaluate_sheet(['A 100', '---', 'VAT :SUBTOTAL-1 * 0.19']);
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
        assert.strictEqual(result.vars.get('SUBTOTAL-1'), 100);
        assert.strictEqual(result.vars.get('SUBTOTAL-2'), 70);
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

    console.log('All evaluate_sheet tests passed!');
}

function testEvaluateSheetErrors() {
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

testClassifyLine();
testEvaluateSheet();
testEvaluateSheetErrors();
