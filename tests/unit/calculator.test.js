const assert = require('assert');
const { NrLine } = require('../../jotsum.js');




function testCalculate() {
    const nrLine = new NrLine();
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
    ];

    tests.forEach(test => {
        const result = nrLine.calculate(test.expression);
        assert.strictEqual(result === -0 ? 0 : result, test.expected, `Test failed for expression: "${test.expression}". Expected ${test.expected}, but got ${result}`);
    });

    console.log('All calculator tests passed!');
}

testCalculate();
