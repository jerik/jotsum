class JoSheet extends HTMLElement {
    constructor() {
        super();
        this.addEventListener('keyup', this.update_total);
        this.addEventListener('line-deleted', this.update_total);
        this.addEventListener('line-added', this.update_total);
    }

    update_total() {
        const lines = Array.from(this.querySelectorAll('jo-line'));
        const texts = lines.map(line => line.textContent.trim());
        const { sums, types, total, errors } = evaluate_sheet(texts);

        lines.forEach((line, i) => {
            const type = types[i];
            const error = errors[i];
            // While a line is actively being edited it is routinely broken
            // for a moment (e.g. "5 +"), so no error is shown for it - flicker
            // would be unbearable.
            const is_active = line.classList.contains('is-active');
            // The example hint only stands as long as the line is untouched
            // and empty. It is illustrative, so it never enters any sum.
            const show_hint = !!line.getAttribute('data-placeholder') && texts[i] === '';
            if (show_hint) {
                line.classList.add('is-placeholder');
            } else {
                line.classList.remove('is-placeholder');
            }

            line.classList.remove('is-definition', 'is-separator');
            if (type === 'definition') {
                line.classList.add('is-definition');
            } else if (type === 'separator') {
                line.classList.add('is-separator');
            }

            const sumElement = line.nextElementSibling;
            const show_error = !!error && !is_active;

            if (show_error) {
                line.classList.add('is-error');
                line.setAttribute('title', error.message);
            } else {
                line.classList.remove('is-error');
                line.removeAttribute('title');
            }

            if (sumElement && sumElement.tagName === 'JO-SUM') {
                if (show_error) {
                    sumElement.classList.add('is-error');
                    sumElement.textContent = '?';
                    // The "?" is what anyone points at, so it carries the
                    // explanation too - not just the line.
                    sumElement.setAttribute('title', error.message);
                } else if (show_hint) {
                    sumElement.classList.remove('is-error');
                    sumElement.removeAttribute('title');
                    sumElement.textContent = line.getAttribute('data-placeholder-sum');
                } else {
                    sumElement.classList.remove('is-error');
                    sumElement.removeAttribute('title');
                    sumElement.textContent = this.round(sums[i]);
                }

                if (show_hint) {
                    sumElement.classList.add('is-placeholder');
                } else {
                    sumElement.classList.remove('is-placeholder');
                }

                if (type === 'definition' || type === 'separator') {
                    sumElement.classList.add('is-muted');
                } else {
                    sumElement.classList.remove('is-muted');
                }
            }
        });

        // A lone hint line would otherwise read "7" next to a total of 0,
        // which looks broken. Show the illustrative total, greyed out.
        const hint_only = lines.length === 1 && lines[0].classList.contains('is-placeholder');
        const total_element = document.getElementById('total');
        if (hint_only) {
            total_element.textContent = lines[0].getAttribute('data-placeholder-sum');
            total_element.classList.add('is-placeholder');
        } else {
            total_element.textContent = this.round(total);
            total_element.classList.remove('is-placeholder');
        }
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
		// The hint goes away when you type, and only then. Hanging it on focus
		// or on a click breaks the page in a background tab: there the focus
		// event arrives after the hint was set up and wipes it out, while in a
		// foreground tab it arrives before and does nothing.
		this.addEventListener('beforeinput', () => this._drop_hint());
		this.addEventListener('input', () => this._drop_hint());

		// ✨ Aktiv-Markierung
		this._onFocus = () => {
		  // andere aktive Zeile(n) abräumen
		  document.querySelectorAll('jo-line.is-active').forEach(el => { if (el !== this) el.classList.remove('is-active'); });
		  this.classList.add('is-active');
		  // The error display depends on which line is active, so the sheet
		  // must re-sweep on every focus change too (not just on typing).
		  const sheet = typeof this.closest === 'function' ? this.closest('jo-sheet') : null;
		  if (sheet) {
		    sheet.update_total();
		  }
		};
		this._onBlur = () => {
		  this.classList.remove('is-active');
		  const sheet = typeof this.closest === 'function' ? this.closest('jo-sheet') : null;
		  if (sheet) {
		    sheet.update_total();
		  }
		};
		this.addEventListener('focus', this._onFocus);
		this.addEventListener('blur', this._onBlur);
  }

    // The example hint has done its job the moment the line is touched.
    // Dropping the attributes keeps it from reappearing mid-editing.
    _drop_hint() {
        if (!this.hasAttribute || !this.hasAttribute('data-placeholder')) {
            return;
        }
        this.removeAttribute('data-placeholder');
        this.removeAttribute('data-placeholder-sum');
        this.classList.remove('is-placeholder');
        const sheet = typeof this.closest === 'function' ? this.closest('jo-sheet') : null;
        if (sheet) {
            sheet.update_total();
        }
    }

    connectedCallback() {
        if (!this.hasAttribute('contenteditable')) {
            this.setAttribute('contenteditable', 'true');
        }
        // A sheet full of amounts and part numbers is not prose - the red
        // squiggles would only compete with the error marker.
        if (!this.hasAttribute('spellcheck')) {
            this.setAttribute('spellcheck', 'false');
        }
    }

    recalculate() {
        const sheet = typeof this.closest === 'function' ? this.closest('jo-sheet') : null;
        if (sheet) {
            sheet.update_total();
            return;
        }

        // Fallback for isolated/mocked lines without an enclosing jo-sheet.
        const subtotal = this.calculate(this.textContent.trim());
        const sumElement = this.nextElementSibling;
        if (sumElement && sumElement.tagName === 'JO-SUM') {
            sumElement.textContent = this.round(subtotal);
        }
    }

    calculate(expression, context = null, report = null) {
        if (!expression || typeof expression !== 'string') {
            return 0;
        }

        try {
            const tokens = this.tokenize(expression, context, report);
            const RPN = this.shuntingYard(tokens, report);
            const result = this.calculateRPN(RPN, report);
            return result === undefined ? 0 : result;
        } catch (e) {
            return 0;
        }
    }

    // Records the first structural problem found for a line, if the caller
    // asked for diagnostics via `report`. Never overwrites an earlier error
    // - the first one found wins - and never touches the return value of
    // calculate()/tokenize()/shuntingYard()/calculateRPN().
    _set_error(report, code, message) {
        if (report && !report.error) {
            report.error = { code, message };
        }
    }

    // A dash is part of a word (e-mail, make-love-not-war) when a letter sits
    // next to it. Exception: directly after a variable reference the letter on
    // the left belongs to the variable name, so only the right side counts -
    // that keeps ":SUBTOTAL_1-50" and ":a- 5" working as subtractions.
    is_dash_in_word(expression, i, variable_end) {
        const next_is_letter = expression[i+1] && expression[i+1].match(/[a-zA-Z]/);
        if (i === variable_end) {
            return !!next_is_letter;
        }
        const prev_is_letter = expression[i-1] && expression[i-1].match(/[a-zA-Z]/);
        return !!(prev_is_letter || next_is_letter);
    }

    tokenize(expression, context = null, report = null) {
        const tokens = [];
        let current_number = '';
        // true only once we actually have an operand available (a number was
        // pushed, or a ')' was processed) - used to decide whether a
        // following '-'/'+' is unary or binary.
        let has_operand = false;
        let variable_end = -1;
        let escape_next_number = false;

        for (let i = 0; i < expression.length; i++) {
            const char = expression[i];

            // Any whitespace separates, not just U+0020. contenteditable turns
            // every second space into a non-breaking space, and isNaN('\u00A0')
            // is false - so an untreated nbsp would be collected into the
            // number and parseFloat would turn the whole line into NaN.
            if (/\s/.test(char)) {
                if (current_number !== '') {
                    if (escape_next_number) {
                        escape_next_number = false;
                    } else {
                        tokens.push(parseFloat(current_number));
                        has_operand = true;
                    }
                    current_number = '';
                }
                continue;
            }

            if (!isNaN(char) || (char === '.' && !((expression[i-1] && expression[i-1].match(/[a-zA-Z]/)) || (expression[i+1] && expression[i+1].match(/[a-zA-Z]/))))) {
                if (char === '.' && current_number.includes('.')) {
                    if (escape_next_number) {
                        escape_next_number = false;
                    } else {
                        tokens.push(parseFloat(current_number));
                        has_operand = false;
                    }
                    current_number = '';
                    tokens.push(char);
                } else {
                    current_number += char;
                }
            } else {
                if (current_number !== '') {
                    if (escape_next_number) {
                        escape_next_number = false;
                    } else if (!isNaN(current_number)) {
                        tokens.push(parseFloat(current_number));
                        has_operand = true;
                    }
                    current_number = '';
                }

                if (char === "'" && expression[i+1] && /[0-9]/.test(expression[i+1])) {
                    // apostrophe directly before a digit escapes the following number
                    escape_next_number = true;
                } else if (char === ':') {
                    // Variable reference. Names are letters, digits and
                    // underscores - deliberately no dash, because a dash is an
                    // operator and ":SUBTOTAL_1-50" has to be a subtraction
                    // with nothing left to guess.
                    let j = i + 1;
                    let name = '';
                    while (j < expression.length && /[A-Za-z0-9_]/.test(expression[j])) {
                        name += expression[j];
                        j++;
                    }

                    const vars = context && context.vars;
                    const taken = name.length;

                    if (vars && vars.has(name)) {
                        tokens.push(vars.get(name));
                        has_operand = true;
                    } else {
                        // Unknown name: ignored like an unknown word, never NaN.
                        if (name.length > 0) {
                            if (vars) {
                                // A context WITH vars was given, but nothing
                                // matched - that is a genuine unknown variable.
                                this._set_error(report, 'unknown-variable', `Unknown variable :${name}`);
                            } else if (report) {
                                // No context at all: we cannot tell whether the
                                // name would resolve, so - same as the existing
                                // unit tests - it is silently ignored like any
                                // other word. Remember that though, so the
                                // operator this leaves dangling (e.g. "12 * :auto")
                                // is not mistaken for a genuine missing-value gap
                                // (e.g. "5 +") further down in calculateRPN.
                                report._softIgnoredVariable = true;
                            }
                        }
                    }
                    i = i + taken; // ':' plus the consumed name characters
                    variable_end = i + 1; // a dash right here is an operator, not a word dash
                } else if (char === '-' && this.is_dash_in_word(expression, i, variable_end)) {
                    // ignore dash in word
                } else if (['+', '-', '*', '/', '(', ')'].includes(char)) {
                    if (char === '-' && !has_operand) {
                        tokens.push('u');
                    } else if (char === '+' && !has_operand) {
                        // ignore unary plus
                    } else {
                        tokens.push(char);
                    }
                    has_operand = (char === ')');
                } else {
                    // It's a letter or some other character, ignore it.
                }
            }
        }

        if (current_number !== '') {
            if (escape_next_number) {
                escape_next_number = false;
            } else {
                tokens.push(parseFloat(current_number));
            }
        }

        // Two numbers next to each other are NOT joined with an implicit plus.
        // "18 + 12 mirakel 20 + 10" are two finished sums glued together by a
        // word - what the line is supposed to mean is anyone's guess, so it is
        // reported as missing-operator instead of silently adding up to 60.
        return tokens;
    }

    shuntingYard(tokens, report = null) {
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
                } else {
                    // Closing paren with nothing open to match it.
                    this._set_error(report, 'unbalanced-parens', 'Unbalanced parentheses');
                }
            }
        }

        while (operators.length > 0) {
            output.push(operators.pop());
        }

        if (output.includes('(')) {
            // An open paren that never got closed ends up stranded in the
            // output (see the loop above) instead of being consumed by a ')'.
            this._set_error(report, 'unbalanced-parens', 'Unbalanced parentheses');
        }

        return output;
    }

    calculateRPN(rpn, report = null) {
        const stack = [];
        // A ':variable' that was silently ignored because no context was
        // given (see tokenize) can leave an operator without a real second
        // operand. That is not a genuine structural error, so it must not
        // surface as missing-value.
        const suppress_missing_value = !!(report && report._softIgnoredVariable);

        for (const token of rpn) {
            if (typeof token === 'number') {
                stack.push(token);
            } else if (token === 'u') {
                stack.push(-stack.pop());
            } else {
                const b = stack.pop();
                const a = stack.pop();
                if ((a === undefined || b === undefined) && !suppress_missing_value) {
                    this._set_error(report, 'missing-value', 'Missing a value for the operator');
                }
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
                        if (b === 0) {
                            this._set_error(report, 'division-by-zero', 'Division by zero');
                        }
                        stack.push(a / b);
                        break;
                }
            }
        }

        if (stack.length > 1) {
            // More than one value left over: parts of the line were never
            // joined by an operator.
            this._set_error(report, 'missing-operator', 'Missing operator between the parts of this line');
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

function classify_line(text) {
    if (/^-{3,}$/.test(text)) {
        return { type: 'separator' };
    }

    const definition_match = text.match(/^:([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*)$/);
    if (definition_match) {
        return { type: 'definition', name: definition_match[1], expr: definition_match[2] };
    }

    return { type: 'value' };
}

function evaluate_sheet(lines) {
    const context = { vars: new Map(), block_sum: 0, subtotal_index: 0 };
    const sums = new Array(lines.length);
    const types = new Array(lines.length);
    const errors = new Array(lines.length);
    let total = 0;

    for (let i = 0; i < lines.length; i++) {
        const text = (lines[i] || '').trim();
        const classified = classify_line(text);
        types[i] = classified.type;

        if (classified.type === 'separator') {
            // Nothing gets parsed for a separator, so it can never be errorous.
            errors[i] = null;
            context.subtotal_index++;
            context.vars.set('SUBTOTAL_' + context.subtotal_index, context.block_sum);
            sums[i] = context.block_sum;
            context.block_sum = 0;
        } else if (classified.type === 'definition') {
            const report = {};
            const wert = JoLine.prototype.calculate.call(JoLine.prototype, classified.expr, context, report);
            errors[i] = report.error || null;
            // Same NaN guard as for value lines: a broken definition must not
            // show NaN, and must not poison every line that uses the variable.
            const safe = isFinite(wert) ? wert : 0;
            sums[i] = safe;
            // A broken definition must not propagate its (possibly bogus)
            // value to lines that reference it.
            if (!report.error) {
                context.vars.set(classified.name, safe);
            }
        } else {
            const report = {};
            const wert = JoLine.prototype.calculate.call(JoLine.prototype, text, context, report);
            errors[i] = report.error || null;
            // Display never shows NaN, even though a dangling operator (e.g.
            // an unresolved :var used before its definition) can produce one.
            sums[i] = isFinite(wert) ? wert : 0;
            if (isFinite(wert) && !report.error) {
                total += wert;
                context.block_sum += wert;
            }
        }
    }

    return { sums, total, types, vars: context.vars, errors };
}

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
    return jo_line;
}

// The empty sheet shows a greyed out example instead of real text. It is a
// hint, not content: one click and it is gone, so nobody has to delete it
// first. The numbers next to it are illustrative, never calculated.
const EXAMPLE_HINT = 'Start typing, e.g. 3 apples + 4 pears';
const EXAMPLE_HINT_SUM = '7';

function add_example_hint_line() {
    const jo_line = add_calc_line('');
    if (jo_line && jo_line.setAttribute) {
        jo_line.setAttribute('data-placeholder', EXAMPLE_HINT);
        jo_line.setAttribute('data-placeholder-sum', EXAMPLE_HINT_SUM);
        const sheet = document.getElementById('sheet');
        if (sheet && sheet.update_total) {
            sheet.update_total();
        }
    }
    return jo_line;
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
        // No text parameter: show the greyed out example hint
        add_example_hint_line();
    }
}

function reset_sheet() {
    const sheet = document.getElementById('sheet');
    while (sheet.firstChild) {
        sheet.removeChild(sheet.firstChild);
    }
    add_example_hint_line();
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
    module.exports = { JoLine, JoSheet, classify_line, evaluate_sheet };
}
