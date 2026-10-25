const assert = require('assert');
const { JoLine, JoSheet, load_store, list_shortsaves, new_sheet, open_shortsave,
    delete_shortsave, on_shortsaves_changed, SHEET_STORAGE_KEY, ACTIVE_STORAGE_KEY } = require('../../jotsum.js');

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
    const originalConfirm = window.confirm;
    try {
        run();
        console.log(`${name} passed!`);
    } finally {
        window.confirm = originalConfirm;
        global.document = originalDocument;
        window.localStorage.reset();
    }
}

// Raw line arrays and the DOM operations follow persistence.test.js's legacy fixture.
function type(f, text) {
    f.sheet.querySelectorAll()[0].textContent = text;
    f.sheet.update_total();
}

function twoSheets() {
    const f = fixture();
    window.onload();
    type(f, 'A 10');
    const a = list_shortsaves()[0].id;
    new_sheet();
    type(f, 'B 20');
    const b = list_shortsaves().find(entry => entry.active).id;
    return { f, a, b };
}

test('placeholder and whitespace do not create shortsaves; edits autosave with stable ids', () => {
    const f = fixture();
    window.onload();
    assert.deepStrictEqual(load_store(), []);
    type(f, '   ');
    assert.deepStrictEqual(load_store(), []);
    type(f, '# A');
    const id = list_shortsaves()[0].id;
    type(f, 'A 10');
    assert.strictEqual(list_shortsaves()[0].id, id);
    assert.strictEqual(list_shortsaves()[0].name, 'A 10');
    new_sheet();
    assert.deepStrictEqual(f.texts(), ['']);
    assert.strictEqual(load_store().length, 1);
    assert.ok(list_shortsaves().every(entry => !entry.active));
    type(f, 'B 20');
    assert.strictEqual(load_store().length, 2);
    assert.deepStrictEqual(load_store().map(entry => entry.lines), [['A 10'], ['B 20']]);
});

test('opening restores content and subsequent changes update exactly that entry', () => {
    const { f, a, b } = twoSheets();
    assert.strictEqual(open_shortsave(a), true);
    assert.deepStrictEqual(f.texts(), ['A 10']);
    type(f, 'A 30');
    assert.deepStrictEqual(load_store().find(entry => entry.id === a).lines, ['A 30']);
    assert.deepStrictEqual(load_store().find(entry => entry.id === b).lines, ['B 20']);
    assert.strictEqual(list_shortsaves().filter(entry => entry.active)[0].id, a);
});

test('reload retains the active association without duplicates', () => {
    const { a } = twoSheets();
    open_shortsave(a);
    const reloaded = fixture();
    window.onload();
    assert.deepStrictEqual(reloaded.texts(), ['A 10']);
    type(reloaded, 'A 40');
    assert.strictEqual(load_store().length, 2);
    assert.deepStrictEqual(load_store().find(entry => entry.id === a).lines, ['A 40']);
});

test('legacy migration assigns an active id and does not duplicate on reload', () => {
    window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['Legacy 5', '', 'Cost 2']));
    fixture();
    window.onload();
    const id = list_shortsaves()[0].id;
    const reloaded = fixture();
    window.onload();
    assert.deepStrictEqual(reloaded.texts(), ['Legacy 5', '', 'Cost 2']);
    assert.strictEqual(window.localStorage.getItem(ACTIVE_STORAGE_KEY), id);
    type(reloaded, 'Legacy 6');
    assert.strictEqual(load_store().length, 1);
    assert.strictEqual(load_store()[0].id, id);
});

test('URL content gets an independent id and preserves the previous shortsave', () => {
    const { a, b } = twoSheets();
    open_shortsave(a);
    const shared = fixture('?text=Shared%2050');
    window.onload();
    assert.deepStrictEqual(shared.texts(), ['Shared 50']);
    assert.strictEqual(load_store().length, 3);
    assert.deepStrictEqual(load_store().find(entry => entry.id === a).lines, ['A 10']);
    assert.ok(list_shortsaves().find(entry => entry.active).id !== a);
    assert.ok(list_shortsaves().find(entry => entry.active).id !== b);
});

test('cancelled deletion leaves storage and the visible sheet unchanged', () => {
    const { f, a } = twoSheets();
    const before = JSON.stringify(window.localStorage.data);
    window.confirm = () => false;
    assert.strictEqual(delete_shortsave(a), false);
    assert.strictEqual(JSON.stringify(window.localStorage.data), before);
    assert.deepStrictEqual(f.texts(), ['B 20']);
});

test('confirmed deletion removes only the chosen inactive entry', () => {
    const { f, a, b } = twoSheets();
    window.confirm = () => true;
    assert.strictEqual(delete_shortsave(a), true);
    assert.deepStrictEqual(load_store().map(entry => entry.id), [b]);
    assert.deepStrictEqual(f.texts(), ['B 20']);
    assert.strictEqual(list_shortsaves()[0].active, true);
});

test('deleting the active entry clears legacy content and never recreates it', () => {
    const { f, a, b } = twoSheets();
    window.confirm = () => true;
    delete_shortsave(b);
    assert.deepStrictEqual(f.texts(), ['']);
    assert.strictEqual(window.localStorage.getItem(SHEET_STORAGE_KEY), null);
    assert.strictEqual(window.localStorage.getItem(ACTIVE_STORAGE_KEY), null);
    f.sheet.update_total();
    const reloaded = fixture();
    window.onload();
    assert.deepStrictEqual(reloaded.texts(), ['']);
    assert.deepStrictEqual(load_store().map(entry => entry.id), [a]);
});

test('storage errors and malformed JSON do not interrupt calculations', () => {
    const f = fixture();
    window.onload();
    window.localStorage.setItem('jotsum.sheets', '{broken');
    type(f, 'Cost 2 * 5');
    assert.strictEqual(f.total.textContent, 10);
    for (const method of ['getItem', 'setItem', 'removeItem']) {
        const original = window.localStorage[method];
        try {
            window.localStorage[method] = () => { throw new Error('Storage unavailable'); };
            type(f, 'Cost 3 * 5');
            assert.strictEqual(f.total.textContent, 15);
        } finally {
            window.localStorage[method] = original;
        }
    }
});

test('store observers can subscribe and unsubscribe', () => {
    const f = fixture();
    window.onload();
    let calls = 0;
    const unsubscribe = on_shortsaves_changed(() => { calls++; });
    type(f, 'Cost 10');
    assert.ok(calls > 0);
    unsubscribe();
    const previous = calls;
    type(f, 'Cost 20');
    assert.strictEqual(calls, previous);
});
