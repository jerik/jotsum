class JoSheet extends HTMLElement {
    constructor() {
        super();
        this.addEventListener('keyup', this.update_total);
        this.addEventListener('line-deleted', this.update_total);
        this.addEventListener('line-added', this.update_total);
    }

    update_total() {
        let total = 0;
        const sums = this.querySelectorAll('jo-sum');
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
            return num.toFixed(2);
        }
        return num;
    }
}

class JoLine extends HTMLElement {
	constructor() {
		super();
		this.addEventListener('input', this.recalculate);
		this.addEventListener('beforeinput', this.recalculate);
		this.addEventListener('keyup', this.recalculate);
		this.addEventListener('keydown', this.handle_keys);

		// ✨ Aktiv-Markierung
		this._onFocus = () => {
		  // andere aktive Zeile(n) abräumen
		  document.querySelectorAll('jo-line.is-active').forEach(el => { if (el !== this) el.classList.remove('is-active'); });
		  this.classList.add('is-active');
		};
		this._onBlur = () => { this.classList.remove('is-active'); };
		this.addEventListener('focus', this._onFocus);
		this.addEventListener('blur', this._onBlur);
  }

    connectedCallback() {
        if (!this.hasAttribute('contenteditable')) {
            this.setAttribute('contenteditable', 'true');
        }
    }

    recalculate() {
        const subtotal = this.calculate(this.textContent.trim());
        const sumElement = this.nextElementSibling;
        if (sumElement && sumElement.tagName === 'JO-SUM') {
            sumElement.textContent = this.round(subtotal);
        }
    }

    calculate(expression) {
        if (!expression || typeof expression !== 'string') {
            return 0;
        }

        try {
            const tokens = this.tokenize(expression);
            const RPN = this.shuntingYard(tokens);
            const result = this.calculateRPN(RPN);
            return result === undefined ? 0 : result;
        } catch (e) {
            return 0;
        }
    }

    tokenize(expression) {
        const tokens = [];
        let current_number = '';
        let last_token_was_operator = true;

        for (let i = 0; i < expression.length; i++) {
            const char = expression[i];

            if (char === ' ') {
                if (current_number !== '') {
                    tokens.push(parseFloat(current_number));
                    current_number = '';
                }
                continue;
            }

            if (!isNaN(char) || (char === '.' && !((expression[i-1] && expression[i-1].match(/[a-zA-Z]/)) || (expression[i+1] && expression[i+1].match(/[a-zA-Z]/))))) {
                if (char === '.' && current_number.includes('.')) {
                    tokens.push(parseFloat(current_number));
                    current_number = '';
                    tokens.push(char);
                    last_token_was_operator = true;
                } else {
                    current_number += char;
                    last_token_was_operator = false;
                }
            } else {
                if (current_number !== '') {
                    if (!isNaN(current_number)) {
                        tokens.push(parseFloat(current_number));
                    }
                    current_number = '';
                }

                if (char === '-' && ((expression[i-1] && expression[i-1].match(/[a-zA-Z]/)) || (expression[i+1] && expression[i+1].match(/[a-zA-Z]/)))) {
                    // ignore dash in word
                    last_token_was_operator = false;
                } else if (['+', '-', '*', '/', '(', ')'].includes(char)) {
                    if (char === '-' && last_token_was_operator) {
                        tokens.push('u');
                    } else if (char === '+' && last_token_was_operator) {
                        // ignore unary plus
                    } else {
                        tokens.push(char);
                    }
                    last_token_was_operator = true;
                } else {
                    // It's a letter or some other character, ignore it.
                    last_token_was_operator = false;
                }
            }
        }

        if (current_number !== '') {
            tokens.push(parseFloat(current_number));
        }

        // Implicit addition
        const final_tokens = [];
        for (let i = 0; i < tokens.length; i++) {
            final_tokens.push(tokens[i]);
            if (i < tokens.length - 1 && typeof tokens[i] === 'number' && typeof tokens[i+1] === 'number') {
                final_tokens.push('+');
            }
        }

        return final_tokens;
    }

    shuntingYard(tokens) {
        const output = [];
        const operators = [];
        const precedence = {
            '+': 1,
            '-': 1,
            '*': 2,
            '/': 2,
            'u': 3, // Unary minus
        };

        for (const token of tokens) {
            if (typeof token === 'number') {
                output.push(token);
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
            } else if (token === 'u') {
                stack.push(-stack.pop());
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
        if (num === -0) {
            return 0;
        }
        if (num % 1 !== 0) {
            return num.toFixed(2);
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

    add_new_line_after(content = '') {
        const new_line = document.createElement('jo-line');
        new_line.textContent = content;
        const new_sum = document.createElement('jo-sum');
        this.parentNode.insertBefore(new_line, this.nextElementSibling.nextElementSibling);
        this.parentNode.insertBefore(new_sum, new_line.nextElementSibling);
        new_line.focus();
        this.dispatchEvent(new Event('line-added', { bubbles: true }));
        new_line.recalculate();
        return new_line;
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

class JoSum extends HTMLElement {
    constructor() {
        super();
    }
}

customElements.define('jo-sheet', JoSheet);
customElements.define('jo-line', JoLine);
customElements.define('jo-sum', JoSum);

function add_calc_line(starter = '') {
    const jo_sheet = document.getElementById('sheet');
    const jo_line = document.createElement('jo-line');
    if (starter) {
        jo_line.textContent = starter;
    }
    const jo_sum = document.createElement('jo-sum');
    jo_sheet.appendChild(jo_line);
    jo_sheet.appendChild(jo_sum);
    jo_line.focus();
    jo_line.recalculate();
    jo_sheet.update_total();
}

function handle_url_params() {
    const url_params = new URLSearchParams(window.location.search);
    const text_param = url_params.get('text');

    if (text_param) {
        const decoded_text = decodeURIComponent(text_param);
        const lines = decoded_text.split('\n').filter(line => line.trim() !== '');
        if (lines.length > 0) {
            // Clear existing lines
            const sheet = document.getElementById('sheet');
            while (sheet.firstChild) {
                sheet.removeChild(sheet.firstChild);
            }

            lines.forEach(line_content => {
                add_calc_line(line_content);
            });
            document.getElementById('sheet').update_total();
        }
    } else {
        // No text parameter, add an empty line
        add_calc_line('3 apples + 4 pears');
    }
}

function reset_sheet() {
    const sheet = document.getElementById('sheet');
    while (sheet.firstChild) {
        sheet.removeChild(sheet.firstChild);
    }
    add_calc_line('3 apples + 4 pears');
    sheet.update_total();
}

if (typeof window !== 'undefined') {
    window.onload = function () {
        handle_url_params();
		/** Not used anymore ? removed buttons from the bottom, the upper once do the stuff now
        document.getElementById("add_line").addEventListener('click', () => {
            add_calc_line();
        });

        document.getElementById("reset_sheet").addEventListener('click', () => {
            reset_sheet();
        });
		**/

        document.addEventListener('paste', (event) => {
            const active_element = document.activeElement;

            // Only act if we are pasting into the sheet or a line
            if (active_element && active_element.closest('jo-sheet, jo-line')) {
                event.preventDefault();
                const paste_data = event.clipboardData.getData('text/plain');
                const lines = paste_data.split('\n').filter(line => line.trim() !== '');

                if (lines.length === 0) return;

                if (active_element.tagName === 'JO-LINE') {
                    // Paste into an existing line
                    active_element.textContent = lines[0];
                    active_element.recalculate();

                    let current_line = active_element;
                    for (let i = 1; i < lines.length; i++) {
                        current_line = current_line.add_new_line_after(lines[i]);
                    }
                    if (lines.length > 1) {
                        current_line.focus();
                    }
                } else {
                    // Paste into the sheet but not a specific line, append to end
                    lines.forEach(line_content => {
                        add_calc_line(line_content);
                    });
                }
                
                document.getElementById('sheet').update_total();
            }
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { JoLine, JoSheet };
}
