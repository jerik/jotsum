const SHEET_STORAGE_KEY = 'jotsum.sheet';
const STORE_STORAGE_KEY = 'jotsum.sheets';
const ACTIVE_STORAGE_KEY = 'jotsum.active';
let active_shortsave_id = null;
let restoring_sheet = false;
let sheet_id_sequence = 0;

function sheet_name(lines) {
    const first = lines.find(line => line.trim() !== '');
    if (first === undefined) return 'Untitled';
    const text = first.trim();
    return classify_line(text).type === 'heading' ? text.replace(/^#+\s*/, '').trim() || 'Untitled' : text;
}

function new_sheet_id() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // The counter also distinguishes calls within the same millisecond.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${++sheet_id_sequence}`;
}

// jotsum.sheets stores a JSON array of { id: string, lines: string[] }.
// Additional fields and unreadable entries survive saves unchanged.
// An existing array, even [], marks the legacy sheet as already migrated.
// Keep jotsum.sheet while the single-sheet UI still reads/writes it.
let raw_store = [];
let store_memory_only = false;
let store_write_blocked = false;
let migrated_shortsave_id = null;

function readable_entry(entry) {
    return entry && typeof entry.id === 'string' && Array.isArray(entry.lines) &&
        entry.lines.every(line => typeof line === 'string');
}

function load_store() {
    if (store_memory_only || store_write_blocked) return raw_store.filter(readable_entry);
    try {
        const stored = window.localStorage.getItem(STORE_STORAGE_KEY);
        if (stored !== null) {
            let parsed;
            try {
                parsed = JSON.parse(stored);
                if (!Array.isArray(parsed)) throw new Error('Store is not an array');
            } catch (error) {
                store_write_blocked = true;
                console.warn('Unreadable jotsum.sheets; saving is disabled for this page load.', error);
                try {
                    if (window.localStorage.getItem(STORE_STORAGE_KEY + '.broken') === null) {
                        window.localStorage.setItem(STORE_STORAGE_KEY + '.broken', stored);
                    }
                } catch (backup_error) {
                    // A blocked or full storage may also prevent the backup.
                }
                raw_store = [];
                return [];
            }
            raw_store = parsed;
        } else {
            raw_store = [];
            const legacy = JSON.parse(window.localStorage.getItem(SHEET_STORAGE_KEY));
            if (Array.isArray(legacy) && legacy.every(line => typeof line === 'string') && legacy.some(line => line.trim())) {
                migrated_shortsave_id = new_sheet_id();
                save_store([{ id: migrated_shortsave_id, lines: legacy }]);
                set_active_shortsave(migrated_shortsave_id);
            }
        }
    } catch (error) {
        // Keep both unsaved edits and a migration's ID when storage is unavailable.
        store_memory_only = true;
    }
    return raw_store.filter(readable_entry);
}

function save_store(store) {
    // Replace readable entries in place; unknown formats must survive unchanged.
    const remaining = store.slice();
    raw_store = raw_store.flatMap(entry => {
        if (!readable_entry(entry)) return [entry];
        const index = remaining.findIndex(candidate => candidate.id === entry.id);
        return index < 0 ? [] : remaining.splice(index, 1);
    }).concat(remaining);
    if (!store_write_blocked && !store_memory_only) {
        try {
            window.localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(raw_store));
            store_memory_only = false;
        } catch (error) {
            store_memory_only = true;
        }
    }
    if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('shortsaves-changed'));
    }
}

function set_active_shortsave(id) {
    active_shortsave_id = id;
    try {
        if (id) window.localStorage.setItem(ACTIVE_STORAGE_KEY, id);
        else window.localStorage.removeItem(ACTIVE_STORAGE_KEY);
    } catch (error) {
        // Keep the in-memory association when storage is unavailable.
    }
}

function persist_shortsave(lines) {
    if (restoring_sheet) return;
    const store = load_store();
    if (!active_shortsave_id && !lines.some(line => line.trim())) return;
    let entry = store.find(entry => entry.id === active_shortsave_id);
    if (!entry) {
        entry = { id: new_sheet_id(), lines };
        store.push(entry);
        set_active_shortsave(entry.id);
    } else {
        entry.lines = lines;
    }
    save_store(store);
}

function list_shortsaves() {
    return load_store().map(entry => ({
        ...entry, name: sheet_name(entry.lines), active: entry.id === active_shortsave_id
    }));
}

function render_sheet(lines) {
    const sheet = document.getElementById('sheet');
    restoring_sheet = true;
    try {
        while (sheet.firstChild) sheet.removeChild(sheet.firstChild);
        if (lines.length) lines.forEach(line => add_calc_line(line));
        else add_example_hint_line();
    } finally {
        restoring_sheet = false;
    }
    sheet.update_total();
}

function new_sheet() {
    set_active_shortsave(null);
    reset_sheet();
}

function open_shortsave(id) {
    const entry = load_store().find(entry => entry.id === id);
    if (!entry) return;
    clear_text_url();
    set_active_shortsave(id);
    render_sheet(entry.lines);
}

function delete_shortsave(id) {
    const store = load_store();
    if (!store.some(entry => entry.id === id) || !window.confirm('Delete this sheet?')) return;
    if (active_shortsave_id === id) new_sheet();
    save_store(store.filter(entry => entry.id !== id));
}

function clear_text_url() {
    const url = new URL(window.location.href);
    url.searchParams.delete('text');
    window.history.replaceState(null, '', url);
}

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

            line.classList.remove('is-definition', 'is-separator', 'is-heading');
            if (type === 'definition') {
                line.classList.add('is-definition');
            } else if (type === 'separator') {
                line.classList.add('is-separator');
            } else if (type === 'heading') {
                line.classList.add('is-heading');
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
        persist_shortsave(lines.map(line => line.textContent));
        // Store content only, never the placeholder or calculated results.
        try {
            const saved_texts = lines.map(line => line.textContent);
            if (saved_texts.some(text => text !== '')) {
                window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(saved_texts));
            } else {
                window.localStorage.removeItem(SHEET_STORAGE_KEY);
            }
        } catch (error) {
            // Storage can be unavailable or full; calculations still work.
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
                if (e.shiftKey) {
                    this.add_new_line_before();
                } else {
                    this.add_new_line_after();
                }
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

    add_new_line_before(content = '') {
        const new_line = document.createElement('jo-line');
        new_line.textContent = content;
        const new_sum = document.createElement('jo-sum');
        this.parentNode.insertBefore(new_line, this);
        this.parentNode.insertBefore(new_sum, this);
        new_line.focus();
        this.dispatchEvent(new Event('line-added', { bubbles: true }));
        new_line.recalculate();
        return new_line;
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
    if (/^#{1,6}(?:\s|$)/.test(text)) {
        return { type: 'heading' };
    }

    if (/^-{3,}$/.test(text)) {
        return { type: 'separator' };
    }

    const definition_match = text.match(/^:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
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

        if (classified.type === 'heading') {
            // Headings are text only and leave the current subtotal block intact.
            sums[i] = 0;
            errors[i] = null;
        } else if (classified.type === 'separator') {
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
    raw_store = [];
    store_memory_only = false;
    store_write_blocked = false;
    migrated_shortsave_id = null;
    const url_params = new URLSearchParams(window.location.search);
    const text_param = url_params.get('text');

    const store = load_store();
    let stored_active = null;
    try {
        // Only jotsum.sheet from before this page load counts as legacy content.
        // Rendering below rewrites it, so mark the store as migrated right away.
        if (window.localStorage.getItem(STORE_STORAGE_KEY) === null) save_store(store);
        stored_active = window.localStorage.getItem(ACTIVE_STORAGE_KEY);
    } catch (error) {
        // Loading still works without persistent storage.
    }
    set_active_shortsave(store.some(entry => entry.id === stored_active) ? stored_active : null);
    let lines = null;
    if (url_params.has('text')) {
        set_active_shortsave(null);
        // URLSearchParams already decodes the value, including literal % signs.
        lines = text_param.split('\n');
    } else {
        try {
            const saved = JSON.parse(window.localStorage.getItem(SHEET_STORAGE_KEY));
            if (Array.isArray(saved) && saved.every(line => typeof line === 'string')) {
                lines = saved;
            }
        } catch (error) {
            // Ignore unavailable storage and malformed saved data.
        }
    }

    if (!url_params.has('text') && !active_shortsave_id && lines) {
        const migrated = store.find(entry => entry.id === migrated_shortsave_id);
        if (migrated) set_active_shortsave(migrated.id);
    }
    render_sheet(lines || []);
    // Once imported, reload the saved association rather than importing again.
    if (url_params.has('text')) clear_text_url();
}

function reset_sheet() {
    clear_text_url();
    set_active_shortsave(null);
    render_sheet([]);
}

// Sidebar (from 900px) and drawer (below) listing the shortsaves.
// Everything here tolerates a missing or mocked DOM: without the sidebar
// markup the sheet keeps working and nothing is drawn.
const WIDE_LAYOUT_QUERY = '(min-width: 900px)';
const DELETE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

function ui_element(id) {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return null;
    const element = document.getElementById(id);
    return element && typeof element.appendChild === 'function' && typeof element.contains === 'function' ? element : null;
}

function is_wide_layout() {
    return typeof window.matchMedia === 'function' && window.matchMedia(WIDE_LAYOUT_QUERY).matches;
}

function is_drawer_open() {
    return !!(document.body && document.body.classList && document.body.classList.contains('drawer-open'));
}

let rendered_shortsaves = null;

function render_shortsave_list() {
    const list = ui_element('shortsave-list');
    if (!list) return;
    const entries = list_shortsaves();
    // Every keystroke writes the store; only redraw when the list really
    // changed, otherwise a focus move into the list (which blurs and saves
    // the edited line) would remove the button it just focused.
    const signature = JSON.stringify(entries.map(entry => [entry.id, entry.name, entry.active]));
    if (signature === rendered_shortsaves) return;
    rendered_shortsaves = signature;
    // Redrawing replaces the buttons, so keep the focus on the same entry.
    const focused = document.activeElement;
    const focus_id = focused && list.contains(focused) ? focused.getAttribute('data-id') : null;
    const focus_action = focus_id ? focused.getAttribute('data-action') : null;

    while (list.firstChild) list.removeChild(list.firstChild);
    entries.forEach(entry => {
        const item = document.createElement('li');
        item.className = entry.active ? 'shortsave is-active' : 'shortsave';

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'shortsave-open';
        open.setAttribute('data-action', 'open');
        open.setAttribute('data-id', entry.id);
        open.textContent = entry.name;
        open.title = entry.name;
        if (entry.active) open.setAttribute('aria-current', 'true');

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'shortsave-delete';
        remove.setAttribute('data-action', 'delete');
        remove.setAttribute('data-id', entry.id);
        remove.setAttribute('aria-label', `Delete “${entry.name}”`);
        remove.title = `Delete “${entry.name}”`;
        remove.innerHTML = DELETE_ICON;

        item.appendChild(open);
        item.appendChild(remove);
        list.appendChild(item);
    });

    const empty = ui_element('shortsave-empty');
    if (empty) empty.hidden = entries.length > 0;

    if (focus_id) {
        const target = list.querySelector(`button[data-action="${focus_action}"][data-id="${CSS.escape(focus_id)}"]`);
        if (target) target.focus();
    }
}

function set_drawer_open(open) {
    const sidebar = ui_element('sidebar');
    const toggle = ui_element('drawer-toggle');
    if (!sidebar || !toggle || !document.body) return;
    // From 900px the sidebar is always visible, so there is nothing to open.
    const drawer = open && !is_wide_layout();
    const was_open = is_drawer_open();
    const had_focus = sidebar.contains(document.activeElement);
    document.body.classList.toggle('drawer-open', drawer);
    toggle.setAttribute('aria-expanded', String(drawer));
    // Behind the open drawer the page must not be reachable by keyboard.
    ['content', 'header-actions'].forEach(id => {
        const element = ui_element(id);
        if (element) element.inert = drawer;
    });
    if (drawer && !was_open) {
        const target = sidebar.querySelector('.shortsave-open[aria-current]') ||
            sidebar.querySelector('.shortsave-open') || ui_element('sidebar-title');
        if (target) target.focus();
    } else if (!drawer && was_open && had_focus) {
        toggle.focus();
    }
}

function open_from_sidebar(id) {
    // Close first: focus cannot move into the sheet while it is inert.
    set_drawer_open(false);
    open_shortsave(id);
    render_shortsave_list();
}

function delete_from_sidebar(id) {
    const list = ui_element('shortsave-list');
    const ids = list_shortsaves().map(entry => entry.id);
    const index = ids.indexOf(id);
    delete_shortsave(id);
    render_shortsave_list();
    if (!list || list_shortsaves().some(entry => entry.id === id)) return;
    // The focused button is gone: move on to the neighbouring entry.
    const remaining = list.querySelectorAll('.shortsave-open');
    const target = remaining[Math.min(index, remaining.length - 1)] || ui_element('sidebar-title');
    if (target) target.focus();
}

function new_sheet_from_header() {
    set_drawer_open(false);
    new_sheet();
    // new_sheet() writes nothing to the store, so no change event follows.
    render_shortsave_list();
}

function init_sidebar() {
    const list = ui_element('shortsave-list');
    if (!list) return;
    list.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const id = button.getAttribute('data-id');
        if (button.getAttribute('data-action') === 'open') open_from_sidebar(id);
        else delete_from_sidebar(id);
    });

    const toggle = ui_element('drawer-toggle');
    if (toggle) toggle.addEventListener('click', () => set_drawer_open(!is_drawer_open()));
    const new_button = ui_element('new-sheet');
    if (new_button) new_button.addEventListener('click', new_sheet_from_header);
    const backdrop = ui_element('drawer-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => set_drawer_open(false));

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && is_drawer_open()) {
            set_drawer_open(false);
            if (toggle) toggle.focus();
        }
    });
    if (typeof window.matchMedia === 'function') {
        const wide = window.matchMedia(WIDE_LAYOUT_QUERY);
        const on_change = () => { if (wide.matches) set_drawer_open(false); };
        if (typeof wide.addEventListener === 'function') wide.addEventListener('change', on_change);
    }
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('shortsaves-changed', render_shortsave_list);
    }
    render_shortsave_list();
}

if (typeof window !== 'undefined') {
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('storage', event => {
            if (event.storageArea && event.storageArea !== window.localStorage) return;
            if (event.key !== STORE_STORAGE_KEY && event.key !== null) return;
            // Read the shared store before rendering: rendering itself saves the sheet.
            const store = load_store();
            if (!store_write_blocked && !store_memory_only && active_shortsave_id &&
                !store.some(entry => entry.id === active_shortsave_id)) new_sheet();
            render_shortsave_list();
        });
    }
    window.onload = function () {
        handle_url_params();
        try {
            init_sidebar();
        } catch (error) {
            // The sidebar is optional; the sheet must keep calculating.
        }
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
    module.exports = { new_sheet, open_shortsave, delete_shortsave, list_shortsaves, ACTIVE_STORAGE_KEY, STORE_STORAGE_KEY, JoLine, JoSheet, classify_line, evaluate_sheet, handle_url_params, reset_sheet, SHEET_STORAGE_KEY, sheet_name, new_sheet_id, load_store, save_store };
}
