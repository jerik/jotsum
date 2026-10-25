const assert = require('assert');
const { JoLine, JoSheet, load_store, SHEET_STORAGE_KEY, STORE_STORAGE_KEY } = require('../../jotsum.js');

// Same minimal DOM as shortsave.test.js: only what the sheet and page load use.
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

test('a shared link on fresh storage plus one edit leaves exactly one shortsave', () => {
    // The link from the bug report, as it arrives in a fresh browser.
    const page = fixture('?text=Rent%201200%0AFood%20300');
    window.onload();
    assert.deepStrictEqual(page.texts(), ['Rent 1200', 'Food 300']);
    page.sheet.querySelectorAll()[1].textContent = 'Food 350';
    page.sheet.update_total();
    const store = load_store();
    assert.strictEqual(store.length, 1);
    assert.deepStrictEqual(store[0].lines, ['Rent 1200', 'Food 350']);
    assert.strictEqual(page.total.textContent, 1550);
});

test('legacy content from before the page load is still migrated once', () => {
    window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['Old 10']));
    const page = fixture('?text=New%2020');
    window.onload();
    page.sheet.querySelectorAll()[0].textContent = 'New 30';
    page.sheet.update_total();
    assert.deepStrictEqual(load_store().map(entry => entry.lines), [['Old 10'], ['New 30']]);
});

test('a broken store is not overwritten by the page load', () => {
    window.localStorage.setItem(STORE_STORAGE_KEY, '{broken');
    fixture();
    window.onload();
    assert.strictEqual(window.localStorage.getItem(STORE_STORAGE_KEY), '{broken');
});
