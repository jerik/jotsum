class NrSheet extends HTMLElement {
    constructor() {
        super();
        this.addEventListener('keyup', this.update_total);
        this.addEventListener('line-deleted', this.update_total);
        this.addEventListener('line-added', this.update_total);
    }

    update_total() {
        let total = 0;
        const sums = this.querySelectorAll('nr-sum');
        sums.forEach(sum => {
            const value = parseFloat(sum.textContent);
            if (!isNaN(value)) {
                total += value;
            }
        });
        document.getElementById('total').textContent = this.round(total);
    }

    round(num) {
        if (num % 1 !== 0) {
            return num.toFixed(4);
        }
        return num;
    }
}

class NrLine extends HTMLElement {
    constructor() {
        super();
        this.addEventListener('keyup', this.recalculate);
        this.addEventListener('keydown', this.handle_keys);
    }

    connectedCallback() {
        if (!this.hasAttribute('contenteditable')) {
            this.setAttribute('contenteditable', 'true');
        }
    }

    recalculate() {
        const subtotal = this.calculate(this.textContent);
        const sumElement = this.nextElementSibling;
        if (sumElement && sumElement.tagName === 'NR-SUM') {
            sumElement.textContent = this.round(subtotal);
        }
    }

    calculate(expression) {
        if (!expression || typeof expression !== 'string') {
            return 0;
        }

        const sanitizedExpression = expression.replace(/[^0-9.+\-*/()\s]/g, '');

        try {
            const tokens = sanitizedExpression.match(/(\d+\.?\d*)|[+\-*/()]/g) || [];
            const RPN = this.shuntingYard(tokens);
            const result = this.calculateRPN(RPN);
            return result === undefined ? 0 : result;
        } catch (e) {
            return 0;
        }
    }

    shuntingYard(tokens) {
        const output = [];
        const operators = [];
        const precedence = {
            '+': 1,
            '-': 1,
            '*': 2,
            '/': 2,
        };

        for (const token of tokens) {
            if (!isNaN(token)) {
                output.push(parseFloat(token));
            } else if (token in precedence) {
                while (
                    operators.length > 0 &&
                    operators[operators.length - 1] in precedence &&
                    precedence[operators[operators.length - 1]] >= precedence[token]
                ) {
                    output.push(operators.pop());
                }
                operators.push(token);
            } else if (token === '(') {
                operators.push(token);
            } else if (token === ')') {
                while (operators.length > 0 && operators[operators.length - 1] !== '(') {
                    output.push(operators.pop());
                }
                if (operators[operators.length - 1] === '(') {
                    operators.pop();
                }
            }
        }

        while (operators.length > 0) {
            output.push(operators.pop());
        }

        return output;
    }

    calculateRPN(rpn) {
        const stack = [];

        for (const token of rpn) {
            if (typeof token === 'number') {
                stack.push(token);
            } else {
                const b = stack.pop();
                const a = stack.pop();
                switch (token) {
                    case '+':
                        stack.push(a + b);
                        break;
                    case '-':
                        stack.push(a - b);
                        break;
                    case '*':
                        stack.push(a * b);
                        break;
                    case '/':
                        stack.push(a / b);
                        break;
                }
            }
        }

        return stack[0];
    }

    round(num) {
        if (num % 1 !== 0) {
            return num.toFixed(4);
        }
        return num;
    }

    handle_keys(e) {
        if (e.which === 13) { // Enter
            e.preventDefault();
            if (e.ctrlKey) {
                this.add_new_line_after();
            } else {
                const next_line = this.nextElementSibling.nextElementSibling;
                if (next_line) {
                    next_line.focus();
                } else {
                    this.add_new_line_after();
                }
            }
        } else if (e.which === 38) { // ArrowUp
            const prev_line = this.previousElementSibling.previousElementSibling;
            if (prev_line) {
                prev_line.focus();
            }
        } else if (e.which === 40) { // ArrowDown
            const next_line = this.nextElementSibling.nextElementSibling;
            if (next_line) {
                next_line.focus();
            }
        } else if (e.which === 46 && e.ctrlKey) { // Ctrl+Delete
            this.delete_line();
        }
    }

    add_new_line_after() {
        const new_line = document.createElement('nr-line');
        const new_sum = document.createElement('nr-sum');
        this.parentNode.insertBefore(new_line, this.nextElementSibling.nextElementSibling);
        this.parentNode.insertBefore(new_sum, new_line.nextElementSibling);
        new_line.focus();
        this.dispatchEvent(new Event('line-added', { bubbles: true }));
    }

    delete_line() {
        const parent = this.parentNode;
        const sumElement = this.nextElementSibling;
        const nextLine = this.nextElementSibling ? this.nextElementSibling.nextElementSibling : null;
        const prevLine = this.previousElementSibling ? this.previousElementSibling.previousElementSibling : null;

        parent.removeChild(this);
        if (sumElement) {
            parent.removeChild(sumElement);
        }

        if (nextLine) {
            nextLine.focus();
        } else if (prevLine) {
            prevLine.focus();
        }

        this.dispatchEvent(new Event('line-deleted', { bubbles: true }));
    }
}

class NrSum extends HTMLElement {
    constructor() {
        super();
    }
}

customElements.define('nr-sheet', NrSheet);
customElements.define('nr-line', NrLine);
customElements.define('nr-sum', NrSum);

function add_calc_line(starter = '') {
    const nr_sheet = document.getElementById('sheet');
    const nr_line = document.createElement('nr-line');
    if (starter) {
        nr_line.textContent = starter;
    }
    const nr_sum = document.createElement('nr-sum');
    nr_sheet.appendChild(nr_line);
    nr_sheet.appendChild(nr_sum);
    nr_line.focus();
    nr_line.recalculate();
    nr_sheet.update_total();
}

if (typeof window !== 'undefined') {
    window.onload = function () {
        add_calc_line('7 apples + 4 pears');
        document.getElementById("add_line").addEventListener('click', () => {
            add_calc_line();
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NrLine, NrSheet };
}
