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
        { expression: '10 . 87', expected: 'NaN' }, 
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
        { expression: "70's 5", expected: 75 },
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

    console.log('All calculator tests passed!');
}

function testCalculateWithContext() {
    const joLine = new JoLine();

    // Resolved variable behaves like a normal number.
    const resolved = joLine.calculate('12 * :auto', { vars: new Map([['auto', 120]]) });
    assert.strictEqual(resolved, 1440, `Expected 1440, but got ${resolved}`);

    // No context at all -> ':auto' is ignored like an unknown word, implicit
    // addition still applies around it.
    const no_context = joLine.calculate('5 :auto 10');
    assert.strictEqual(no_context, 15, `Expected 15, but got ${no_context}`);

    // Context present but the name is missing -> also ignored, no NaN.
    const unknown_name = joLine.calculate('5 :unknown 3', { vars: new Map([['auto', 120]]) });
    assert.strictEqual(unknown_name, 8, `Expected 8, but got ${unknown_name}`);

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

testCalculate();
testCalculateWithContext();
