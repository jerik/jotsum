const assert = require('assert');
const { NrLine } = require('../../nebenrechnung.js');




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
        { expression: '1.5 + 2.5', expected: 4 },
        { expression: '10 * 0.5', expected: 5 },
        { expression: '10 / 0.5', expected: 20 },
        { expression: 'invalid expression', expected: 0 },
        { expression: '', expected: 0 },
    ];

    tests.forEach(test => {
        const result = nrLine.calculate(test.expression);
        assert.strictEqual(result, test.expected, `Test failed for expression: "${test.expression}". Expected ${test.expected}, but got ${result}`);
    });

    console.log('All calculator tests passed!');
}

testCalculate();