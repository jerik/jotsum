const assert = require('assert');
const { JoLine } = require('../../jotsum.js');




function testCalculate() {
    const joLine = new JoLine();
    const tests = [
        { expression: '2 + 2', expected: 4 },
        { expression: '5 - 3', expected: 2 },
        { expression: '2 * 3', expected: 6 },
        { expression: '10 / 2', expected: 5 },
        { expression: '2 + 3 * 4', expected: 14 },
        { expression: '(2 + 3) * 4', expected: 20 },
        { expression: '10 / 2 - 3', expected: 2 },
        { expression: '-10 / 2 - 3', expected: -8 },
        { expression: '1.5 + 2.5', expected: 4 },
        { expression: '10 * 0.5', expected: 5 },
        { expression: '10 / 0.5', expected: 20 },
        { expression: 'invalid expression', expected: 0 },
        { expression: '', expected: 0 },
        { expression: '10 + -5', expected: 5 },
        { expression: '-10 + -5', expected: -15 },
        { expression: '-10 + 5', expected: -5 },
        { expression: '3.1415 * 2', expected: 6.283 },
        { expression: '((2 + 3) * 4) / 2', expected: 10 },
        { expression: 'apples 5 + pears 10', expected: 15 },
        { expression: 'apples 5 * pears 10', expected: 50 },
        { expression: 'apples 5 / pears 10', expected: 0.5 },
        { expression: 'apples 5 - pears 10', expected: -5 },
        { expression: 'only text', expected: 0 },
        { expression: 'only text', expected: 0 },
        { expression: '-10 - 10 - 10', expected: -30 },
        { expression: '-10 -10 -10', expected: -30 },
        { expression: '+5 +5 +5', expected: 15 },
        { expression: '+5 + 5 + 5', expected: 15 },
        { expression: '5 +5 + 5', expected: 15 },
        { expression: '- (5 + 5) * 2', expected: -20 },
        { expression: '- (-5 + 5) * 2', expected: 0 },
        { expression: '10 * 8 höhner asdf ', expected: 80 }, // online kommt NaN raus, wegen dem letzten leerzeichen
        { expression: 'das letzte leerzeichen   ', expected: 0 }, // online kommt NaN raus
        // A stray dot between two numbers leaves them unconnected, which is
        // reported as missing-operator; the value is the first number.
        { expression: '10 . 87', expected: 10 }, 
        { expression: '10.87', expected: 10.87 }, 
        { expression: '3 apples + 4 pears ', expected: 7 }, 
        { expression: 'make-love-not-war', expected: 0 }, 
        { expression: 'hin-her 10 + 10', expected: 20 }, 
        { expression: 'hin@her 10 + 10', expected: 20 }, 
        { expression: 'vorder- und rückseite ergeben 20 + 11', expected: 31 }, 
        { expression: 'master -master 20 + 11', expected: 31 }, 
        { expression: 'no. this is 20 + 11', expected: 31 }, 
        { expression: 'no.this is 20 + 11', expected: 31 },
        { expression: 'Tanken -45.50 EUR', expected: -45.5 },
        { expression: 'Miete -200', expected: -200 },
        { expression: 'Gutschrift +200', expected: 200 },
        { expression: 'Rechnung 3 -200', expected: -197 },
        { expression: 'Stromkosten -45 - 10', expected: -55 },
        { expression: "'12 + 3", expected: 3 },
        { expression: "Rechnung '2024 500", expected: 500 },
        { expression: "'12", expected: 0 },
        { expression: "don't 5 + 5", expected: 10 },
        // The apostrophe only escapes when a digit follows it, so "70's" keeps
        // its 70. Needs an explicit operator now to join the two numbers.
        { expression: "70's + 5", expected: 75 },
        { expression: "L'Oreal 12", expected: 12 },
    ];

    tests.forEach(test => {
        const result = joLine.calculate(test.expression);
        if (test.expected === 'NaN') {
            assert(isNaN(result), `Test failed for expression: "${test.expression}". Expected NaN, but got ${result}`);
        } else {
            assert.strictEqual(result === -0 ? 0 : result, test.expected, `Test failed for expression: "${test.expression}". Expected ${test.expected}, but got ${result}`);
        }
    });

    // Whitespace that is not U+0020. contenteditable stores "18 +    23" as
    // "18 +\u00A0 \u00A0 23", and isNaN('\u00A0') is false, so an untreated
    // non-breaking space used to be collected into the number and dragged the
    // whole line down to NaN.
    const NBSP = '\u00A0';
    const whitespace_tests = [
        { expression: '18 +' + NBSP + ' ' + NBSP + ' 23', expected: 41 },
        { expression: '18 +' + NBSP + NBSP + NBSP + '23', expected: 41 },
        { expression: '18 +\t23', expected: 41 },
        { expression: '18' + NBSP + '+' + NBSP + '23', expected: 41 },
        { expression: '3' + NBSP + 'apples + 4 pears', expected: 7 },
        { expression: '18 +    23', expected: 41 },
        { expression: 'Tanken' + NBSP + '-45.50 EUR', expected: -45.5 },
    ];

    whitespace_tests.forEach(test => {
        const result = joLine.calculate(test.expression);
        assert.strictEqual(result, test.expected, `Test failed for expression: ${JSON.stringify(test.expression)}. Expected ${test.expected}, but got ${result}`);
    });

    console.log('All calculator tests passed!');
}

function testCalculateWithContext() {
    const joLine = new JoLine();

    // Resolved variable behaves like a normal number.
    const resolved = joLine.calculate('12 * :auto', { vars: new Map([['auto', 120]]) });
    assert.strictEqual(resolved, 1440, `Expected 1440, but got ${resolved}`);

    // No context at all -> ':auto' is ignored like an unknown word. The two
    // numbers are then unconnected, which is a missing-operator line.
    const no_context_report = {};
    joLine.calculate('5 :auto 10', null, no_context_report);
    assert.strictEqual(no_context_report.error && no_context_report.error.code, 'missing-operator', `Expected missing-operator, but got ${JSON.stringify(no_context_report.error)}`);

    // Context present but the name is missing -> the variable itself is the
    // error that gets reported first.
    const unknown_report = {};
    joLine.calculate('5 :unknown 3', { vars: new Map([['auto', 120]]) }, unknown_report);
    assert.strictEqual(unknown_report.error && unknown_report.error.code, 'unknown-variable', `Expected unknown-variable, but got ${JSON.stringify(unknown_report.error)}`);

    // Dash belongs to the variable name (needed for :SUBTOTAL-1 style names).
    const dashed_name = joLine.calculate(':SUBTOTAL-1 + 1', { vars: new Map([['SUBTOTAL-1', 300]]) });
    assert.strictEqual(dashed_name, 301, `Expected 301, but got ${dashed_name}`);

    // A dash after a variable name may also be a subtraction. Longest defined
    // name wins, the rest stays for the operator logic.
    const dash_cases = [
        { expression: ':SUBTOTAL-1-50', vars: [['SUBTOTAL-1', 300]], expected: 250 },
        { expression: ':SUBTOTAL-1-50 + 5', vars: [['SUBTOTAL-1', 300]], expected: 255 },
        { expression: ':a- 5', vars: [['a', 7]], expected: 2 },
        { expression: ':a -5', vars: [['a', 7]], expected: 2 },
        { expression: ':a-:b', vars: [['a', 7], ['b', 5]], expected: 2 },
        // 'b' is not a defined name, so ':a-b' reads as variable a plus a word.
        { expression: ':a-b', vars: [['a', 7]], expected: 7 },
        // Unknown name: only the first segment is swallowed, '-50' stays an operator.
        { expression: ':unknown-50', vars: [['a', 1]], expected: -50 },
    ];

    dash_cases.forEach(test => {
        const result = joLine.calculate(test.expression, { vars: new Map(test.vars) });
        assert.strictEqual(result, test.expected, `Test failed for expression: "${test.expression}". Expected ${test.expected}, but got ${result}`);
    });

    console.log('All calculator context tests passed!');
}

function testErrorReports() {
    const joLine = new JoLine();

    // Structurally broken lines must be MARKED via `report.error`, while the
    // return value of calculate() stays exactly what it was before (the ~60
    // cases above must not change).
    const broken_cases = [
        { expression: '(2+3) (4+5)', context: null, expected_value: 5, code: 'missing-operator' },
        { expression: '3 * (3+4) : ( 4 + 8 )', context: null, expected_value: 3, code: 'missing-operator' },
        { expression: '5 +', context: null, expected_value: NaN, code: 'missing-value' },
        { expression: '* 5', context: null, expected_value: NaN, code: 'missing-value' },
        { expression: '(2+3', context: null, expected_value: 0, code: 'unbalanced-parens' },
        { expression: '2+3)', context: null, expected_value: 5, code: 'unbalanced-parens' },
        { expression: '12 * :auto', context: { vars: new Map() }, expected_value: NaN, code: 'unknown-variable' },
    ];

    broken_cases.forEach(test => {
        const report = {};
        const result = joLine.calculate(test.expression, test.context, report);

        if (Number.isNaN(test.expected_value)) {
            assert(isNaN(result), `Test failed for expression: "${test.expression}". Expected NaN, but got ${result}`);
        } else {
            assert.strictEqual(result === -0 ? 0 : result, test.expected_value, `Test failed for expression: "${test.expression}". Expected ${test.expected_value}, but got ${result}`);
        }

        assert(report.error, `Expected an error to be reported for "${test.expression}", but none was set`);
        assert.strictEqual(report.error.code, test.code, `Test failed for expression: "${test.expression}". Expected error code ${test.code}, but got ${report.error && report.error.code}`);
    });

    // Without context, ':auto' is ignored just like an unknown word (same as
    // the existing unit tests above) - no error must be reported for it.
    {
        const report = {};
        const result = joLine.calculate('12 * :auto', null, report);
        assert(isNaN(result), `Expected NaN, but got ${result}`);
        assert.strictEqual(report.error, undefined, `Expected no error, but got ${JSON.stringify(report.error)}`);
    }

    // ':auto' resolved via context must still name the unresolved variable.
    {
        const report = {};
        joLine.calculate('12 * :auto', { vars: new Map() }, report);
        assert(report.error.message.includes(':auto'), `Expected the message to mention ":auto", but got "${report.error.message}"`);
    }

    // Core jotsum behaviour: text without numbers, and ordinary well-formed
    // lines, must never be reported as an error - regardless of the result
    // being 0.
    const clean_cases = [
        { expression: 'apples', context: null },
        { expression: '3 apples + 4 pears', context: null },
        { expression: '2 + 2', context: null },
        { expression: '-10 -10 -10', context: null },
        { expression: 'Tanken -45.50 EUR', context: null },
        { expression: "Rechnung '2024 500", context: null },
        { expression: '', context: null },
    ];

    clean_cases.forEach(test => {
        const report = {};
        joLine.calculate(test.expression, test.context, report);
        assert.strictEqual(report.error, undefined, `Expected no error for "${test.expression}", but got ${JSON.stringify(report.error)}`);
    });

    // '---' is a separator and never reaches calculate()/tokenize() at all,
    // so it cannot carry an error either (checked at the evaluate_sheet
    // level in sheet.test.js).

    // Division by zero is the same silent-wrong pattern: without a report it
    // would just show 0 in the sum column.
    const div_report = {};
    const div_value = joLine.calculate('Aufteilung 10 / 0', null, div_report);
    assert.strictEqual(div_value, Infinity, `Expected Infinity, but got ${div_value}`);
    assert.strictEqual(div_report.error && div_report.error.code, 'division-by-zero', `Expected division-by-zero, but got ${JSON.stringify(div_report.error)}`);

    // A normal division must stay clean.
    const div_ok = {};
    joLine.calculate('10 / 2', null, div_ok);
    assert.strictEqual(div_ok.error, undefined, `Expected no error, but got ${JSON.stringify(div_ok.error)}`);

    // Two numbers side by side are never joined on their own - an operator
    // between them is always required.
    const no_implicit = [
        { expression: '18 + 12 mirakel 20 + 10', value: 18 },
        { expression: 'apples 5 pears 10', value: 5 },
        { expression: '5 10', value: 5 },
        { expression: '10 . 87', value: 10 },
    ];
    no_implicit.forEach(test => {
        const r = {};
        const v = joLine.calculate(test.expression, null, r);
        assert.strictEqual(v, test.value, `Expected ${test.value} for ${JSON.stringify(test.expression)}, but got ${v}`);
        assert.strictEqual(r.error && r.error.code, 'missing-operator', `Expected missing-operator for ${JSON.stringify(test.expression)}, but got ${JSON.stringify(r.error)}`);
    });

    // With an operator in place the very same lines are fine again.
    const with_operator = [
        { expression: '18 + 12 mirakel + 20 + 10', expected: 60 },
        { expression: 'apples 5 + pears 10', expected: 15 },
        { expression: '3 apples + 4 pears', expected: 7 },
    ];
    with_operator.forEach(test => {
        const r = {};
        const v = joLine.calculate(test.expression, null, r);
        assert.strictEqual(v, test.expected, `Expected ${test.expected} for ${JSON.stringify(test.expression)}, but got ${v}`);
        assert.strictEqual(r.error, undefined, `Expected no error for ${JSON.stringify(test.expression)}, but got ${JSON.stringify(r.error)}`);
    });

    console.log('All error report tests passed!');
}

testCalculate();
testCalculateWithContext();
testErrorReports();
