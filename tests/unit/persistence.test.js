const assert = require('assert');
const { JoLine, JoSheet, handle_url_params, reset_sheet, SHEET_STORAGE_KEY } = require('../../jotsum.js');

// Supply only the DOM operations used by the real sheet and loading methods.
// Calculations, adding lines, saving and restoring all run production code.
function element(node, tagName) {
    node.tagName = tagName;
    node.textContent = '';
    const classes = new Set();
    node.classList = {
        contains: name => classes.has(name),
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name))
    };
    node.getAttribute = name => node.attributes[name] ?? null;
    node.removeAttribute = name => delete node.attributes[name];
    node.focus = () => {};
    return node;
}

function fixture(search = '') {
    const sheet = element(new JoSheet(), 'JO-SHEET');
    sheet.children = [];
    sheet.querySelectorAll = () => sheet.children.filter(node => node.tagName === 'JO-LINE');
    sheet.appendChild = node => {
        const previous = sheet.children[sheet.children.length - 1];
        if (previous) previous.nextElementSibling = node;
        sheet.children.push(node);
    };
    sheet.removeChild = node => sheet.children.splice(sheet.children.indexOf(node), 1);
    Object.defineProperty(sheet, 'firstChild', { get: () => sheet.children[0] });
    const total = element(new HTMLElement(), 'SPAN');
    global.document = {
        getElementById: id => id === 'sheet' ? sheet : total,
        createElement: tag => element(tag === 'jo-line' ? new JoLine() : new HTMLElement(), tag.toUpperCase()),
        addEventListener: () => {}
    };
    window.location = new URL('https://example.test/jotsum.html' + search);
    window.history = {
        replaceState: (_state, _title, url) => { window.location = new URL(url); }
    };
    return { sheet, total, texts: () => sheet.querySelectorAll().map(line => line.textContent) };
}

function test(name, run) {
    const originalDocument = global.document;
    window.localStorage.reset();
    try {
        run();
        console.log(`${name} passed!`);
    } finally {
        global.document = originalDocument;
        window.localStorage.reset();
    }
}

test('update_total saves raw line texts, including blank lines, and removes an empty sheet', () => {
    const { sheet, total } = fixture();
    ['  Cost 2 * 5  ', '', 'Notes'].forEach(text => {
        const line = element(new JoLine(), 'JO-LINE');
        line.textContent = text;
        sheet.appendChild(line);
    });
    sheet.update_total();
    assert.strictEqual(total.textContent, 10);
    assert.deepStrictEqual(JSON.parse(window.localStorage.getItem(SHEET_STORAGE_KEY)), ['  Cost 2 * 5  ', '', 'Notes']);
    sheet.querySelectorAll().forEach(line => { line.textContent = ''; });
    sheet.update_total();
    assert.strictEqual(window.localStorage.getItem(SHEET_STORAGE_KEY), null);
});

test('page load restores saved lines and recalculates their total', () => {
    window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify([':rate = 25', '', 'Work 2 * :rate']));
    const { texts, total } = fixture();
    window.onload();
    assert.deepStrictEqual(texts(), [':rate = 25', '', 'Work 2 * :rate']);
    assert.strictEqual(total.textContent, 50);
});

test('URL text wins over storage, preserves blanks and decodes exactly once', () => {
    window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['Saved 100']));
    const lines = ['Discount 10%', '', 'Literal %20 + 2', ''];
    const { texts } = fixture('?text=' + encodeURIComponent(lines.join('\n')));
    handle_url_params();
    assert.deepStrictEqual(texts(), lines);
    assert.deepStrictEqual(JSON.parse(window.localStorage.getItem(SHEET_STORAGE_KEY)), lines);
});

test('empty URL text wins over storage and removes the saved key', () => {
    window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['Saved 100']));
    const { texts, total } = fixture('?text=');
    handle_url_params();
    assert.deepStrictEqual(texts(), ['']);
    assert.strictEqual(total.textContent, 0);
    assert.strictEqual(window.localStorage.getItem(SHEET_STORAGE_KEY), null);
});

test('new page clears the sheet, saved key and URL text through the next load', () => {
    const { texts } = fixture('?keep=yes&text=Shared%2050#notes');
    handle_url_params();
    assert.deepStrictEqual(texts(), ['Shared 50']);
    assert.notStrictEqual(window.localStorage.getItem(SHEET_STORAGE_KEY), null);
    reset_sheet();
    assert.deepStrictEqual(texts(), ['']);
    assert.strictEqual(window.localStorage.getItem(SHEET_STORAGE_KEY), null);
    assert.strictEqual(window.location.search, '?keep=yes');
    assert.strictEqual(window.location.hash, '#notes');
    const reloaded = fixture(window.location.search + window.location.hash);
    window.onload();
    assert.deepStrictEqual(reloaded.texts(), ['']);
    assert.strictEqual(window.localStorage.getItem(SHEET_STORAGE_KEY), null);
});
