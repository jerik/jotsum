const assert = require('assert');
const { JoLine, JoSheet, handle_url_params, reset_sheet, SHEET_STORAGE_KEY,
    sheet_name, new_sheet_id, load_store, save_store, new_sheet, open_shortsave, delete_shortsave, list_shortsaves } = require('../../jotsum.js');

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


function edit(page, text) {
    page.sheet.querySelectorAll()[0].textContent = text;
    page.sheet.update_total();
}

test('automatic saves keep separate sheets, stable IDs and restored edits', () => {
    const page = fixture();
    window.onload();
    assert.strictEqual(load_store().length, 0);
    edit(page, 'A 10');
    const first = load_store()[0].id;
    edit(page, 'A 20');
    assert.strictEqual(load_store()[0].id, first);
    new_sheet();
    assert.strictEqual(load_store().length, 1);
    edit(page, 'B 30');
    assert.strictEqual(load_store().length, 2);
    open_shortsave(first);
    assert.deepStrictEqual(page.texts(), ['A 20']);
    edit(page, 'A 40');
    const reloaded = fixture();
    window.onload();
    assert.deepStrictEqual(reloaded.texts(), ['A 40']);
    assert.strictEqual(list_shortsaves().find(entry => entry.active).id, first);
    edit(reloaded, 'A 50');
    assert.strictEqual(load_store().length, 2);
    assert.deepStrictEqual(load_store().find(entry => entry.id === first).lines, ['A 50']);
});

test('legacy migration keeps its association across reloads', () => {
    window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(['Legacy 10']));
    fixture();
    window.onload();
    const id = load_store()[0].id;
    const page = fixture();
    window.onload();
    edit(page, 'Legacy 20');
    assert.strictEqual(load_store().length, 1);
    assert.strictEqual(load_store()[0].id, id);
});

test('shared URL reloads preserve edits and never duplicate or overwrite the previous sheet', () => {
    // Regression probe from PR #22: Shared 50 grew the store on every reload.
    const previous = fixture();
    window.onload();
    edit(previous, 'Previous 100');
    const old = load_store()[0];
    let page = fixture('?keep=yes&text=Shared%2050#notes');
    window.onload();
    const shared = list_shortsaves().find(entry => entry.active).id;
    assert.strictEqual(window.location.search, '?keep=yes');
    assert.strictEqual(window.location.hash, '#notes');
    edit(page, 'Shared 75');
    for (let reload = 0; reload < 2; reload++) {
        page = fixture(window.location.search + window.location.hash);
        window.onload();
        assert.deepStrictEqual(page.texts(), ['Shared 75']);
        assert.strictEqual(list_shortsaves().find(entry => entry.active).id, shared);
    }
    assert.strictEqual(load_store().length, 2);
    assert.deepStrictEqual(load_store().find(entry => entry.id === old.id), old);
});

test('deletion confirms, removes only the selected sheet and clears an active sheet permanently', () => {
    const page = fixture();
    window.onload();
    edit(page, 'A 10');
    const first = load_store()[0].id;
    new_sheet();
    edit(page, 'B 20');
    const second = list_shortsaves().find(entry => entry.active).id;
    window.confirm = () => false;
    delete_shortsave(first);
    assert.strictEqual(load_store().length, 2);
    window.confirm = () => true;
    delete_shortsave(first);
    assert.deepStrictEqual(load_store().map(entry => entry.id), [second]);
    assert.deepStrictEqual(page.texts(), ['B 20']);
    delete_shortsave(second);
    assert.deepStrictEqual(page.texts(), ['']);
    page.sheet.update_total();
    assert.deepStrictEqual(load_store(), []);
    assert.strictEqual(window.localStorage.getItem(SHEET_STORAGE_KEY), null);
    fixture();
    window.onload();
    assert.deepStrictEqual(load_store(), []);
});

test('storage read and write failures do not interrupt calculations', () => {
    const page = fixture();
    window.onload();
    const get = window.localStorage.getItem;
    const set = window.localStorage.setItem;
    try {
        window.localStorage.getItem = () => { throw new Error('Unavailable'); };
        window.localStorage.setItem = () => { throw new Error('Full'); };
        edit(page, 'Cost 2 * 5');
        assert.strictEqual(page.total.textContent, 10);
    } finally {
        window.localStorage.getItem = get;
        window.localStorage.setItem = set;
    }
});

test('invalid store JSON does not interrupt calculations', () => {
    window.localStorage.setItem('jotsum.sheets', '{broken');
    const page = fixture();
    window.onload();
    edit(page, 'Cost 15');
    assert.strictEqual(page.total.textContent, 15);
});
